-- Fix: converte tipo_plano/papel/status de enum nativo do Postgres pra
-- text + CHECK equivalente.
--
-- Por quê: o backend (SQLAlchemy) grava esses campos como string simples
-- via parâmetro vinculado (psycopg). Postgres NÃO faz cast implícito de um
-- parâmetro text/varchar pra um tipo enum customizado numa query
-- parametrizada (funciona com literal solto tipo `'FREE'` direto no SQL,
-- mas não com bind param) — toda escrita em `contas.tipo_plano`,
-- `contas_usuarios.papel` e `orcamentos.status` vinha derrubando a request
-- inteira com 500 ("column is of type X but expression is of type
-- character varying"). Texto + CHECK dá a mesma validação sem esse
-- problema.
--
-- Rode isto UMA VEZ no SQL Editor do Supabase, depois de já ter rodado
-- schema_contas.sql. Seguro rodar em conta/tabela já em uso: não há linhas
-- inválidas hoje porque toda tentativa de escrita nesses campos vinha
-- falhando (transação não commitada, nada parcial fica pra trás). Também
-- seguro rodar de novo (idempotente): usa DROP ... IF EXISTS / CREATE OR
-- REPLACE em tudo.

-- 1) get_meu_papel_conta() precisa mudar de tipo de retorno
--    (public.papel_conta -> text), e Postgres NÃO deixa `create or replace
--    function` trocar o tipo de retorno de uma função já existente — dá
--    erro 42P13 "cannot change return type of existing function". Precisa
--    dropar primeiro. E como a função é usada dentro de 3 RLS policies,
--    dropar sem CASCADE falharia também ("function ... depends on it") —
--    então derruba as 3 junto, e a gente recria todas elas no passo 4.
drop function if exists public.get_meu_papel_conta() cascade;

create function public.get_meu_papel_conta()
returns text
language sql
security definer
stable
set search_path = public
as $$
  select papel from public.contas_usuarios where id = auth.uid();
$$;

-- 2) Colunas enum -> text + CHECK
alter table public.contas
  alter column tipo_plano drop default,
  alter column tipo_plano type text using tipo_plano::text,
  alter column tipo_plano set default 'FREE';
alter table public.contas
  drop constraint if exists contas_tipo_plano_check;
alter table public.contas
  add constraint contas_tipo_plano_check check (tipo_plano in ('FREE', 'PRO', 'ENTERPRISE'));

alter table public.contas_usuarios
  alter column papel drop default,
  alter column papel type text using papel::text,
  alter column papel set default 'PROPRIETARIO';
alter table public.contas_usuarios
  drop constraint if exists contas_usuarios_papel_check;
alter table public.contas_usuarios
  add constraint contas_usuarios_papel_check check (papel in ('PROPRIETARIO', 'GESTOR', 'VENDEDOR'));

alter table public.orcamentos
  alter column status drop default,
  alter column status type text using status::text,
  alter column status set default 'ORCADO';
alter table public.orcamentos
  drop constraint if exists orcamentos_status_check;
alter table public.orcamentos
  add constraint orcamentos_status_check check (status in ('ORCADO', 'FECHADO'));

-- 3) Nenhuma coluna/função depende mais dos enums — drop seguro.
drop type if exists public.tipo_plano;
drop type if exists public.papel_conta;
drop type if exists public.status_orcamento;

-- 4) Recria as 3 policies derrubadas pelo CASCADE do passo 1 — texto
--    IDÊNTICO ao de schema_contas.sql, só a função por trás mudou de tipo.
drop policy if exists "gestor ou proprietario ve convites da propria conta" on public.convites;
create policy "gestor ou proprietario ve convites da propria conta"
  on public.convites for select
  using (
    conta_id = public.get_minha_conta()
    and public.get_meu_papel_conta() in ('GESTOR', 'PROPRIETARIO')
  );

drop policy if exists "gestor ve os orcamentos de toda a conta" on public.orcamentos;
create policy "gestor ve os orcamentos de toda a conta"
  on public.orcamentos for select
  using (
    conta_id = public.get_minha_conta()
    and public.get_meu_papel_conta() = 'GESTOR'
  );

drop policy if exists "dono ou gestor fecha o orcamento" on public.orcamentos;
create policy "dono ou gestor fecha o orcamento"
  on public.orcamentos for update
  using (
    usuario_id = auth.uid()
    or (conta_id = public.get_minha_conta() and public.get_meu_papel_conta() = 'GESTOR')
  )
  with check (
    usuario_id = auth.uid()
    or (conta_id = public.get_minha_conta() and public.get_meu_papel_conta() = 'GESTOR')
  );

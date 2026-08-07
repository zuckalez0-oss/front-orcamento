-- GeoQuote — Contas, Assinaturas e Times (Free / Pro / Enterprise)
--
-- Camada de identidade dos CLIENTES PAGANTES externos, separada de propósito
-- do RBAC interno da Lypsyos (`profiles`, ver schema.sql — não é tocado por
-- este arquivo). As duas convivem no mesmo projeto Supabase e na mesma
-- tabela `auth.users`, mas nenhuma conta/assinatura é criada automaticamente
-- por trigger aqui: o provisionamento (criar `contas` + `contas_usuarios`
-- na primeira vez que alguém loga pelo fluxo público) é feito pelo backend,
-- de propósito — ver `POST /contas/provisionar` em `main.py`. Um trigger em
-- `auth.users` não teria como distinguir "conta interna criada manualmente
-- pelo admin" de "cadastro público novo", e um trigger errado faria toda
-- conta interna da Lypsyos ganhar de graça uma assinatura Free (e ser
-- limitada a 10 orçamentos/dia) — o que quebraria o uso interno. Endpoint
-- autenticado resolve isso de forma explícita e testável.
--
-- Rode isto uma vez no SQL Editor do painel do seu projeto Supabase, depois
-- de já ter rodado schema.sql.

-- 1) tipo_plano/papel são TEXT + CHECK, não enum nativo do Postgres — de
--    propósito: o backend (SQLAlchemy) grava esses campos como string via
--    parâmetro vinculado (psycopg), e Postgres não faz cast implícito de
--    bind param pra um tipo enum customizado (só de literal solto no SQL),
--    o que derrubava toda escrita nessas colunas com 500. CHECK dá a mesma
--    validação sem esse problema (ver schema_contas_fix_enums.sql se você
--    rodou uma versão anterior deste arquivo que usava enum de verdade).

-- 2) Conta = entidade de assinatura/faturamento. Free/Pro têm 1 usuário
--    (PROPRIETARIO); Enterprise tem 1 GESTOR + N VENDEDORES convidados,
--    limitados por limite_vendedores.
create table public.contas (
  id                 uuid primary key default gen_random_uuid(),
  tipo_plano         text not null default 'FREE' check (tipo_plano in ('FREE', 'PRO', 'ENTERPRISE')),
  limite_vendedores  int,
  criado_em          timestamptz not null default now()
);

-- 3) Perfil de conta, 1:1 com auth.users — mas tabela própria, não reaproveita
--    `profiles` (que é só do RBAC interno ADMINISTRADOR/GERENTE/VENDEDOR).
create table public.contas_usuarios (
  id         uuid primary key references auth.users (id) on delete cascade,
  conta_id   uuid not null references public.contas (id) on delete cascade,
  papel      text not null default 'PROPRIETARIO' check (papel in ('PROPRIETARIO', 'GESTOR', 'VENDEDOR')),
  nome       text,
  foto_url   text,
  criado_em  timestamptz not null default now()
);

-- 4) Convite de vendedor (fluxo Enterprise: GESTOR gera um link, quem abre e
--    se cadastra entra na conta do GESTOR como VENDEDOR em vez de ganhar
--    conta própria). Token opaco, uso único.
create table public.convites (
  id          uuid primary key default gen_random_uuid(),
  conta_id    uuid not null references public.contas (id) on delete cascade,
  token       text not null unique,
  email       text,
  usado       boolean not null default false,
  criado_por  uuid references auth.users (id),
  criado_em   timestamptz not null default now()
);

alter table public.contas enable row level security;
alter table public.contas_usuarios enable row level security;
alter table public.convites enable row level security;

-- 5) Funções security definer p/ ler conta/papel do usuário chamador sem
--    recursão de RLS — mesmo padrão de get_my_role() em schema.sql.
create or replace function public.get_minha_conta()
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select conta_id from public.contas_usuarios where id = auth.uid();
$$;

create or replace function public.get_meu_papel_conta()
returns text
language sql
security definer
stable
set search_path = public
as $$
  select papel from public.contas_usuarios where id = auth.uid();
$$;

-- 6) Policies
create policy "membro ve a propria conta"
  on public.contas for select
  using (id = public.get_minha_conta());

create policy "membro ve os colegas da mesma conta"
  on public.contas_usuarios for select
  using (conta_id = public.get_minha_conta());

create policy "usuario cria o proprio registro de conta"
  on public.contas_usuarios for insert
  with check (auth.uid() = id);

create policy "usuario atualiza o proprio nome/foto"
  on public.contas_usuarios for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

create policy "gestor ou proprietario ve convites da propria conta"
  on public.convites for select
  using (
    conta_id = public.get_minha_conta()
    and public.get_meu_papel_conta() in ('GESTOR', 'PROPRIETARIO')
  );

-- Convites são criados pelo backend com a service_role key (que ignora RLS),
-- então não há policy de insert para o papel `anon`/`authenticated` aqui de
-- propósito — evita que qualquer usuário autenticado forje um convite pra
-- conta de outra pessoa direto pelo client Supabase.


-- ==========================================================================
-- Orçamentos: histórico + fechamento + notificação em tempo real (Fase 4)
-- ==========================================================================
-- Incluído já neste arquivo (rodar tudo de uma vez), mas só passa a ser
-- escrito pelo backend a partir da Fase 4 do plano de implementação.

create table public.orcamentos (
  id                  uuid primary key default gen_random_uuid(),
  conta_id            uuid not null references public.contas (id) on delete cascade,
  usuario_id          uuid not null references auth.users (id),
  cliente_nome        text,
  valor_venda_total   numeric,
  status              text not null default 'ORCADO' check (status in ('ORCADO', 'FECHADO')),
  -- Payload enviado + resultado devolvido por /calcular-orcamento, guardados
  -- como JSON — evita normalizar peça-a-peça numa tabela própria agora, e
  -- já permite reabrir/reexportar o PDF de um orçamento antigo depois.
  payload             jsonb not null,
  criado_em           timestamptz not null default now(),
  fechado_em          timestamptz
);

alter table public.orcamentos enable row level security;

create policy "usuario ve os proprios orcamentos"
  on public.orcamentos for select
  using (usuario_id = auth.uid());

create policy "gestor ve os orcamentos de toda a conta"
  on public.orcamentos for select
  using (
    conta_id = public.get_minha_conta()
    and public.get_meu_papel_conta() = 'GESTOR'
  );

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

-- Sem policy de insert para anon/authenticated: só o backend (service_role,
-- que ignora RLS) grava orçamentos nesta tabela — evita forjar orçamento
-- (e contagem de cota) direto pelo client Supabase.

-- Habilita o Realtime nesta tabela — é o que permite o painel do GESTOR
-- assinar mudanças (`supabase.channel(...).on('postgres_changes', ...)`) e
-- ser avisado no instante em que um vendedor marca um orçamento como
-- FECHADO, sem polling. A publicação `supabase_realtime` já existe por
-- padrão em todo projeto Supabase.
alter publication supabase_realtime add table public.orcamentos;


-- Contador de cota diária do plano Free (10 orçamentos/dia). Bookkeeping
-- interno do backend só — RLS habilitado sem nenhuma policy pra
-- anon/authenticated, ou seja, ninguém acessa isso pela API pública; só a
-- service_role key (usada pelo backend) enxerga.
create table public.uso_diario (
  usuario_id     uuid not null references auth.users (id),
  dia            date not null default current_date,
  qtd_orcamentos int not null default 0,
  primary key (usuario_id, dia)
);

alter table public.uso_diario enable row level security;

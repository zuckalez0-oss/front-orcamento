1-- GeoQuote — Perfis & RBAC (ADMINISTRADOR / GERENTE / VENDEDOR)
--
-- Rode isto uma vez no SQL Editor do painel do seu projeto Supabase
-- (Project > SQL Editor > New query). Não é aplicado automaticamente —
-- não há como este agente rodar isso remotamente sem as credenciais do
-- seu projeto.
--
-- Depois de rodar: crie os usuários manualmente em Authentication > Users
-- (login por e-mail/senha, sem autocadastro — decisão do projeto). O
-- trigger abaixo cria o perfil automaticamente com papel VENDEDOR; promova
-- quem precisar a ADMINISTRADOR/GERENTE com um UPDATE simples (exemplo no
-- final deste arquivo).

-- 1) Enum dos três níveis de autorização
create type public.user_role as enum ('ADMINISTRADOR', 'GERENTE', 'VENDEDOR');

-- 2) Tabela de perfis, 1:1 com auth.users
create table public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  nome       text,
  email      text,
  role       public.user_role not null default 'VENDEDOR',
  criado_em  timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- 3) Função security definer p/ ler o papel do usuário chamador sem
--    disparar as próprias policies de novo — evita recursão infinita de
--    RLS que aconteceria se a policy de "admin vê tudo" fizesse uma
--    subquery direta em profiles dentro da policy de profiles.
create or replace function public.get_my_role()
returns public.user_role
language sql
security definer
stable
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

-- 4) Policies
create policy "usuario le o proprio perfil"
  on public.profiles for select
  using (auth.uid() = id);

create policy "admin le todos os perfis"
  on public.profiles for select
  using (public.get_my_role() = 'ADMINISTRADOR');

create policy "usuario atualiza o proprio nome"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- 5) Trigger: toda conta nova em auth.users ganha uma linha em profiles
--    automaticamente, papel padrão VENDEDOR.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, nome, role)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'nome', new.email), 'VENDEDOR');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Exemplo: promover um usuário a ADMINISTRADOR depois que a conta já existir
-- (rode manualmente, trocando o e-mail):
--
-- update public.profiles set role = 'ADMINISTRADOR' where email = 'voce@empresa.com';

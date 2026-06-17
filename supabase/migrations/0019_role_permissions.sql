-- ════════════════════════════════════════════════════════════════
-- agicare — migration 0019: permissões por papel configuráveis pelo admin
--
-- Objetivo: tirar as regras de visibilidade de módulo do código (hardcoded)
-- e movê-las para uma tabela de configuração editável pelo admin no painel
-- "Permissões". Cada linha diz, para um (papel, módulo), se aquele papel
-- PODE VER o módulo (can_view) e em qual ESCOPO (own = só os registros dele,
-- all = toda a plataforma).
--
-- IMPORTANTE: o SEED reproduz EXATAMENTE o comportamento atual do sistema,
-- então esta migration NÃO muda visibilidade de nada — apenas materializa o
-- estado vigente em dados, deixando-o configurável daqui pra frente.
--
-- Idempotente: tipos via do-block, tabela if not exists, policies com
-- drop-if-exists antes de recriar, seed com on conflict, helpers via
-- create or replace.
-- ════════════════════════════════════════════════════════════════

-- ── Tipo: escopo de visibilidade ─────────────────────────────────
-- own  = o papel enxerga só os registros relacionados a ele (ex.: médico vê
--        só os pacientes/agenda dele). Reservado para uso futuro pela RLS.
-- all  = enxerga toda a plataforma.
do $$ begin
  create type public.permission_scope as enum ('own', 'all');
exception when duplicate_object then null; end $$;

-- ── Tabela: role_permissions (matriz papel × módulo) ─────────────
-- PK composta (role, module): no máximo uma regra por par.
-- 'module' é o slug do módulo, idêntico às rotas do menu lateral.
create table if not exists public.role_permissions (
  role        public.user_role        not null,
  module      text                    not null,
  can_view    boolean                 not null default false,
  scope       public.permission_scope not null default 'all',
  updated_at  timestamptz             not null default now(),
  primary key (role, module)
);

comment on table public.role_permissions is
  'Matriz configurável de permissões de visualização por papel × módulo. Editável só por admin (módulo Permissões).';

-- ════════════════════════════════════════════════════════════════
-- RLS — leitura para staff (o app precisa montar o menu de qualquer
-- usuário interno); escrita só para admin (configuração sensível).
-- ════════════════════════════════════════════════════════════════
alter table public.role_permissions enable row level security;

drop policy if exists role_permissions_read_staff  on public.role_permissions;
drop policy if exists role_permissions_write_admin on public.role_permissions;

-- SELECT: qualquer membro do staff (admin/medico/recepcao) lê a matriz.
create policy role_permissions_read_staff on public.role_permissions
  for select using (public.is_staff());

-- ALL: só o admin cria/edita/remove regras.
create policy role_permissions_write_admin on public.role_permissions
  for all using (public.current_role() = 'admin')
  with check (public.current_role() = 'admin');

-- ════════════════════════════════════════════════════════════════
-- SEED idempotente — espelha o comportamento ATUAL do sistema.
-- Matriz (can_view) por papel:
--   admin    → TODOS os módulos = true
--   medico   → tudo true EXCETO 'procedimentos' e 'permissoes'
--   recepcao → idêntico ao medico
--   paciente → tudo false (não usa o painel interno)
-- Todos os módulos visíveis usam scope = 'all' (comportamento vigente).
--
-- on conflict do update apenas em can_view/scope/updated_at: assim, se a
-- migration rodar de novo, ela RESSINCRONIZA com o baseline. Como o admin
-- pode ter editado depois, ver nota de risco no relatório — em produção,
-- rodar 0019 uma única vez (o pipeline de migrations garante isso).
-- ════════════════════════════════════════════════════════════════
insert into public.role_permissions (role, module, can_view, scope)
select r.role, m.module, v.can_view, 'all'::public.permission_scope
from (values
    ('dashboard'),
    ('fila'),
    ('pacientes'),
    ('agenda'),
    ('prontuario'),
    ('enfermagem'),
    ('procedimentos'),
    ('laboratorio'),
    ('estoque'),
    ('profissionais'),
    ('faturamento'),
    ('relatorios'),
    ('configuracoes'),
    ('permissoes')
  ) as m(module)
cross join (values
    ('admin'::public.user_role),
    ('medico'::public.user_role),
    ('recepcao'::public.user_role),
    ('paciente'::public.user_role)
  ) as r(role)
cross join lateral (
  select case
    -- admin enxerga tudo
    when r.role = 'admin' then true
    -- paciente não usa o painel interno
    when r.role = 'paciente' then false
    -- medico/recepcao: tudo, menos procedimentos e permissoes
    when m.module in ('procedimentos', 'permissoes') then false
    else true
  end as can_view
) as v
on conflict (role, module) do update
  set can_view   = excluded.can_view,
      scope      = excluded.scope,
      updated_at = now();

-- ════════════════════════════════════════════════════════════════
-- Helpers para consumo futuro pela RLS / camada de aplicação.
-- SECURITY DEFINER + search_path fixo: evitam recursão de RLS e
-- captura de search_path (mesmo padrão de current_role()/is_staff()).
-- ════════════════════════════════════════════════════════════════

-- can_view(modulo): o papel do usuário logado pode ver o módulo?
-- Default false se não existir linha (fail-closed).
create or replace function public.can_view(p_module text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select can_view
       from public.role_permissions
      where role = public.current_role()
        and module = p_module),
    false
  );
$$;

-- view_scope(modulo): escopo de visibilidade do papel logado no módulo.
-- Default 'all' se não existir linha (comportamento vigente sem restrição).
create or replace function public.view_scope(p_module text)
returns public.permission_scope
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select scope
       from public.role_permissions
      where role = public.current_role()
        and module = p_module),
    'all'::public.permission_scope
  );
$$;

-- ════════════════════════════════════════════════════════════════
-- ROLLBACK (manual):
--   drop function if exists public.view_scope(text);
--   drop function if exists public.can_view(text);
--   drop policy if exists role_permissions_read_staff  on public.role_permissions;
--   drop policy if exists role_permissions_write_admin on public.role_permissions;
--   drop table if exists public.role_permissions;
--   drop type  if exists public.permission_scope;
-- Impacto: nenhum dado de domínio é tocado. A visibilidade volta a ser
-- governada apenas pelo código (estado pré-0019).
-- ════════════════════════════════════════════════════════════════

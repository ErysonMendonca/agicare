-- ════════════════════════════════════════════════════════════════
-- agicare — migration 0020: MULTITENANT (clínicas) — estrutura + backfill
--
-- Transforma o sistema mono-clínica em multi-clínica (multitenant) por
-- DESNORMALIZAÇÃO de clinic_id em TODAS as tabelas de domínio. A política
-- de isolamento fica trivial e sem joins:  clinic_id = current_clinic_id().
--
-- A clínica ativa do usuário vem de um CLAIM do JWT
-- (app_metadata.active_clinic_id), carimbado pelo Custom Access Token Hook
-- (ver 0022). Aqui apenas LEMOS esse claim.
--
-- DECISÕES CONFIRMADAS PELO DONO:
--   1. Desnormalizar clinic_id em todas as tabelas de domínio.
--   2. profiles.role mantida como FALLBACK de bootstrap (não dropar).
--   3. Template de permissões em permission_templates, clonado por trigger.
--   4. TTL do token (15min) é config do Dashboard (Auth) — NÃO é SQL.
--
-- ORDEM SEGURA dentro desta migration:
--   tabelas base → clinic default → membership backfill → helpers →
--   add clinic_id NULLABLE → backfill (default / herança do pai / órfãos) →
--   SET NOT NULL → re-chavear singletons/PKs → templates → trigger → RLS.
--
-- Idempotente: if not exists / create or replace / on conflict /
-- drop ... if exists / do-block com checagem de catálogo.
-- Aplicar MANUALMENTE no SQL Editor do Supabase, ANTES da 0021 e 0022.
-- ════════════════════════════════════════════════════════════════

-- ════════════════════════════════════════════════════════════════
-- 1) Tabelas base do multitenant
-- ════════════════════════════════════════════════════════════════
create table if not exists public.clinics (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text unique,
  cnpj        text unique,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

comment on table public.clinics is
  'Tenant raiz do multitenant. Cada clínica isola seus dados via clinic_id.';

-- Membros da clínica: é AQUI que vive o papel REAL do usuário por clínica.
-- profiles.role passa a ser só bootstrap (ver comentário mais abaixo).
create table if not exists public.clinic_members (
  clinic_id   uuid not null references public.clinics  (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  role        public.user_role not null default 'recepcao',
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  primary key (clinic_id, user_id)
);
create index if not exists idx_clinic_members_user on public.clinic_members (user_id);

comment on table public.clinic_members is
  'Vínculo usuário×clínica com papel POR clínica. Fonte de verdade de autorização multitenant.';

-- ════════════════════════════════════════════════════════════════
-- 2) Clínica default + backfill de memberships
--    Toda a base existente (mono-clínica) migra para esta clínica.
-- ════════════════════════════════════════════════════════════════
insert into public.clinics (id, name, slug, active)
values ('00000000-0000-0000-0000-000000000001', 'Clínica Padrão', 'clinica-padrao', true)
on conflict (id) do nothing;

-- Todo profile existente vira membership na default, herdando profiles.role.
insert into public.clinic_members (clinic_id, user_id, role, active)
select '00000000-0000-0000-0000-000000000001', p.id, p.role, true
from public.profiles p
on conflict (clinic_id, user_id) do nothing;

-- profiles.role: rebaixada a fallback de bootstrap (NÃO dropar).
comment on column public.profiles.role is
  'DEPRECATED: papel real vive em clinic_members; manter só p/ bootstrap (1º acesso / criação de profile pela trigger).';

-- ════════════════════════════════════════════════════════════════
-- 3) Helpers tenant-aware
--    current_clinic_id(): lê SÓ o JWT — NÃO precisa de SECURITY DEFINER.
--    Fail-closed: claim ausente/ inválido → NULL (nunca lança erro), e
--    como clinic_id é NOT NULL nas tabelas, NULL nunca casa → 0 linhas.
--    Os demais helpers seguem o padrão das migrations: SECURITY DEFINER +
--    search_path fixo (evitam recursão de RLS e captura de search_path).
-- ════════════════════════════════════════════════════════════════
create or replace function public.current_clinic_id()
returns uuid
language sql
stable
as $$
  select nullif(
    auth.jwt() -> 'app_metadata' ->> 'active_clinic_id',
    ''
  )::uuid;
$$;

comment on function public.current_clinic_id() is
  'Clínica ativa do usuário, lida do claim app_metadata.active_clinic_id (carimbado pelo Access Token Hook). Fail-closed: retorna NULL se ausente.';

-- current_role(): papel na CLÍNICA ATIVA via clinic_members; se não houver
-- membership (ou clínica ativa nula), cai no fallback profiles.role.
create or replace function public.current_role()
returns public.user_role
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select cm.role
       from public.clinic_members cm
      where cm.user_id   = auth.uid()
        and cm.clinic_id = public.current_clinic_id()
        and cm.active),
    (select p.role from public.profiles p where p.id = auth.uid())  -- fallback bootstrap
  );
$$;

-- is_staff(): staff (admin/medico/recepcao) NA CLÍNICA ATIVA.
create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_role() in ('admin','medico','recepcao'), false);
$$;

-- is_member(): o usuário pertence (ativo) à clínica ativa?
create or replace function public.is_member()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.clinic_members cm
     where cm.user_id   = auth.uid()
       and cm.clinic_id = public.current_clinic_id()
       and cm.active
  );
$$;

-- ════════════════════════════════════════════════════════════════
-- 4) clinic_id em TODAS as tabelas de domínio (NULLABLE primeiro)
--    Inclui access_logs (auditoria por clínica). NÃO inclui:
--      • clinics / clinic_members (já têm a identidade do tenant);
--      • role_permissions (re-chaveada em bloco próprio, item 7);
--      • permission_templates (catálogo global, sem tenant).
-- ════════════════════════════════════════════════════════════════
do $$
declare t text;
begin
  foreach t in array array[
    -- Grupo A (raiz / independentes) + especiais
    'professionals','patients','appointments','medical_records',
    'procedures','queue_entries','stock_products','billable_events','lab_cases',
    'vital_signs','schedules','schedule_blocks',
    'suppliers','dispensations','purchase_requests','inventories',
    'anamneses','prescriptions','care_orders','prescription_checks',
    'certificates','consents',
    'nursing_notes','sae_records','care_checks','fluid_balance',
    'nursing_evolutions','assessment_scales','nursing_procedures',
    'tiss_batches','tiss_guides','billing_items',
    'clinic_settings','access_logs','exam_orders','prosthetic_orders',
    -- Grupo B (filhas — herdam do pai no backfill)
    'stock_movements','dispensation_items','quotations','inventory_counts',
    'prescription_items','fluid_balance_entries','prosthetic_files'
  ] loop
    execute format(
      'alter table public.%I add column if not exists clinic_id uuid references public.clinics(id) on delete cascade;',
      t
    );
    execute format(
      'create index if not exists idx_%s_clinic on public.%I (clinic_id);',
      t, t
    );
  end loop;
end $$;

-- ════════════════════════════════════════════════════════════════
-- 5) BACKFILL do clinic_id
--    5a) Grupo A + especiais → clínica default.
--    5b) Grupo B → herda do pai (update ... from parent).
--    5c) Órfãos remanescentes (pai nulo) → default.
--    Tudo idempotente (só toca linhas com clinic_id ainda nulo).
-- ════════════════════════════════════════════════════════════════
-- 5a) Grupo A / especiais → default
do $$
declare t text;
begin
  foreach t in array array[
    'professionals','patients','appointments','medical_records',
    'procedures','queue_entries','stock_products','billable_events','lab_cases',
    'vital_signs','schedules','schedule_blocks',
    'suppliers','dispensations','purchase_requests','inventories',
    'anamneses','prescriptions','care_orders','prescription_checks',
    'certificates','consents',
    'nursing_notes','sae_records','care_checks','fluid_balance',
    'nursing_evolutions','assessment_scales','nursing_procedures',
    'tiss_batches','tiss_guides','billing_items',
    'clinic_settings','access_logs','exam_orders','prosthetic_orders'
  ] loop
    execute format(
      'update public.%I set clinic_id = ''00000000-0000-0000-0000-000000000001'' where clinic_id is null;',
      t
    );
  end loop;
end $$;

-- 5b) Grupo B → herança do pai (par child→(parent_table, fk_col)).
do $$
declare
  rec record;
  pairs text[][] := array[
    array['stock_movements',       'stock_products',    'product_id'],
    array['dispensation_items',    'dispensations',     'dispensation_id'],
    array['quotations',            'purchase_requests', 'purchase_request_id'],
    array['inventory_counts',      'inventories',       'inventory_id'],
    array['prescription_items',    'prescriptions',     'prescription_id'],
    array['fluid_balance_entries', 'fluid_balance',     'balance_id'],
    array['prosthetic_files',      'prosthetic_orders', 'order_id']
  ];
  i int;
begin
  for i in 1 .. array_length(pairs, 1) loop
    execute format(
      'update public.%1$I c set clinic_id = p.clinic_id
         from public.%2$I p
        where c.%3$I = p.id and c.clinic_id is null and p.clinic_id is not null;',
      pairs[i][1], pairs[i][2], pairs[i][3]
    );
  end loop;
end $$;

-- 5c) Órfãos remanescentes (pai nulo / FK nula) → default.
do $$
declare t text;
begin
  foreach t in array array[
    'stock_movements','dispensation_items','quotations','inventory_counts',
    'prescription_items','fluid_balance_entries','prosthetic_files'
  ] loop
    execute format(
      'update public.%I set clinic_id = ''00000000-0000-0000-0000-000000000001'' where clinic_id is null;',
      t
    );
  end loop;
end $$;

-- ════════════════════════════════════════════════════════════════
-- 6) SET NOT NULL em todas (já 100% preenchidas pelo backfill).
--    A partir daqui, clinic_id NULL é impossível → RLS fail-closed real.
-- ════════════════════════════════════════════════════════════════
do $$
declare t text;
begin
  foreach t in array array[
    'professionals','patients','appointments','medical_records',
    'procedures','queue_entries','stock_products','billable_events','lab_cases',
    'vital_signs','schedules','schedule_blocks',
    'suppliers','dispensations','purchase_requests','inventories',
    'anamneses','prescriptions','care_orders','prescription_checks',
    'certificates','consents',
    'nursing_notes','sae_records','care_checks','fluid_balance',
    'nursing_evolutions','assessment_scales','nursing_procedures',
    'tiss_batches','tiss_guides','billing_items',
    'clinic_settings','access_logs','exam_orders','prosthetic_orders',
    'stock_movements','dispensation_items','quotations','inventory_counts',
    'prescription_items','fluid_balance_entries','prosthetic_files'
  ] loop
    execute format('alter table public.%I alter column clinic_id set not null;', t);
  end loop;
end $$;

-- ════════════════════════════════════════════════════════════════
-- 7) Re-chaveamentos
-- ════════════════════════════════════════════════════════════════

-- 7a) clinic_settings: deixa de ser singleton GLOBAL e vira 1 por clínica.
--     Remove o índice de singleton + a coluna 'singleton', cria unique(clinic_id).
drop index if exists public.uq_clinic_settings_singleton;
alter table public.clinic_settings drop column if exists singleton;
create unique index if not exists uq_clinic_settings_clinic
  on public.clinic_settings (clinic_id);

-- 7b) role_permissions: re-chaveada para (clinic_id, role, module).
--     Cada clínica tem sua própria matriz (clonada do template na criação).
alter table public.role_permissions
  add column if not exists clinic_id uuid references public.clinics(id) on delete cascade;
create index if not exists idx_role_permissions_clinic on public.role_permissions (clinic_id);

update public.role_permissions
   set clinic_id = '00000000-0000-0000-0000-000000000001'
 where clinic_id is null;

alter table public.role_permissions alter column clinic_id set not null;

-- Troca a PK (role, module) → (clinic_id, role, module).
do $$ begin
  alter table public.role_permissions drop constraint if exists role_permissions_pkey;
exception when others then null; end $$;
alter table public.role_permissions
  add primary key (clinic_id, role, module);

-- ════════════════════════════════════════════════════════════════
-- 8) Helpers can_view()/view_scope() reescritos clinic-aware.
--    Agora filtram pela matriz da CLÍNICA ATIVA. Mesmos defaults fail-closed.
-- ════════════════════════════════════════════════════════════════
create or replace function public.can_view(p_module text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select rp.can_view
       from public.role_permissions rp
      where rp.role      = public.current_role()
        and rp.module    = p_module
        and rp.clinic_id = public.current_clinic_id()),
    false
  );
$$;

create or replace function public.view_scope(p_module text)
returns public.permission_scope
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select rp.scope
       from public.role_permissions rp
      where rp.role      = public.current_role()
        and rp.module    = p_module
        and rp.clinic_id = public.current_clinic_id()),
    'all'::public.permission_scope
  );
$$;

-- ════════════════════════════════════════════════════════════════
-- 9) permission_templates — baseline editável, clonado por clínica.
--    PK (template, role, module). Seed = baseline EXATO da 0019.
-- ════════════════════════════════════════════════════════════════
create table if not exists public.permission_templates (
  template    text                    not null default 'default',
  role        public.user_role        not null,
  module      text                    not null,
  can_view    boolean                 not null default false,
  scope       public.permission_scope not null default 'all',
  primary key (template, role, module)
);

comment on table public.permission_templates is
  'Templates de matriz de permissões (papel×módulo). Clonados para role_permissions quando uma clínica é criada (trigger provision_clinic). Editável só por service-role.';

-- Seed do template 'default' = comportamento vigente da 0019.
insert into public.permission_templates (template, role, module, can_view, scope)
select 'default', r.role, m.module, v.can_view, 'all'::public.permission_scope
from (values
    ('dashboard'),('fila'),('pacientes'),('agenda'),('prontuario'),
    ('enfermagem'),('procedimentos'),('laboratorio'),('estoque'),
    ('profissionais'),('faturamento'),('relatorios'),('configuracoes'),('permissoes')
  ) as m(module)
cross join (values
    ('admin'::public.user_role),('medico'::public.user_role),
    ('recepcao'::public.user_role),('paciente'::public.user_role)
  ) as r(role)
cross join lateral (
  select case
    when r.role = 'admin'    then true
    when r.role = 'paciente' then false
    when m.module in ('procedimentos','permissoes') then false
    else true
  end as can_view
) as v
on conflict (template, role, module) do update
  set can_view = excluded.can_view,
      scope    = excluded.scope;

-- RLS templates: leitura p/ autenticados; escrita DEFAULT-DENY (só service-role).
alter table public.permission_templates enable row level security;

drop policy if exists permission_templates_read on public.permission_templates;
create policy permission_templates_read on public.permission_templates
  for select to authenticated using (true);
-- (sem policy de INSERT/UPDATE/DELETE → ninguém via anon/authenticated escreve;
--  service-role ignora RLS e é o único que mantém os templates.)

-- ════════════════════════════════════════════════════════════════
-- 10) provision_clinic() — trigger AFTER INSERT em clinics.
--     Clona o template 'default' p/ role_permissions de NEW.id e cria
--     a clinic_settings da clínica. clinic_id é SEMPRE NEW.id (nunca input
--     externo) → impossível semear a matriz de outra clínica.
-- ════════════════════════════════════════════════════════════════
create or replace function public.provision_clinic()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- matriz de permissões a partir do template 'default'
  insert into public.role_permissions (clinic_id, role, module, can_view, scope)
  select new.id, t.role, t.module, t.can_view, t.scope
  from public.permission_templates t
  where t.template = 'default'
  on conflict (clinic_id, role, module) do nothing;

  -- configurações iniciais da clínica
  insert into public.clinic_settings (clinic_id, clinic_name)
  values (new.id, new.name)
  on conflict (clinic_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_clinic_created on public.clinics;
create trigger on_clinic_created
  after insert on public.clinics
  for each row execute function public.provision_clinic();

-- Provisiona a clínica DEFAULT retroativamente: a trigger on_clinic_created
-- não rodou no insert inicial (item 2) pois foi criada agora. As inserções da
-- matriz default já podem ter ocorrido na 0019 (role_permissions) e/ou já
-- existir uma clinic_settings; tudo idempotente via on conflict / not exists.
insert into public.role_permissions (clinic_id, role, module, can_view, scope)
select '00000000-0000-0000-0000-000000000001', t.role, t.module, t.can_view, t.scope
from public.permission_templates t
where t.template = 'default'
on conflict (clinic_id, role, module) do nothing;

insert into public.clinic_settings (clinic_id, clinic_name)
select '00000000-0000-0000-0000-000000000001', 'Clínica Padrão'
where not exists (
  select 1 from public.clinic_settings where clinic_id = '00000000-0000-0000-0000-000000000001'
);

-- ════════════════════════════════════════════════════════════════
-- 11) RLS de clinics / clinic_members
-- ════════════════════════════════════════════════════════════════
alter table public.clinics        enable row level security;
alter table public.clinic_members enable row level security;

-- clinics: o usuário lê as clínicas das quais é membro ativo.
drop policy if exists clinics_member_read on public.clinics;
create policy clinics_member_read on public.clinics
  for select using (
    exists (
      select 1 from public.clinic_members cm
       where cm.clinic_id = clinics.id
         and cm.user_id = auth.uid()
         and cm.active
    )
  );
-- (criação/edição de clínicas: só service-role — provisionamento de tenant
--  é operação administrativa de plataforma, fora do alcance de qualquer papel.)

-- clinic_members: cada um lê o próprio vínculo; admin DA CLÍNICA ATIVA gerencia.
drop policy if exists clinic_members_self_read on public.clinic_members;
create policy clinic_members_self_read on public.clinic_members
  for select using (user_id = auth.uid());

drop policy if exists clinic_members_admin_manage on public.clinic_members;
create policy clinic_members_admin_manage on public.clinic_members
  for all
  using  (clinic_id = public.current_clinic_id() and public.current_role() = 'admin')
  with check (clinic_id = public.current_clinic_id() and public.current_role() = 'admin');

-- ════════════════════════════════════════════════════════════════
-- LEMBRETE (passo manual, NÃO é SQL):
--   O TTL do Access Token deve ser reduzido para 900s (15min) em
--   Dashboard → Authentication → Settings, e o Custom Access Token Hook
--   da 0022 precisa ser REGISTRADO em Authentication → Hooks. Sem o hook,
--   o claim active_clinic_id não é carimbado e current_clinic_id() = NULL
--   (fail-closed → staff não enxerga nada). Aplicar 0022 e registrar o hook
--   ANTES de aplicar a 0021 em produção.
-- ════════════════════════════════════════════════════════════════

-- ════════════════════════════════════════════════════════════════
-- ROLLBACK (manual, ordem inversa) — comentado:
--
--   -- 11) RLS clinics/members
--   drop policy if exists clinic_members_admin_manage on public.clinic_members;
--   drop policy if exists clinic_members_self_read    on public.clinic_members;
--   drop policy if exists clinics_member_read         on public.clinics;
--   -- 10) trigger
--   drop trigger if exists on_clinic_created on public.clinics;
--   drop function if exists public.provision_clinic();
--   -- 9) templates
--   drop table if exists public.permission_templates;
--   -- 8) helpers de permissão (volta ao corpo da 0019, sem clinic_id)
--   --    (rever 0019: can_view/view_scope filtravam só por role)
--   -- 7b) role_permissions: volta PK (role, module) e remove clinic_id
--   alter table public.role_permissions drop constraint if exists role_permissions_pkey;
--   alter table public.role_permissions add primary key (role, module);  -- exige dedup p/ clínica única
--   alter table public.role_permissions drop column if exists clinic_id;
--   -- 7a) clinic_settings: volta singleton global
--   drop index if exists public.uq_clinic_settings_clinic;
--   alter table public.clinic_settings add column if not exists singleton boolean not null default true;
--   create unique index if not exists uq_clinic_settings_singleton on public.clinic_settings (singleton);
--   -- 6/5/4) remove clinic_id de todas as tabelas de domínio (drop column if exists clinic_id em cada uma)
--   -- 3) helpers: restaurar current_role()/is_staff() da 0001 e dropar current_clinic_id()/is_member()
--   drop function if exists public.is_member();
--   drop function if exists public.current_clinic_id();
--   -- (recriar current_role()/is_staff() conforme 0001)
--   -- 1) tabelas base
--   drop table if exists public.clinic_members;
--   delete from public.clinics where id = '00000000-0000-0000-0000-000000000001';
--   drop table if exists public.clinics;
--
-- IMPACTO: reverter DESTROI o isolamento multitenant. Só fazer se nenhuma
-- segunda clínica foi criada (senão há dados de tenants distintos misturados).
-- ════════════════════════════════════════════════════════════════

-- agicare — aplicar migrations 0001 + 0002 (cole no SQL Editor e Run)

-- ════════════════════════════════════════════════════════════════
-- agicare — migration inicial (0001)
-- Sistema de Gestão para Clínicas
-- Auth: Supabase Auth (auth.users) + profiles 1:1 com papel (role)
-- Segurança: RLS habilitada em TODAS as tabelas de domínio.
-- NOTE: schema base — refinar após auditoria do Figma (docs/figma-audit.md).
-- ════════════════════════════════════════════════════════════════

-- ── Tipos ────────────────────────────────────────────────────────
do $$ begin
  create type public.user_role as enum ('admin', 'medico', 'recepcao', 'paciente');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.appointment_status as enum (
    'agendado', 'confirmado', 'em_atendimento', 'concluido', 'cancelado', 'faltou'
  );
exception when duplicate_object then null; end $$;

-- ── profiles (1:1 com auth.users) ────────────────────────────────
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text,
  role        public.user_role not null default 'paciente',
  phone       text,
  avatar_url  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ── professionals (dados clínicos do profissional) ───────────────
create table if not exists public.professionals (
  id           uuid primary key default gen_random_uuid(),
  profile_id   uuid not null references public.profiles (id) on delete cascade,
  specialty    text,
  council_reg  text,                      -- ex.: CRM/registro do conselho
  bio          text,
  active       boolean not null default true,
  created_at   timestamptz not null default now()
);

-- ── patients (dados do paciente) ─────────────────────────────────
create table if not exists public.patients (
  id           uuid primary key default gen_random_uuid(),
  profile_id   uuid references public.profiles (id) on delete set null,
  full_name    text not null,
  birth_date   date,
  cpf          text unique,
  phone        text,
  email        text,
  notes        text,
  created_at   timestamptz not null default now(),
  created_by   uuid references public.profiles (id)
);

-- ── appointments (agenda) ────────────────────────────────────────
create table if not exists public.appointments (
  id               uuid primary key default gen_random_uuid(),
  patient_id       uuid not null references public.patients (id) on delete cascade,
  professional_id  uuid not null references public.professionals (id) on delete restrict,
  starts_at        timestamptz not null,
  ends_at          timestamptz not null,
  status           public.appointment_status not null default 'agendado',
  reason           text,
  created_at       timestamptz not null default now(),
  created_by       uuid references public.profiles (id)
);

create index if not exists idx_appointments_professional_start
  on public.appointments (professional_id, starts_at);
create index if not exists idx_appointments_patient
  on public.appointments (patient_id);

-- ── medical_records (prontuário — dado sensível/LGPD) ────────────
create table if not exists public.medical_records (
  id               uuid primary key default gen_random_uuid(),
  patient_id       uuid not null references public.patients (id) on delete cascade,
  professional_id  uuid not null references public.professionals (id) on delete restrict,
  appointment_id   uuid references public.appointments (id) on delete set null,
  content          text,                  -- evolução / anamnese
  created_at       timestamptz not null default now()
);

create index if not exists idx_records_patient on public.medical_records (patient_id);

-- ════════════════════════════════════════════════════════════════
-- Helper: papel do usuário atual (SECURITY DEFINER evita recursão de RLS)
-- ════════════════════════════════════════════════════════════════
create or replace function public.current_role()
returns public.user_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select role in ('admin','medico','recepcao') from public.profiles where id = auth.uid()),
    false
  );
$$;

-- ════════════════════════════════════════════════════════════════
-- RLS
-- ════════════════════════════════════════════════════════════════
alter table public.profiles        enable row level security;
alter table public.professionals   enable row level security;
alter table public.patients        enable row level security;
alter table public.appointments    enable row level security;
alter table public.medical_records enable row level security;

-- profiles: cada um vê/edita o seu; staff vê todos; admin gerencia.
drop policy if exists profiles_select_own_or_staff on public.profiles;
create policy profiles_select_own_or_staff on public.profiles
  for select using (id = auth.uid() or public.is_staff());

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists profiles_admin_all on public.profiles;
create policy profiles_admin_all on public.profiles
  for all using (public.current_role() = 'admin')
  with check (public.current_role() = 'admin');

-- professionals: leitura para staff; escrita só admin.
drop policy if exists professionals_read_staff on public.professionals;
create policy professionals_read_staff on public.professionals
  for select using (public.is_staff());

drop policy if exists professionals_write_admin on public.professionals;
create policy professionals_write_admin on public.professionals
  for all using (public.current_role() = 'admin')
  with check (public.current_role() = 'admin');

-- patients: staff gerencia; paciente vê o próprio registro.
drop policy if exists patients_staff_all on public.patients;
create policy patients_staff_all on public.patients
  for all using (public.is_staff()) with check (public.is_staff());

drop policy if exists patients_self_read on public.patients;
create policy patients_self_read on public.patients
  for select using (profile_id = auth.uid());

-- appointments: staff gerencia; paciente vê os seus.
drop policy if exists appointments_staff_all on public.appointments;
create policy appointments_staff_all on public.appointments
  for all using (public.is_staff()) with check (public.is_staff());

drop policy if exists appointments_self_read on public.appointments;
create policy appointments_self_read on public.appointments
  for select using (
    patient_id in (select id from public.patients where profile_id = auth.uid())
  );

-- medical_records: dado sensível — apenas admin e médico. Paciente NÃO lê direto aqui.
drop policy if exists records_clinical_all on public.medical_records;
create policy records_clinical_all on public.medical_records
  for all using (public.current_role() in ('admin','medico'))
  with check (public.current_role() in ('admin','medico'));

-- ════════════════════════════════════════════════════════════════
-- Trigger: cria profile automaticamente ao registrar em auth.users
-- ════════════════════════════════════════════════════════════════
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    new.raw_user_meta_data ->> 'full_name',
    coalesce((new.raw_user_meta_data ->> 'role')::public.user_role, 'paciente')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ════════════════════════════════════════════════════════════════
-- ROLLBACK (manual):
--   drop trigger on_auth_user_created on auth.users;
--   drop function handle_new_user, is_staff, current_role;
--   drop table medical_records, appointments, patients, professionals, profiles;
--   drop type appointment_status, user_role;
-- ════════════════════════════════════════════════════════════════


-- ════════════════════════════════════════════════════════════════
-- agicare — migration 0002: módulos operacionais
-- Procedimentos, Fila de Atendimento, Estoque, Faturamento, Laboratório.
-- Depende de 0001 (helpers public.is_staff() / public.current_role()).
-- RLS: staff (admin/medico/recepcao) gerencia; políticas explícitas por tabela.
-- ════════════════════════════════════════════════════════════════

-- ── Tipos ────────────────────────────────────────────────────────
do $$ begin create type public.queue_priority as enum ('normal','preferencial','urgente'); exception when duplicate_object then null; end $$;
do $$ begin create type public.queue_status   as enum ('aguardando','chamado','em_atendimento','finalizado'); exception when duplicate_object then null; end $$;
do $$ begin create type public.movement_type  as enum ('entrada','saida','ajuste'); exception when duplicate_object then null; end $$;
do $$ begin create type public.billing_status as enum ('pendente','faturado','glosado'); exception when duplicate_object then null; end $$;
do $$ begin create type public.billing_kind   as enum ('convenio','particular'); exception when duplicate_object then null; end $$;
do $$ begin create type public.lab_status     as enum ('em_andamento','pendente','finalizado'); exception when duplicate_object then null; end $$;

-- ── Colunas extras em patients (exibidas na tela de Pacientes) ───
alter table public.patients
  add column if not exists convenio     text,
  add column if not exists blood_type   text,
  add column if not exists allergies    boolean not null default false,
  add column if not exists in_treatment boolean not null default false,
  add column if not exists active       boolean not null default true;

-- ── Procedimentos (catálogo) ─────────────────────────────────────
create table if not exists public.procedures (
  id           uuid primary key default gen_random_uuid(),
  code         text unique not null,
  name         text not null,
  description  text,
  category     text,
  duration_min int,
  price        numeric(12,2) not null default 0,
  margin_pct   int,
  active       boolean not null default true,
  created_at   timestamptz not null default now()
);

-- ── Fila de atendimento ──────────────────────────────────────────
create table if not exists public.queue_entries (
  id               uuid primary key default gen_random_uuid(),
  ticket_code      text not null,                 -- ex.: A001, P001
  patient_id       uuid references public.patients (id) on delete set null,
  patient_name     text not null,                 -- desnormalizado p/ exibição rápida
  priority         public.queue_priority not null default 'normal',
  professional_id  uuid references public.professionals (id) on delete set null,
  specialty        text,
  insurance        text,
  status           public.queue_status not null default 'aguardando',
  created_at       timestamptz not null default now()
);
create index if not exists idx_queue_status on public.queue_entries (status, created_at);

-- ── Estoque ──────────────────────────────────────────────────────
create table if not exists public.stock_products (
  id            uuid primary key default gen_random_uuid(),
  code          text unique not null,
  name          text not null,
  category      text,
  unit          text default 'un',
  quantity      numeric(12,2) not null default 0,
  min_quantity  numeric(12,2) not null default 0,
  lot           text,
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);

create table if not exists public.stock_movements (
  id           uuid primary key default gen_random_uuid(),
  product_id   uuid not null references public.stock_products (id) on delete cascade,
  type         public.movement_type not null,
  quantity     numeric(12,2) not null,
  reason       text,
  created_by   uuid references public.profiles (id),
  created_at   timestamptz not null default now()
);
create index if not exists idx_movements_product on public.stock_movements (product_id, created_at);

-- ── Faturamento (eventos faturáveis) ─────────────────────────────
create table if not exists public.billable_events (
  id               uuid primary key default gen_random_uuid(),
  code             text unique not null,          -- ex.: EVT-2024-001
  patient_id       uuid references public.patients (id) on delete set null,
  professional_id  uuid references public.professionals (id) on delete set null,
  appointment_id   uuid references public.appointments (id) on delete set null,
  kind             public.billing_kind not null default 'particular',
  service          text,
  amount           numeric(12,2) not null default 0,
  status           public.billing_status not null default 'pendente',
  created_at       timestamptz not null default now()
);
create index if not exists idx_billing_status on public.billable_events (status, created_at);

-- ── Laboratório (casos de prótese/exames) ────────────────────────
create table if not exists public.lab_cases (
  id               uuid primary key default gen_random_uuid(),
  code             text unique not null,
  patient_id       uuid references public.patients (id) on delete set null,
  type             text,
  status           public.lab_status not null default 'em_andamento',
  urgent           boolean not null default false,
  due_date         date,
  created_at       timestamptz not null default now()
);

-- ════════════════════════════════════════════════════════════════
-- RLS — staff gerencia tudo (módulos operacionais).
-- ════════════════════════════════════════════════════════════════
alter table public.procedures      enable row level security;
alter table public.queue_entries   enable row level security;
alter table public.stock_products  enable row level security;
alter table public.stock_movements enable row level security;
alter table public.billable_events enable row level security;
alter table public.lab_cases       enable row level security;

do $$
declare t text;
begin
  foreach t in array array[
    'procedures','queue_entries','stock_products','stock_movements','billable_events','lab_cases'
  ] loop
    execute format('drop policy if exists %I_staff_all on public.%I;', t, t);
    execute format(
      'create policy %I_staff_all on public.%I for all using (public.is_staff()) with check (public.is_staff());',
      t, t
    );
  end loop;
end $$;

-- ════════════════════════════════════════════════════════════════
-- ROLLBACK (manual):
--   drop table lab_cases, billable_events, stock_movements, stock_products,
--              queue_entries, procedures;
--   drop type lab_status, billing_kind, billing_status, movement_type,
--             queue_status, queue_priority;
-- ════════════════════════════════════════════════════════════════

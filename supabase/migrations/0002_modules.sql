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

-- ════════════════════════════════════════════════════════════════
-- agicare — migration 0008: módulo Enfermagem (Fase 4)
-- Anotações, Checagem de Cuidados, Balanço Hídrico, Evolução,
-- Escalas de Avaliação, Procedimentos e SAE (NANDA).
-- Aférições de Sinais Vitais reutilizam public.vital_signs (0004).
-- Depende de 0001 (public.is_staff()) e 0002/0004 (patients, professionals).
-- RLS: staff gerencia tudo (dado assistencial de enfermagem).
-- Idempotente: create table if not exists / drop policy if exists.
-- ════════════════════════════════════════════════════════════════

-- ── Tipos ────────────────────────────────────────────────────────
do $$ begin create type public.care_check_status as enum ('pendente','administrado','aprazado'); exception when duplicate_object then null; end $$;
do $$ begin create type public.fluid_kind        as enum ('ganho','perda'); exception when duplicate_object then null; end $$;
do $$ begin create type public.scale_kind        as enum ('glasgow','fugulin','braden'); exception when duplicate_object then null; end $$;

-- ── Anotação de Enfermagem ───────────────────────────────────────
create table if not exists public.nursing_notes (
  id               uuid primary key default gen_random_uuid(),
  code             text not null,                 -- ex.: ANO-001
  patient_id       uuid references public.patients (id) on delete set null,
  professional_id  uuid references public.professionals (id) on delete set null,
  professional_name text,                          -- desnormalizado p/ exibição
  content          text not null,
  created_at       timestamptz not null default now()
);
create index if not exists idx_nursing_notes_created on public.nursing_notes (created_at desc);

-- ── SAE (NANDA) — diagnóstico + fator + prescrição ───────────────
create table if not exists public.sae_records (
  id               uuid primary key default gen_random_uuid(),
  patient_id       uuid references public.patients (id) on delete set null,
  professional_id  uuid references public.professionals (id) on delete set null,
  coren            text,
  nanda_diagnosis  text not null,                 -- Diagnóstico NANDA
  related_factor   text,                          -- Fator relacionado
  prescription     text not null,                 -- Prescrição de enfermagem
  frequency_hours  int not null default 6,        -- gera horários na checagem
  created_at       timestamptz not null default now()
);
create index if not exists idx_sae_created on public.sae_records (created_at desc);

-- ── Checagem de Cuidados (horários gerados pela SAE/manuais) ──────
create table if not exists public.care_checks (
  id               uuid primary key default gen_random_uuid(),
  sae_id           uuid references public.sae_records (id) on delete cascade,
  patient_id       uuid references public.patients (id) on delete set null,
  description      text not null,                 -- cuidado a checar
  scheduled_at     timestamptz not null,          -- horário aprazado
  status           public.care_check_status not null default 'pendente',
  justification    text,                          -- obrigatório se não administrado
  professional_id  uuid references public.professionals (id) on delete set null,
  professional_name text,
  checked_at       timestamptz,
  created_at       timestamptz not null default now()
);
create index if not exists idx_care_checks_sched on public.care_checks (scheduled_at);

-- ── Balanço Hídrico (ciclo 24h) + lançamentos (ganhos/perdas) ────
create table if not exists public.fluid_balance (
  id               uuid primary key default gen_random_uuid(),
  patient_id       uuid references public.patients (id) on delete cascade,
  cycle_start      timestamptz not null default now(),
  cycle_end        timestamptz,
  closed           boolean not null default false,
  created_at       timestamptz not null default now()
);
create index if not exists idx_fluid_balance_patient on public.fluid_balance (patient_id, cycle_start desc);

create table if not exists public.fluid_balance_entries (
  id               uuid primary key default gen_random_uuid(),
  balance_id       uuid not null references public.fluid_balance (id) on delete cascade,
  kind             public.fluid_kind not null,    -- 'ganho' (entrada) | 'perda' (saída)
  description      text not null,                 -- ex.: Soro fisiológico, Diurese
  volume_ml        numeric(8,2) not null default 0,
  recorded_at      timestamptz not null default now(),
  professional_id  uuid references public.professionals (id) on delete set null,
  professional_name text
);
create index if not exists idx_fluid_entries_balance on public.fluid_balance_entries (balance_id, recorded_at);

-- ── Evolução de Enfermagem (Avaliação/Reavaliação/Conduta) ───────
create table if not exists public.nursing_evolutions (
  id               uuid primary key default gen_random_uuid(),
  patient_id       uuid references public.patients (id) on delete set null,
  professional_id  uuid references public.professionals (id) on delete set null,
  professional_name text,
  coren            text,
  assessment       text,                          -- Avaliação
  reassessment     text,                          -- Reavaliação
  conduct          text,                          -- Conduta
  created_at       timestamptz not null default now()
);
create index if not exists idx_nursing_evol_created on public.nursing_evolutions (created_at desc);

-- ── Escalas de Avaliação (Glasgow/Fugulin/Braden) ────────────────
create table if not exists public.assessment_scales (
  id               uuid primary key default gen_random_uuid(),
  patient_id       uuid references public.patients (id) on delete set null,
  professional_id  uuid references public.professionals (id) on delete set null,
  professional_name text,
  scale            public.scale_kind not null,
  score            int not null default 0,
  classification   text,
  details          jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now()
);
create index if not exists idx_assessment_scales_created on public.assessment_scales (created_at desc);

-- ── Procedimentos de Enfermagem (TUSS) ───────────────────────────
create table if not exists public.nursing_procedures (
  id               uuid primary key default gen_random_uuid(),
  patient_id       uuid references public.patients (id) on delete set null,
  professional_id  uuid references public.professionals (id) on delete set null,
  professional_name text,
  tuss_code        text,
  name             text not null,
  materials        text,
  body_site        text,                          -- local do corpo
  notes            text,
  performed_at     timestamptz not null default now(),
  created_at       timestamptz not null default now()
);
create index if not exists idx_nursing_proc_created on public.nursing_procedures (created_at desc);

-- ════════════════════════════════════════════════════════════════
-- RLS — staff (admin/medico/recepcao) gerencia tudo.
-- ════════════════════════════════════════════════════════════════
alter table public.nursing_notes         enable row level security;
alter table public.sae_records           enable row level security;
alter table public.care_checks           enable row level security;
alter table public.fluid_balance         enable row level security;
alter table public.fluid_balance_entries enable row level security;
alter table public.nursing_evolutions    enable row level security;
alter table public.assessment_scales     enable row level security;
alter table public.nursing_procedures    enable row level security;

do $$
declare t text;
begin
  foreach t in array array[
    'nursing_notes','sae_records','care_checks','fluid_balance',
    'fluid_balance_entries','nursing_evolutions','assessment_scales','nursing_procedures'
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
--   drop table nursing_procedures, assessment_scales, nursing_evolutions,
--              fluid_balance_entries, fluid_balance, care_checks,
--              sae_records, nursing_notes;
--   drop type scale_kind, fluid_kind, care_check_status;
-- ════════════════════════════════════════════════════════════════

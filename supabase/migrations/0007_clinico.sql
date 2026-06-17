-- ════════════════════════════════════════════════════════════════
-- agicare — migration 0007: módulo CLÍNICO do prontuário (Fase 3)
-- Anamnese dinâmica, Prescrição (medicamentos + cuidados), Checagem,
-- Atestados/Altas e Consentimentos LGPD.
-- Depende de 0001 (medical_records, helpers is_staff()/current_role()),
-- 0002 (stock_products) e 0004 (vital_signs).
-- Dado clínico sensível (LGPD): RLS restrita a admin/médico (espelha medical_records do 0001).
-- Idempotente: create table if not exists / drop policy if exists.
-- Aplicar no SQL Editor do Supabase.
-- ════════════════════════════════════════════════════════════════

-- ── Anamnese (motor dinâmico por especialidade) ──────────────────
-- `fields` jsonb guarda os campos dinâmicos (Histórico Geral + módulo da especialidade).
create table if not exists public.anamneses (
  id               uuid primary key default gen_random_uuid(),
  patient_id       uuid not null references public.patients (id) on delete cascade,
  professional_id  uuid references public.professionals (id) on delete set null,
  specialty        text not null,                 -- especialidade da ficha (gera quem é da especialidade)
  fields           jsonb not null default '{}'::jsonb,
  consent_given    boolean not null default false,
  signature        text,                          -- assinatura digital (texto)
  created_at       timestamptz not null default now()
);
create index if not exists idx_anamneses_patient on public.anamneses (patient_id, created_at desc);

-- ── Prescrição médica ────────────────────────────────────────────
create table if not exists public.prescriptions (
  id               uuid primary key default gen_random_uuid(),
  patient_id       uuid not null references public.patients (id) on delete cascade,
  professional_id  uuid references public.professionals (id) on delete set null,
  notes            text,
  created_at       timestamptz not null default now()
);
create index if not exists idx_prescriptions_patient on public.prescriptions (patient_id, created_at desc);

-- Itens de medicamento (auto-complete do estoque traz nome + concentração).
create table if not exists public.prescription_items (
  id               uuid primary key default gen_random_uuid(),
  prescription_id  uuid not null references public.prescriptions (id) on delete cascade,
  product_id       uuid references public.stock_products (id) on delete set null,
  name             text not null,
  concentration    text,
  posology         text,
  duration         text,
  frequency        text,
  observations     text,
  created_at       timestamptz not null default now()
);
create index if not exists idx_prescription_items_presc on public.prescription_items (prescription_id);

-- Cuidados (menu pré-definido + frequência e duração).
create table if not exists public.care_orders (
  id               uuid primary key default gen_random_uuid(),
  prescription_id  uuid references public.prescriptions (id) on delete cascade,
  patient_id       uuid not null references public.patients (id) on delete cascade,
  name             text not null,
  frequency        text,
  duration         text,
  observations     text,
  created_at       timestamptz not null default now()
);
create index if not exists idx_care_orders_patient on public.care_orders (patient_id, created_at desc);

-- ── Checagem (medicamentos e cuidados com frequência geram aprazamentos) ──
create table if not exists public.prescription_checks (
  id               uuid primary key default gen_random_uuid(),
  patient_id       uuid not null references public.patients (id) on delete cascade,
  prescription_id  uuid references public.prescriptions (id) on delete cascade,
  source_type      text not null,                 -- 'medicamento' | 'cuidado'
  source_label     text not null,                 -- ex.: 'Dipirona 500mg' / 'Curativo'
  frequency        text,
  scheduled_at     timestamptz not null,
  status           text not null default 'pendente', -- 'pendente' | 'checado'
  checked_at       timestamptz,
  checked_by       uuid references public.profiles (id),
  created_at       timestamptz not null default now()
);
create index if not exists idx_checks_patient on public.prescription_checks (patient_id, scheduled_at);

-- ── Atestados e Altas ────────────────────────────────────────────
-- kind = 'atestado' | 'alta'. CID-10 é OPCIONAL (LGPD).
create table if not exists public.certificates (
  id               uuid primary key default gen_random_uuid(),
  patient_id       uuid not null references public.patients (id) on delete cascade,
  professional_id  uuid references public.professionals (id) on delete set null,
  kind             text not null,
  days             integer,                       -- atestado: dias de afastamento
  start_date       date,                          -- atestado: início
  end_date         date,                          -- atestado: fim
  diagnosis        text,                          -- diagnóstico (texto livre)
  cid10            text,                          -- OPCIONAL por LGPD
  reason           text,                          -- alta: motivo
  post_discharge   text,                          -- alta: orientações pós-alta
  created_at       timestamptz not null default now()
);
create index if not exists idx_certificates_patient on public.certificates (patient_id, created_at desc);

-- ── Consentimentos LGPD ──────────────────────────────────────────
create table if not exists public.consents (
  id               uuid primary key default gen_random_uuid(),
  patient_id       uuid not null references public.patients (id) on delete cascade,
  professional_id  uuid references public.professionals (id) on delete set null,
  context          text not null,                 -- ex.: 'anamnese'
  accepted         boolean not null default false,
  signature        text,
  created_at       timestamptz not null default now()
);
create index if not exists idx_consents_patient on public.consents (patient_id, created_at desc);

-- ════════════════════════════════════════════════════════════════
-- RLS — dado clínico sensível: apenas admin e médico (espelha medical_records).
-- ════════════════════════════════════════════════════════════════
do $$
declare t text;
begin
  foreach t in array array[
    'anamneses','prescriptions','prescription_items','care_orders',
    'prescription_checks','certificates','consents'
  ] loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('drop policy if exists %I_clinical_all on public.%I;', t, t);
    execute format(
      'create policy %I_clinical_all on public.%I for all using (public.current_role() in (''admin'',''medico'')) with check (public.current_role() in (''admin'',''medico''));',
      t, t
    );
  end loop;
end $$;

-- ════════════════════════════════════════════════════════════════
-- ROLLBACK (manual):
--   drop table consents, certificates, prescription_checks, care_orders,
--              prescription_items, prescriptions, anamneses;
-- ════════════════════════════════════════════════════════════════

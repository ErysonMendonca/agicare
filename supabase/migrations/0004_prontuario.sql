-- 0004_prontuario.sql
-- Fase 2 — Prontuário eletrônico: identificação ampliada + sinais vitais.
-- Aplicar no SQL Editor do Supabase.

-- 1) Identificação ampliada do paciente.
alter table public.patients
  add column if not exists mother_name   text,
  add column if not exists gender        text,        -- 'masculino' | 'feminino' | 'outro'
  add column if not exists manual_record text;         -- Histórico: prontuário manual anexado

-- 2) Sinais vitais (aferições ao longo do tempo).
create table if not exists public.vital_signs (
  id           uuid primary key default gen_random_uuid(),
  patient_id   uuid not null references public.patients (id) on delete cascade,
  recorded_at  timestamptz not null default now(),
  systolic     integer,        -- PA sistólica (mmHg)
  diastolic    integer,        -- PA diastólica (mmHg)
  heart_rate   integer,        -- FC (bpm)
  resp_rate    integer,        -- FR (irpm)
  temperature  numeric(4,1),   -- Tax (°C)
  weight       numeric(5,2),   -- Peso (kg)
  height       numeric(4,2),   -- Altura (m)
  spo2         integer,        -- SpO2 (%)
  glucose      integer,        -- HGT (mg/dL)
  notes        text,
  recorded_by  uuid references public.profiles (id),
  created_at   timestamptz not null default now()
);
create index if not exists idx_vital_signs_patient
  on public.vital_signs (patient_id, recorded_at desc);

-- 3) RLS: dado clínico → apenas staff clínico (admin/médico/recepção lê; admin/médico é quem afere).
alter table public.vital_signs enable row level security;

drop policy if exists vital_signs_staff_all on public.vital_signs;
create policy vital_signs_staff_all on public.vital_signs
  for all using (public.is_staff()) with check (public.is_staff());

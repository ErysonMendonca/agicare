-- ════════════════════════════════════════════════════════════════
-- agicare — migration 0057: número de prontuário sequencial por clínica
--
-- Cada paciente passa a ter um NÚMERO DE PRONTUÁRIO legível e sequencial DENTRO
-- da clínica (1, 2, 3, …), distinto do `id` (uuid) e do CPF. Exibido na lista de
-- pacientes. Atribuído automaticamente no cadastro; pacientes já existentes são
-- numerados por ordem de criação (backfill).
--
-- Aditiva e idempotente. DEPENDE de: 0001 (patients), 0020 (patients.clinic_id).
-- NÃO APLICADA automaticamente — aplicar via scripts/migrate.mjs.
-- ════════════════════════════════════════════════════════════════

-- 1) Coluna do número de prontuário (nullable; preenchida por backfill + trigger).
alter table public.patients
  add column if not exists record_number integer;

-- 2) Backfill: numera os pacientes SEM número, sequencial por clínica, na ordem
--    de cadastro (created_at; id como desempate). Idempotente (só toca nos null).
with numbered as (
  select id,
         row_number() over (
           partition by clinic_id
           order by created_at, id
         ) as rn
  from public.patients
  where record_number is null
)
update public.patients p
set record_number = n.rn
from numbered n
where p.id = n.id;

-- 3) Atribuição automática no INSERT: próximo número da clínica (max + 1).
--    Lock advisory por clínica evita corrida entre cadastros simultâneos.
create or replace function public.set_patient_record_number()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.record_number is null then
    perform pg_advisory_xact_lock(
      hashtext('patients_record_number:' || coalesce(new.clinic_id::text, 'null'))
    );
    select coalesce(max(record_number), 0) + 1
      into new.record_number
      from public.patients
     where clinic_id is not distinct from new.clinic_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_set_patient_record_number on public.patients;
create trigger trg_set_patient_record_number
  before insert on public.patients
  for each row execute function public.set_patient_record_number();

-- 4) Unicidade do número dentro da clínica.
create unique index if not exists uq_patients_clinic_record_number
  on public.patients (clinic_id, record_number);

-- ════════════════════════════════════════════════════════════════
-- ROLLBACK (manual):
--   drop trigger if exists trg_set_patient_record_number on public.patients;
--   drop function if exists public.set_patient_record_number();
--   drop index if exists public.uq_patients_clinic_record_number;
--   alter table public.patients drop column if exists record_number;
--
-- IMPACTO: aditivo. Numeração estável por clínica; novos cadastros recebem o
-- próximo número automaticamente.
-- ════════════════════════════════════════════════════════════════

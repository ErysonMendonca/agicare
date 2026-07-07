-- ════════════════════════════════════════════════════════════════
-- agicare — migration 0094: escala única por especialidade e TIPO DE SERVIÇO
--
-- Atualiza a restrição de exclusão para incluir service_type, permitindo
-- que uma mesma clínica tenha (por exemplo) uma escala de "Consulta"
-- e outra de "Procedimento" para a MESMA especialidade e no mesmo período.
--
-- Aditiva e idempotente. DEPENDE de: 0067 (escala_unica_especialidade).
-- ════════════════════════════════════════════════════════════════

do $$
begin
  -- 1) Remove a constraint antiga que ignorava service_type
  alter table public.schedules
    drop constraint if exists schedules_no_overlap;

  -- 2) Cria a nova constraint incluindo service_type (coalesce para evitar null em gist)
  if not exists (
    select 1 from pg_constraint where conname = 'schedules_no_overlap_v2'
  ) then
    alter table public.schedules
      add constraint schedules_no_overlap_v2
      exclude using gist (
        clinic_id with =,
        specialty with =,
        coalesce(service_type, '') with =,
        daterange(start_date, end_date, '[]') with &&
      )
      where (
        active
        and specialty is not null
        and start_date is not null
        and end_date is not null
      );
  end if;
end $$;

-- ════════════════════════════════════════════════════════════════
-- Rollback (manual):
--   alter table public.schedules drop constraint if exists schedules_no_overlap_v2;
-- ════════════════════════════════════════════════════════════════

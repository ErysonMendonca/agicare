-- ════════════════════════════════════════════════════════════════
-- agicare — migration 0054: itens da escala (exames/procedimentos)
-- Quando o "Tipo de Escala" (service_type) é Exame ou Procedimento, a
-- escala passa a guardar QUAIS itens atende:
--   - procedure_codes: códigos de procedures (procedures.code)
--   - exam_tuss_codes: códigos TUSS de exames (catálogo EXAMES_TUSS)
-- Colunas aditivas, com default → compatível com escalas existentes.
-- RLS herdada de public.schedules (0005/0021). Idempotente.
-- ════════════════════════════════════════════════════════════════

alter table public.schedules
  add column if not exists procedure_codes text[] not null default '{}',
  add column if not exists exam_tuss_codes text[] not null default '{}';

comment on column public.schedules.procedure_codes is
  'Códigos de procedimentos (procedures.code) que a escala atende, quando service_type = Procedimento.';
comment on column public.schedules.exam_tuss_codes is
  'Códigos TUSS de exames que a escala atende, quando service_type = Exame.';

-- ════════════════════════════════════════════════════════════════
-- Rollback (manual):
--   alter table public.schedules
--     drop column if exists procedure_codes,
--     drop column if exists exam_tuss_codes;
-- ════════════════════════════════════════════════════════════════

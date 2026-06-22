-- ════════════════════════════════════════════════════════════════
-- agicare — migration 0055: vigência da escala (data inicial/final)
-- A escala passa a ter um período de validade. A geração de horários
-- (listSlots / listSlotsBySpecialty) só considera a escala quando a data
-- alvo cai dentro de [start_date, end_date].
--   - Colunas NULL = sem limite (escalas antigas seguem válidas sempre).
--   - No app, datas são obrigatórias ao criar/editar (validação na action+UI).
-- RLS herdada de public.schedules (0005/0021). Idempotente.
-- ════════════════════════════════════════════════════════════════

alter table public.schedules
  add column if not exists start_date date,
  add column if not exists end_date date;

comment on column public.schedules.start_date is
  'Início da vigência da escala (inclusive). NULL = sem limite inferior.';
comment on column public.schedules.end_date is
  'Fim da vigência da escala (inclusive). NULL = sem limite superior.';

-- ════════════════════════════════════════════════════════════════
-- Rollback (manual):
--   alter table public.schedules
--     drop column if exists start_date,
--     drop column if exists end_date;
-- ════════════════════════════════════════════════════════════════

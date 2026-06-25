-- ════════════════════════════════════════════════════════════════
-- agicare — migration 0059: bloqueio recorrente (fixo) na escala
-- Além dos bloqueios por DATA específica (schedule_blocks), a escala passa
-- a guardar bloqueios FIXOS/RECORRENTES: horários sempre indisponíveis em
-- todos os dias da própria escala (ex.: intervalo de almoço).
--   - recurring_blocks: jsonb array de { "time": "HH:mm", "reason": text }.
--   - Aplica-se aos weekdays da escala, dentro da vigência.
--   - A geração de horários (listSlots) marca esses horários como ocupados.
-- Coluna aditiva, com default → compatível com escalas existentes.
-- RLS herdada de public.schedules (0005/0021). Idempotente.
-- ════════════════════════════════════════════════════════════════

alter table public.schedules
  add column if not exists recurring_blocks jsonb not null default '[]'::jsonb;

comment on column public.schedules.recurring_blocks is
  'Bloqueios fixos/recorrentes da escala: jsonb array de { time: "HH:mm", reason }. Valem em todos os dias da escala, na vigência. Diferente de schedule_blocks (por data específica).';

-- ════════════════════════════════════════════════════════════════
-- Rollback (manual):
--   alter table public.schedules drop column if exists recurring_blocks;
-- ════════════════════════════════════════════════════════════════

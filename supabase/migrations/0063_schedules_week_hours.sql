-- ════════════════════════════════════════════════════════════════
-- agicare — migration 0063: horário próprio por dia da semana na escala
--
-- Hoje uma escala tem `weekdays int[]` + UM ÚNICO `start_time`/`end_time`
-- aplicado a todos os dias. Esta coluna permite, NUMA MESMA ESCALA, horário
-- PRÓPRIO por dia da semana (ex.: segunda 08:00–13:00, terça 08:00–18:00).
--
-- Formato do `week_hours` (jsonb):
--   {
--     "1": { "start": "08:00", "end": "13:00" },   -- segunda
--     "2": { "start": "08:00", "end": "18:00" }    -- terça
--   }
--   Chave = dia da semana ("0"=Dom … "6"=Sáb, igual a getDay()).
--   Só entram os dias com horário PRÓPRIO. Dias em `weekdays` sem entrada
--   aqui usam o `start_time`/`end_time` base — logo escalas existentes
--   (week_hours = '{}') seguem funcionando com horário uniforme.
--
-- Aditiva e idempotente. DEPENDE de: 0005/0021 (schedules), 0055 (vigência).
-- RLS herdada de public.schedules (sem novas políticas).
-- NÃO APLICADA automaticamente — aplicar via scripts/migrate.mjs.
-- ════════════════════════════════════════════════════════════════

alter table public.schedules
  add column if not exists week_hours jsonb not null default '{}'::jsonb;

comment on column public.schedules.week_hours is
  'Horário próprio por dia da semana. Objeto {"0".."6": {"start":"HH:MM","end":"HH:MM"}}; só os dias com horário diferente do base (start_time/end_time). Vazio = horário uniforme.';

-- ════════════════════════════════════════════════════════════════
-- Rollback (manual):
--   alter table public.schedules drop column if exists week_hours;
-- ════════════════════════════════════════════════════════════════

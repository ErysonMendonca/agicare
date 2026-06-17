-- ════════════════════════════════════════════════════════════════
-- agicare — migration 0047: check-in real em public.appointments
--
-- starts_at é o horário AGENDADO (planejado). Para medir o "tempo médio
-- de espera real" da agenda/fila precisamos do momento em que o paciente
-- de fato chegou e fez check-in na recepção/fila. Adicionamos a coluna
-- check_in (timestamptz NULL) para isso — NULL = paciente ainda não chegou.
--
-- A espera real de um atendimento passa a ser derivável no app/BI como
-- (started_at|called_at − check_in) ou similar, sem depender de starts_at.
--
-- queue_entries já tem arrived_at (0015) p/ o totem; check_in fica no
-- appointment para relatórios por período/profissional/clínica direto na
-- agenda, sem join obrigatório com a fila. O backend deve carimbar AMBOS
-- de forma coerente no check-in (ver HANDOFF no rodapé).
--
-- Aditiva e idempotente (IF NOT EXISTS). NÃO mexe em RLS: a coluna herda
-- as policies de appointments (0001 + 0021, já amarradas a clinic_id) —
-- RLS no Postgres é por LINHA, não por coluna, então nada a ajustar.
-- DEPENDE de: 0001 (appointments), 0020 (clinic_id em appointments).
-- NÃO APLICADA automaticamente — aplicar via scripts/migrate.mjs.
-- ════════════════════════════════════════════════════════════════

-- 1) Coluna check_in (momento real de chegada/check-in). NULL = não chegou.
alter table public.appointments
  add column if not exists check_in timestamptz;

comment on column public.appointments.check_in is
  'Momento REAL do check-in do paciente na recepção/fila (chegada). NULL = ainda não compareceu. starts_at continua sendo o horário AGENDADO. Usado para calcular o tempo de espera real (espera = atendimento iniciado − check_in).';

-- 2) Índice para relatórios por período/clínica (tempo médio de espera).
--    Parcial: só linhas COM check-in entram — o índice fica enxuto e
--    serve as consultas de BI que filtram clinic_id + faixa de check_in.
create index if not exists idx_appointments_clinic_check_in
  on public.appointments (clinic_id, check_in)
  where check_in is not null;

-- ════════════════════════════════════════════════════════════════
-- ROLLBACK (manual):
--   drop index if exists public.idx_appointments_clinic_check_in;
--   alter table public.appointments drop column if exists check_in;
--
-- IMPACTO: reverter zera a base de cálculo do tempo médio de espera real.
-- Aditivo — não há perda de dados pré-existentes ao aplicar.
-- ════════════════════════════════════════════════════════════════

-- ════════════════════════════════════════════════════════════════
-- agicare — migration 0029: Clínico restante + BI / LGPD (escopo 5, 14)
--
-- Fecha duas lacunas de auditoria:
--   • TEMPO MÉDIO DE ESPERA (BI, item 14-A) REAL: a fila não registrava
--     QUANDO o paciente foi chamado / iniciou atendimento — só `arrived_at`
--     (check-in). Sem esses marcos, "tempo de espera" só podia ser
--     representativo. Adicionamos `called_at` e `started_at` em
--     queue_entries, preenchidos pelas actions chamar/atender. O BI passa a
--     computar espera = chamada − chegada (ou início − chegada) ou, quando
--     não houver dado, exibe estado vazio HONESTO (nunca mock).
--
-- As demais entregas do escopo (Receituário imprimível, Balanço Hídrico —
-- abertura de ciclo, BI Epidemiológico/Financeiro, LGPD logAccess) NÃO
-- exigem schema novo: reaproveitam tabelas já existentes —
--   prescriptions/prescription_items (0007), fluid_balance (0008),
--   anamneses (0007), patients (0001/0004), tiss_guides/billable_events
--   (0009/0024), lab_cases (0002/0009), access_logs (0014).
--
-- Depende de 0002 (queue_entries) e 0015 (arrived_at). queue_entries já tem
-- RLS de staff (0002). Nenhuma tabela nova → nenhuma policy nova.
-- Idempotente: add column if not exists / create index if not exists.
-- SEM clinic_id (multitenant 0020 não aplicado — segue o padrão 0004-0019).
-- Aplicar MANUALMENTE no SQL Editor do Supabase.
-- ════════════════════════════════════════════════════════════════

-- ── Marcos temporais da fila (para Tempo Médio de Espera REAL) ────
-- called_at  = momento em que o paciente foi CHAMADO (aguardando → chamado)
-- started_at = momento em que o ATENDIMENTO iniciou (→ em_atendimento)
alter table public.queue_entries
  add column if not exists called_at  timestamptz,
  add column if not exists started_at timestamptz;

-- Índice para as agregações de BI por período (filtra por marcos não nulos).
create index if not exists idx_queue_called  on public.queue_entries (called_at);
create index if not exists idx_queue_started on public.queue_entries (started_at);

-- ════════════════════════════════════════════════════════════════
-- RLS: queue_entries já tem policy de staff (0002). Nada a (re)criar.
-- ════════════════════════════════════════════════════════════════

-- ════════════════════════════════════════════════════════════════
-- ROLLBACK (manual):
--   alter table public.queue_entries
--     drop column if exists started_at,
--     drop column if exists called_at;
--   drop index if exists public.idx_queue_started;
--   drop index if exists public.idx_queue_called;
-- ════════════════════════════════════════════════════════════════

-- 0003_queue_desistencia.sql
-- Fila de Atendimento: novo status "desistencia" + motivo da desistência.
--
-- IMPORTANTE (Postgres): `alter type ... add value` NÃO pode ser usado no mesmo
-- bloco de transação em que o novo valor é referenciado. No SQL Editor do Supabase,
-- execute as duas instruções SEPARADAMENTE (a 1ª, commit; depois a 2ª).

-- 1) Novo valor do enum de status da fila.
alter type public.queue_status add value if not exists 'desistencia';

-- 2) Motivo da desistência (preenchido quando status = 'desistencia').
alter table public.queue_entries
  add column if not exists cancel_reason text;

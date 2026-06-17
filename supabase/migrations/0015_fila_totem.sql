-- ════════════════════════════════════════════════════════════════
-- agicare — migration 0015: Fluxo Totem (Fila ↔ Agenda)
-- Vincula a entrada da fila ao agendamento e registra a chegada
-- (check-in via totem). A "senha" continua sendo queue_entries.ticket_code.
-- Depende de 0001 (appointments) e 0002 (queue_entries).
-- ════════════════════════════════════════════════════════════════

alter table public.queue_entries
  add column if not exists appointment_id uuid references public.appointments (id) on delete set null,
  add column if not exists arrived_at     timestamptz;   -- momento do check-in no totem

create index if not exists idx_queue_appointment on public.queue_entries (appointment_id);

-- ════════════════════════════════════════════════════════════════
-- ROLLBACK (manual):
--   alter table public.queue_entries
--     drop column if exists appointment_id,
--     drop column if exists arrived_at;
-- ════════════════════════════════════════════════════════════════

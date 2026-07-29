-- 0123: Backfill de billable_events.professional_id para eventos já gravados
-- antes da correção de finalizarAtendimento() (que nunca setava essa coluna).
--
-- Preenche, quando possível, com:
--   1) queue_entries.professional_id (quem atendeu de fato), via appointment_id;
--   2) fallback: appointments.professional_id (quem foi AGENDADO), quando o
--      queue_entries correspondente também estiver sem profissional.
--
-- Eventos sem appointment_id, ou cujo queue_entries/appointments também
-- estejam sem profissional, permanecem NULL (sem dado de origem para
-- recuperar) — não são alterados.

-- Passo 1: via queue_entries (quem atendeu).
update public.billable_events be
set professional_id = qe.professional_id
from public.queue_entries qe
where be.professional_id is null
  and be.appointment_id is not null
  and qe.appointment_id = be.appointment_id
  and qe.professional_id is not null;

-- Passo 2: fallback via appointments (quem foi agendado), só para o que
-- ainda ficou sem professional_id depois do passo 1.
update public.billable_events be
set professional_id = ap.professional_id
from public.appointments ap
where be.professional_id is null
  and be.appointment_id is not null
  and ap.id = be.appointment_id
  and ap.professional_id is not null;

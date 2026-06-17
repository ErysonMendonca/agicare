-- ════════════════════════════════════════════════════════════════
-- agicare — migration 0027: Agenda (fechamento de lacunas)
-- - schedule_blocks já existe (0005): garante a coluna `reason`.
-- - appointment_notifications: registro do envio de comprovante
--   (SMS/e-mail) como STUB local — marca sent_at, sem gateway real.
-- Depende de 0001 (public.is_staff()) e 0002 (patients).
-- RLS: staff (admin/medico/recepcao) gerencia. Idempotente.
-- SEM clinic_id (multitenant 0020 não aplicado).
-- ════════════════════════════════════════════════════════════════

-- ── Tipos ────────────────────────────────────────────────────────
do $$ begin
  create type public.notification_channel as enum ('sms','email');
exception when duplicate_object then null; end $$;

-- ── schedule_blocks: garante colunas usadas pela UI de bloqueios ──
alter table public.schedule_blocks
  add column if not exists reason text;

-- ── Notificações de comprovante (envio = STUB local) ─────────────
create table if not exists public.appointment_notifications (
  id          uuid primary key default gen_random_uuid(),
  channel     public.notification_channel not null,
  protocol    text not null,                    -- protocolo do agendamento
  patient_id  uuid references public.patients (id) on delete set null,
  recipient   text,                             -- telefone/e-mail (quando informado)
  sent_at     timestamptz not null default now(),
  created_at  timestamptz not null default now()
);
create index if not exists idx_appointment_notifications_protocol
  on public.appointment_notifications (protocol);

-- ════════════════════════════════════════════════════════════════
-- RLS — staff gerencia tudo (mesmo padrão da 0005/0008).
-- ════════════════════════════════════════════════════════════════
alter table public.appointment_notifications enable row level security;

do $$
declare t text;
begin
  foreach t in array array['appointment_notifications'] loop
    execute format('drop policy if exists %I_staff_all on public.%I;', t, t);
    execute format(
      'create policy %I_staff_all on public.%I for all using (public.is_staff()) with check (public.is_staff());',
      t, t
    );
  end loop;
end $$;

-- ════════════════════════════════════════════════════════════════
-- ROLLBACK (manual):
--   drop table public.appointment_notifications;
--   drop type public.notification_channel;
-- ════════════════════════════════════════════════════════════════

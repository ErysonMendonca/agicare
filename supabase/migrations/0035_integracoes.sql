-- ════════════════════════════════════════════════════════════════
-- agicare — migration 0035: Integrações externas (camada de adaptador)
--
-- Cria a persistência das duas integrações honestas:
--   • notification_log → registro de TODA notificação (e-mail/SMS/WhatsApp)
--     com o status real do ambiente (enviado|pendente|nao_configurado|erro).
--     O destino é MASCARADO pela aplicação (LGPD) antes de gravar.
--   • payments → registro de pagamento particular (PIX/Cartão/Boleto). Nasce
--     SEMPRE 'pendente'; confirmação só por gateway real (futuro) ou manual
--     pelo gestor. Nunca há confirmação automática/fingida.
--
-- MULTITENANT: ambas as tabelas seguem o padrão das 0020–0023 — clinic_id
-- NOT NULL + trigger de default (current_clinic_id) + RLS amarrada ao tenant.
-- DEPENDE de: 0020 (clinics, current_clinic_id(), is_staff(),
--             set_clinic_id_default()), 0002 (patients, billable_events).
--
-- RLS: staff (admin/medico/recepcao) gerencia tudo NA SUA clínica. O gestor é
-- staff (admin); a restrição de gestor p/ CONFIRMAR pagamento é no servidor
-- (action atualizarStatusPagamento). Idempotente. APLICAR MANUALMENTE.
-- ════════════════════════════════════════════════════════════════

-- ════════════════════════════════════════════════════════════════
-- 1) notification_log — auditoria de notificações
-- ════════════════════════════════════════════════════════════════
create table if not exists public.notification_log (
  id           uuid primary key default gen_random_uuid(),
  clinic_id    uuid not null references public.clinics (id) on delete cascade,
  channel      text not null check (channel in ('email','sms','whatsapp')),
  template     text not null,
  destination  text,                       -- destino MASCARADO (LGPD)
  provider     text,                        -- resend | sms-stub | whatsapp-stub | ...
  status       text not null
               check (status in ('enviado','pendente','nao_configurado','erro')),
  error        text,
  protocol     text,                        -- vínculo opcional (ex.: agendamento)
  patient_id   uuid references public.patients (id) on delete set null,
  payload      jsonb not null default '{}'::jsonb,
  sent_at      timestamptz,                 -- preenchido só quando enviado
  created_at   timestamptz not null default now()
);
create index if not exists idx_notification_log_clinic
  on public.notification_log (clinic_id);
create index if not exists idx_notification_log_status
  on public.notification_log (status);
create index if not exists idx_notification_log_protocol
  on public.notification_log (protocol);

-- ════════════════════════════════════════════════════════════════
-- 2) payments — registro de pagamento particular
-- ════════════════════════════════════════════════════════════════
create table if not exists public.payments (
  id           uuid primary key default gen_random_uuid(),
  clinic_id    uuid not null references public.clinics (id) on delete cascade,
  event_id     uuid references public.billable_events (id) on delete set null,
  method       text not null check (method in ('pix','cartao','boleto')),
  status       text not null default 'pendente'
               check (status in ('pendente','confirmado','falhou','cancelado')),
  amount       numeric(12,2) not null check (amount > 0),
  provider     text,                        -- manual | <gateway stub>
  external_id  text,                        -- referência da cobrança (txid/nsu)
  created_by   uuid references auth.users (id) on delete set null,
  confirmed_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists idx_payments_clinic on public.payments (clinic_id);
create index if not exists idx_payments_event  on public.payments (event_id);
create index if not exists idx_payments_status on public.payments (status);

-- ════════════════════════════════════════════════════════════════
-- 3) Rede de segurança: default de clinic_id (BEFORE INSERT) — 0023.
--    notification_log NÃO seta clinic_id na app (confia no trigger);
--    payments seta explicitamente, mas o trigger fica como rede de segurança.
-- ════════════════════════════════════════════════════════════════
do $$
declare t text;
begin
  foreach t in array array['notification_log','payments'] loop
    execute format(
      'drop trigger if exists trg_set_clinic_id_%I on public.%I;', t, t
    );
    execute format(
      'create trigger trg_set_clinic_id_%I
         before insert on public.%I
         for each row execute function public.set_clinic_id_default();',
      t, t
    );
  end loop;
end $$;

-- ════════════════════════════════════════════════════════════════
-- 4) RLS — staff gerencia tudo NA SUA clínica (padrão 0021).
-- ════════════════════════════════════════════════════════════════
alter table public.notification_log enable row level security;
alter table public.payments         enable row level security;

do $$
declare t text;
begin
  foreach t in array array['notification_log','payments'] loop
    execute format('drop policy if exists %I_staff_all on public.%I;', t, t);
    execute format(
      'create policy %I_staff_all on public.%I for all '
      'using (public.is_staff() and clinic_id = public.current_clinic_id()) '
      'with check (public.is_staff() and clinic_id = public.current_clinic_id());',
      t, t
    );
  end loop;
end $$;

-- ════════════════════════════════════════════════════════════════
-- ROLLBACK (manual):
--   drop trigger if exists trg_set_clinic_id_payments on public.payments;
--   drop trigger if exists trg_set_clinic_id_notification_log on public.notification_log;
--   drop table if exists public.payments;
--   drop table if exists public.notification_log;
-- ════════════════════════════════════════════════════════════════

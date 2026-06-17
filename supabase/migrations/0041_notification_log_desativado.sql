-- ════════════════════════════════════════════════════════════════
-- agicare — migration 0041: notification_log.status += 'desativado'
--
-- A 0035 criou notification_log com um CHECK inline na coluna status:
--   status text not null check (status in
--           ('enviado','pendente','nao_configurado','erro'))
-- CHECK inline numa coluna recebe nome AUTO do Postgres no padrão
-- "<tabela>_<coluna>_check" → `notification_log_status_check`.
--
-- O dispatcher (src/lib/integrations/notifications.ts) precisa PERSISTIR o
-- status 'desativado' (evento desligado pelo gestor em
-- clinic_settings.notifications) para auditoria completa — antes ele fazia
-- short-circuit SEM gravar porque o CHECK não aceitava esse valor.
--
-- Esta migration recria o CHECK incluindo 'desativado'. Idempotente.
-- NÃO altera clinic_id / RLS (já isoladas por tenant na 0035). APLICAR MANUALMENTE.
-- DEPENDE de: 0035 (notification_log).
-- ════════════════════════════════════════════════════════════════

do $$
begin
  -- Remove o CHECK existente (nome auto da 0035) e qualquer recriação prévia
  -- desta própria migration, para reaplicar sem erro.
  alter table public.notification_log
    drop constraint if exists notification_log_status_check;

  -- Recria o CHECK com o valor 'desativado' incluído.
  alter table public.notification_log
    add constraint notification_log_status_check
    check (status in ('enviado','pendente','nao_configurado','desativado','erro'));
end $$;

-- ════════════════════════════════════════════════════════════════
-- ROLLBACK (manual) — volta ao CHECK da 0035 (sem 'desativado'):
--   alter table public.notification_log
--     drop constraint if exists notification_log_status_check;
--   alter table public.notification_log
--     add constraint notification_log_status_check
--     check (status in ('enviado','pendente','nao_configurado','erro'));
-- (Atenção: o rollback falha se já houver linhas com status 'desativado'.)
-- ════════════════════════════════════════════════════════════════

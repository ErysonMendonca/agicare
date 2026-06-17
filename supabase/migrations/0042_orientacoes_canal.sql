-- ════════════════════════════════════════════════════════════════
-- agicare — migration 0042: Canal das orientações do procedimento
-- Persiste a preferência de canal (e-mail/SMS/ambos) pelo qual as
-- orientações pré/pós-procedimento são enviadas ao paciente.
-- Coluna em public.procedure_instructions (1:1 com procedures — ver 0028).
-- Idempotente: add column if not exists.
-- NÃO APLICADA automaticamente — aplicar via scripts/migrate.mjs.
-- ════════════════════════════════════════════════════════════════

alter table public.procedure_instructions
  add column if not exists notify_channel text not null default 'email';

-- Restringe aos canais suportados pela UI (e-mail / SMS / ambos).
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'procedure_instructions_notify_channel_chk'
  ) then
    alter table public.procedure_instructions
      add constraint procedure_instructions_notify_channel_chk
      check (notify_channel in ('email', 'sms', 'ambos'));
  end if;
end $$;

-- ════════════════════════════════════════════════════════════════
-- ROLLBACK (manual):
--   alter table public.procedure_instructions
--     drop constraint if exists procedure_instructions_notify_channel_chk,
--     drop column if exists notify_channel;
-- ════════════════════════════════════════════════════════════════

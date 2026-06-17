-- ════════════════════════════════════════════════════════════════
-- agicare — migration 0025: Configurações (abas Segurança/Backup/
-- Notificações estendidas + White-label) e Dashboard (dados reais).
--
-- Estende a linha-única public.clinic_settings (criada em 0010) com
-- colunas JSONB para os blocos que hoje ficavam FORA do <form> e não
-- persistiam:
--   - security      → 2FA, política de senha, timeout de sessão
--   - backup        → frequência, retenção, indicadores de execução
--   - notifications → canais por evento (e-mail/SMS/WhatsApp/avisos)
--   - branding      → white-label: tema, paleta (hex), logo
--
-- Reuso de colunas existentes: as abas Geral/Preferências e os flags
-- legados (notify_email/sms/push, two_factor, password_policy,
-- backup_frequency, backup_retention_days) continuam válidos. As novas
-- colunas JSONB carregam os campos ADICIONAIS sem quebrar o que já existe.
--
-- Depende de 0010 (public.clinic_settings + RLS staff).
-- Idempotente: add column if not exists. SEM clinic_id (multitenant
-- 0020 não aplicado — segue o padrão das tabelas 0004-0019).
-- ════════════════════════════════════════════════════════════════

alter table public.clinic_settings
  add column if not exists security      jsonb not null default '{}'::jsonb,
  add column if not exists backup        jsonb not null default '{}'::jsonb,
  add column if not exists notifications jsonb not null default '{}'::jsonb,
  add column if not exists branding      jsonb not null default '{}'::jsonb;

-- ════════════════════════════════════════════════════════════════
-- RLS: a tabela já tem RLS habilitada e a policy clinic_settings_staff_all
-- (0010). Colunas novas herdam a policy existente — nada a fazer aqui.
-- ════════════════════════════════════════════════════════════════

-- ════════════════════════════════════════════════════════════════
-- ROLLBACK (manual):
--   alter table public.clinic_settings
--     drop column if exists security,
--     drop column if exists backup,
--     drop column if exists notifications,
--     drop column if exists branding;
-- ════════════════════════════════════════════════════════════════

-- ════════════════════════════════════════════════════════════════
-- agicare — migration 0068: módulo Totem (liga/desliga por clínica)
--
-- Toggle boolean por clínica em clinic_settings. Quando LIGADO, a fila usa
-- senha (ticket_code) e botão "Chamar" (modo totem/painel). Quando DESLIGADO
-- (padrão), o check-in apenas confirma a presença do paciente e abre os Dados
-- de Atendimento direto; a senha e o "Chamar" ficam ocultos.
--
-- Padrão false (desligado), a pedido do produto. Coluna aditiva, mesmo padrão
-- de two_factor/notify_* (0010). RLS herdada de clinic_settings. Idempotente.
-- NÃO APLICADA automaticamente — aplicar via scripts/migrate.mjs.
-- ════════════════════════════════════════════════════════════════

alter table public.clinic_settings
  add column if not exists totem_enabled boolean not null default false;

comment on column public.clinic_settings.totem_enabled is
  'Módulo Totem ligado? true = senha + botão Chamar (painel). false (padrão) = check-in confirma presença e abre os Dados de Atendimento direto, sem senha.';

-- ════════════════════════════════════════════════════════════════
-- Rollback (manual):
--   alter table public.clinic_settings drop column if exists totem_enabled;
-- ════════════════════════════════════════════════════════════════

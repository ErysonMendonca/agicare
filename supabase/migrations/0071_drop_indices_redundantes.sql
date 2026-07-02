-- ════════════════════════════════════════════════════════════════
-- agicare — migration 0071: remove 3 índices redundantes
-- Cada um é um índice NÃO-único sobre EXATAMENTE as mesmas colunas de um
-- índice UNIQUE já existente — o unique já atende todas as consultas, então o
-- não-único é peso morto (espaço em disco + custo de escrita, zero ganho de
-- leitura). Nenhuma query perde plano. Reversível (ver rollback abaixo).
-- Achado da auditoria read-only do banco (02/07). Idempotente (if exists).
-- ════════════════════════════════════════════════════════════════

-- (clinic_id, specialty) — coberto por uq_anamnese_templates_clinic_specialty
drop index if exists public.idx_anamnese_templates_clinic_specialty;

-- (clinic_id, specialty) — coberto por uq_triage_templates_clinic_specialty
drop index if exists public.idx_triage_templates_clinic_specialty;

-- (clinic_id) — coberto por uq_clinic_settings_clinic
drop index if exists public.idx_clinic_settings_clinic;

-- ── Rollback (se algum dia precisar recriar) ─────────────────────
--   create index if not exists idx_anamnese_templates_clinic_specialty
--     on public.anamnese_templates (clinic_id, specialty);
--   create index if not exists idx_triage_templates_clinic_specialty
--     on public.triage_templates (clinic_id, specialty);
--   create index if not exists idx_clinic_settings_clinic
--     on public.clinic_settings (clinic_id);

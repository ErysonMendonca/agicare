-- ════════════════════════════════════════════════════════════════
-- agicare — migration 0018: sinais vitais EXTRAS / pediátrico-neonatal
-- Permite aferir itens além dos fixos (ex.: sinais vitais do bebê:
-- perímetro cefálico, etc.) como lista flexível chave→valor.
-- Depende de 0004 (vital_signs).
-- ════════════════════════════════════════════════════════════════

alter table public.vital_signs
  add column if not exists extra jsonb not null default '{}'::jsonb;
  -- ex.: {"Perímetro cefálico":"34 cm","Perímetro torácico":"32 cm"}

-- ROLLBACK: alter table public.vital_signs drop column if exists extra;

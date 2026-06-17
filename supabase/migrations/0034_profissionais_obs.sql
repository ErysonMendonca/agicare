-- ════════════════════════════════════════════════════════════════
-- agicare — migration 0034: observações do profissional
-- Adiciona a coluna `notes` (4º bloco do cadastro — escopo 11.2) à tabela
-- professionals. Idempotente (add column if not exists). RLS já habilitada em
-- 0001; as policies professionals_read_staff / professionals_write_admin cobrem
-- a nova coluna automaticamente (são por linha, não por coluna).
-- ════════════════════════════════════════════════════════════════

alter table public.professionals add column if not exists notes text;

-- ════════════════════════════════════════════════════════════════
-- ROLLBACK (manual):
--   alter table public.professionals drop column if exists notes;
-- ════════════════════════════════════════════════════════════════

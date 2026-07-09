-- ════════════════════════════════════════════════════════════════
-- agicare — migration 0100: job title para equipe administrativa
--
-- Objetivo:
-- 1. Adicionar a coluna `job_title` na tabela `professionals` para
--    armazenar o cargo em texto livre.
-- ════════════════════════════════════════════════════════════════

ALTER TABLE public.professionals 
ADD COLUMN IF NOT EXISTS job_title text;

-- ════════════════════════════════════════════════════════════════
-- agicare — migration 0101: campos de convênio e representante legal
--
-- Objetivo:
-- 1. Adicionar colunas de detalhamento de convênio na `patients`
--    (carteirinha, validade, titular, acomodação).
-- 2. Adicionar colunas do representante legal, usadas para pacientes
--    menores de idade (CPF, parentesco e telefone do responsável).
--
-- Observações:
-- - As colunas `convenio`, `plan` e `legal_guardian` já existem e NÃO
--   são recriadas aqui.
-- - A RLS da `patients` já cobre as novas colunas automaticamente;
--   nenhuma policy precisa ser alterada.
-- ════════════════════════════════════════════════════════════════

-- 1. Detalhes do convênio
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS convenio_carteirinha text;   -- nº da carteirinha do convênio
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS convenio_validade    date;   -- validade da carteira
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS convenio_titular     text;   -- titular do plano (se dependente)
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS convenio_acomodacao  text;   -- acomodação (Enfermaria/Apartamento)

-- 2. Representante legal (pacientes menores de idade)
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS responsavel_cpf        text; -- CPF do representante legal (menores)
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS responsavel_parentesco text; -- parentesco do responsável
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS responsavel_telefone   text; -- telefone do responsável

-- ════════════════════════════════════════════════════════════════
-- ROLLBACK (manual):
--   alter table public.patients drop column convenio_carteirinha;
--   alter table public.patients drop column convenio_validade;
--   alter table public.patients drop column convenio_titular;
--   alter table public.patients drop column convenio_acomodacao;
--   alter table public.patients drop column responsavel_cpf;
--   alter table public.patients drop column responsavel_parentesco;
--   alter table public.patients drop column responsavel_telefone;
-- ════════════════════════════════════════════════════════════════

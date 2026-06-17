-- ════════════════════════════════════════════════════════════════
-- agicare — migration 0012: endereço dos profissionais
-- Adiciona colunas de endereço à tabela professionals (cadastro completo).
-- Idempotente (add column if not exists). RLS já habilitada em 0001;
-- as policies professionals_read_staff / professionals_write_admin cobrem
-- as novas colunas automaticamente (são por linha, não por coluna).
-- ════════════════════════════════════════════════════════════════

alter table public.professionals add column if not exists cep            text;
alter table public.professionals add column if not exists address        text;  -- logradouro
alter table public.professionals add column if not exists address_number text;
alter table public.professionals add column if not exists complement     text;
alter table public.professionals add column if not exists neighborhood   text;  -- bairro
alter table public.professionals add column if not exists city           text;
alter table public.professionals add column if not exists state          text;  -- UF (2 letras)

-- ════════════════════════════════════════════════════════════════
-- ROLLBACK (manual):
--   alter table public.professionals
--     drop column if exists cep,
--     drop column if exists address,
--     drop column if exists address_number,
--     drop column if exists complement,
--     drop column if exists neighborhood,
--     drop column if exists city,
--     drop column if exists state;
-- ════════════════════════════════════════════════════════════════

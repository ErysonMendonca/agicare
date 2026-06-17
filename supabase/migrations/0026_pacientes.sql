-- ════════════════════════════════════════════════════════════════
-- agicare — migration 0026: Pacientes (módulo 6) — fechamento de gaps
--
-- A tabela `public.patients` já existe (0001) e foi estendida pelas
-- migrations 0002/0004/0010 (convênio, allergies, in_treatment, active,
-- mother_name, manual_record, cns, social_name, death_date, etc.).
--
-- Esta migration apenas COMPLEMENTA, de forma idempotente, os campos que
-- faltavam para a Ficha do Paciente refletir dados REAIS:
--   - `cardiac`  : flag de condição cardíaca (o front exibia hardcoded=false);
--   - colunas de endereço estruturado (cep/address/district/city/state) para
--     a aba "Contato e Endereço" parar de depender só do texto livre em notes.
--
-- NÃO adiciona clinic_id (multitenant 0020 NÃO está aplicado neste ambiente).
-- Segue o estilo das migrations 0002-0010: alter table ... add column if not exists.
-- ════════════════════════════════════════════════════════════════

alter table public.patients
  add column if not exists cardiac    boolean not null default false,  -- condição cardíaca (alerta na lista)
  add column if not exists cep        text,                            -- endereço estruturado
  add column if not exists address    text,                            -- logradouro
  add column if not exists district   text,                            -- bairro
  add column if not exists city       text,                            -- cidade
  add column if not exists state      text;                            -- UF

-- Índice de busca por status (a lista filtra ativos/inativos).
create index if not exists idx_patients_active on public.patients (active);

-- RLS já está habilitada em public.patients (0001) com as policies de staff —
-- nada a fazer aqui (apenas colunas novas na tabela existente).

-- ROLLBACK (manual):
--   alter table public.patients
--     drop column if exists cardiac,
--     drop column if exists cep,
--     drop column if exists address,
--     drop column if exists district,
--     drop column if exists city,
--     drop column if exists state;
--   drop index if exists public.idx_patients_active;

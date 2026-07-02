-- ════════════════════════════════════════════════════════════════
-- agicare — migration 0070: cadastro completo de profissional
-- Amplia public.professionals (dados pessoais, tipo de profissional e conselho
-- detalhado) e cria public.professional_insurance_credentials (credenciamento
-- de convênio TISS 3.0 — VÁRIOS por profissional). Depende de 0001
-- (professionals, current_role), 0021 (current_clinic_id). Idempotente.
-- ════════════════════════════════════════════════════════════════

-- ── 1) Novas colunas em professionals ────────────────────────────
alter table public.professionals
  -- Dados pessoais
  add column if not exists person_type    text,   -- 'cpf' | 'cnpj'
  add column if not exists document        text,  -- nº do CPF/CNPJ (mascarado)
  add column if not exists social_name     text,  -- nome social
  add column if not exists birth_date      date,
  add column if not exists sex             text,  -- Masculino | Feminino | Intersexo
  add column if not exists gender          text,  -- identidade de gênero (texto)
  add column if not exists mother_name     text,
  add column if not exists race            text,  -- raça/cor (IBGE)
  add column if not exists birthplace      text,  -- naturalidade (cidade/UF)
  add column if not exists nationality     text,
  -- Tipo de profissional
  add column if not exists cns             text,  -- Cartão Nacional de Saúde
  add column if not exists cnes            text,  -- Cadastro Nacional de Estabelecimentos de Saúde
  -- Conselho (detalhado; council_reg legado é mantido/derivado p/ a listagem)
  add column if not exists council_number  text,  -- nº do conselho
  add column if not exists council_name    text,  -- ex.: CRM, CRO, COREN
  add column if not exists council_uf      text,  -- UF do conselho
  add column if not exists council_expiry  date;  -- validade do conselho

-- person_type restrito a 'cpf' | 'cnpj' (null permitido p/ registros legados).
do $$ begin
  alter table public.professionals
    add constraint chk_professionals_person_type
    check (person_type is null or person_type in ('cpf','cnpj'));
exception when duplicate_object then null; end $$;

-- ── 2) Credenciamento de convênio (TISS 3.0) — VÁRIOS por profissional ──
create table if not exists public.professional_insurance_credentials (
  id                    uuid primary key default gen_random_uuid(),
  clinic_id             uuid not null references public.clinics (id) on delete cascade,
  professional_id       uuid not null references public.professionals (id) on delete cascade,
  convenio              text,                     -- qual convênio
  vigencia              date,                     -- data de vigência
  convenio_code         text,                     -- código do convênio
  lab_code              text,                     -- código do laboratório
  tiss_login            text,                     -- login TISS 3.0
  tiss_password         text,                     -- senha TISS 3.0 (sensível → RLS admin-only)
  recebe_eletivo        boolean not null default false,
  recebe_urgencia       boolean not null default false,  -- urgência/emergência
  recebe_internacao     boolean not null default false,
  xml_tag               text,                     -- tag XML
  cpf_or_convenio_code  text,                     -- "CPF ou Código Convênio"
  created_at            timestamptz not null default now()
);
create index if not exists idx_prof_ins_cred_prof
  on public.professional_insurance_credentials (professional_id);

-- ── 3) RLS: credenciais TISS são sensíveis → SOMENTE admin da clínica ativa ──
alter table public.professional_insurance_credentials enable row level security;

drop policy if exists prof_ins_cred_admin_all on public.professional_insurance_credentials;
create policy prof_ins_cred_admin_all on public.professional_insurance_credentials
  for all
  using      (public.current_role() = 'admin' and clinic_id = public.current_clinic_id())
  with check (public.current_role() = 'admin' and clinic_id = public.current_clinic_id());

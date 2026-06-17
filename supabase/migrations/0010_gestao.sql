-- ════════════════════════════════════════════════════════════════
-- agicare — migration 0010: Gestão (Fases 7 e 8)
-- Procedimentos (cadastro 6 abas), Pacientes (cadastro completo),
-- Configurações da clínica.
-- Depende de 0001 (public.is_staff), 0002 (procedures, patients extras).
-- Idempotente: create ... if not exists / add column if not exists /
-- drop policy if exists. Aplicação MANUAL no SQL Editor do Supabase.
-- ════════════════════════════════════════════════════════════════

-- ── Pacientes: cadastro completo (Dados Pessoais + Histórico/Óbito) ──
alter table public.patients
  add column if not exists cns            text,          -- Cartão Nacional de Saúde
  add column if not exists social_name    text,          -- Nome social
  add column if not exists naturality     text,          -- Naturalidade (cidade)
  add column if not exists nationality    text,          -- Nacionalidade
  add column if not exists race            text,         -- Raça/cor (IBGE)
  add column if not exists ethnicity       text,         -- Etnia (indígena)
  add column if not exists marital_status  text,         -- Estado civil
  add column if not exists legal_guardian  text,         -- Representante legal (menores)
  add column if not exists plan            text,         -- Plano do convênio (não-SUS)
  add column if not exists death_date      date,         -- Óbito: data
  add column if not exists death_cause     text;         -- Óbito: causa

-- ── Procedimentos: abas Tempo, Sessões e Financeiro ─────────────────
alter table public.procedures
  add column if not exists commercial_desc text,                       -- Descrição comercial (aba A)
  add column if not exists setup_min       int not null default 0,     -- Tempo de setup/preparo (aba B)
  add column if not exists cleanup_min     int not null default 0,     -- Tempo de limpeza (aba B)
  add column if not exists sessions        int not null default 1,     -- Sessões/pacote (aba D)
  add column if not exists cost            numeric(12,2) not null default 0,  -- Custo (aba F)
  add column if not exists commission_pct  numeric(5,2) not null default 0,   -- Comissão % (aba F)
  add column if not exists tax_pct         numeric(5,2) not null default 0;   -- Impostos % (aba F)

-- ── Configurações da clínica (linha única — singleton) ──────────────
create table if not exists public.clinic_settings (
  id              uuid primary key default gen_random_uuid(),
  singleton       boolean not null default true,
  -- Geral / institucional
  clinic_name     text,
  cnpj            text,
  phone           text,
  email           text,
  address         text,
  cep             text,
  business_hours  text,
  -- Preferências do sistema
  language        text not null default 'pt-BR',
  timezone        text not null default 'gmt-3',
  date_format     text not null default 'dmy',
  time_format     text not null default '24h',
  currency        text not null default 'brl',
  -- Notificações
  notify_email    boolean not null default true,
  notify_sms      boolean not null default false,
  notify_push     boolean not null default true,
  -- Segurança
  two_factor      boolean not null default false,
  password_policy text not null default 'media',   -- baixa | media | alta
  -- Backup
  backup_frequency     text not null default 'diario',  -- diario | semanal | mensal
  backup_retention_days int not null default 30,
  updated_at      timestamptz not null default now()
);
-- Garante no máximo uma linha de configuração.
create unique index if not exists uq_clinic_settings_singleton
  on public.clinic_settings (singleton);

-- ── RLS — staff gerencia (segue 0002) ───────────────────────────────
alter table public.clinic_settings enable row level security;

drop policy if exists clinic_settings_staff_all on public.clinic_settings;
create policy clinic_settings_staff_all on public.clinic_settings
  for all using (public.is_staff()) with check (public.is_staff());

-- ════════════════════════════════════════════════════════════════
-- ROLLBACK (manual):
--   drop table public.clinic_settings;
--   alter table public.procedures
--     drop column commercial_desc, drop column setup_min, drop column cleanup_min,
--     drop column sessions, drop column cost, drop column commission_pct, drop column tax_pct;
--   alter table public.patients
--     drop column cns, drop column social_name, drop column naturality,
--     drop column nationality, drop column race, drop column ethnicity,
--     drop column marital_status, drop column legal_guardian, drop column plan,
--     drop column death_date, drop column death_cause;
-- ════════════════════════════════════════════════════════════════

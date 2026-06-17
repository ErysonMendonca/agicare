-- ════════════════════════════════════════════════════════════════
-- agicare — SQL CONSOLIDADO de migrations PENDENTES no Supabase
-- Gerado em 2026-06-15. Cole TUDO no SQL Editor e execute (na ordem).
-- Já aplicadas (NÃO incluídas): 0001, 0002, 0003, 0012.
-- Inclui: 0004-0010 + 0013(RLS) + 0014(LGPD) + 0015(totem)
--         + 0016(exames) + 0017(protético+storage) + 0018(sinais extras).
-- Todas idempotentes.
-- ════════════════════════════════════════════════════════════════


-- ╔══════════════════════════════════════════════════════════════╗
-- ║  >>> 0004_prontuario.sql
-- ╚══════════════════════════════════════════════════════════════╝

-- 0004_prontuario.sql
-- Fase 2 — Prontuário eletrônico: identificação ampliada + sinais vitais.
-- Aplicar no SQL Editor do Supabase.

-- 1) Identificação ampliada do paciente.
alter table public.patients
  add column if not exists mother_name   text,
  add column if not exists gender        text,        -- 'masculino' | 'feminino' | 'outro'
  add column if not exists manual_record text;         -- Histórico: prontuário manual anexado

-- 2) Sinais vitais (aferições ao longo do tempo).
create table if not exists public.vital_signs (
  id           uuid primary key default gen_random_uuid(),
  patient_id   uuid not null references public.patients (id) on delete cascade,
  recorded_at  timestamptz not null default now(),
  systolic     integer,        -- PA sistólica (mmHg)
  diastolic    integer,        -- PA diastólica (mmHg)
  heart_rate   integer,        -- FC (bpm)
  resp_rate    integer,        -- FR (irpm)
  temperature  numeric(4,1),   -- Tax (°C)
  weight       numeric(5,2),   -- Peso (kg)
  height       numeric(4,2),   -- Altura (m)
  spo2         integer,        -- SpO2 (%)
  glucose      integer,        -- HGT (mg/dL)
  notes        text,
  recorded_by  uuid references public.profiles (id),
  created_at   timestamptz not null default now()
);
create index if not exists idx_vital_signs_patient
  on public.vital_signs (patient_id, recorded_at desc);

-- 3) RLS: dado clínico → apenas staff clínico (admin/médico/recepção lê; admin/médico é quem afere).
alter table public.vital_signs enable row level security;

drop policy if exists vital_signs_staff_all on public.vital_signs;
create policy vital_signs_staff_all on public.vital_signs
  for all using (public.is_staff()) with check (public.is_staff());


-- ╔══════════════════════════════════════════════════════════════╗
-- ║  >>> 0005_agenda.sql
-- ╚══════════════════════════════════════════════════════════════╝

-- ════════════════════════════════════════════════════════════════
-- agicare — migration 0005: Agenda (escala de horários + bloqueios)
-- Fase 5 — Módulo Agenda. Reaproveita public.appointments (0001).
-- Depende de 0001 (helper public.is_staff(), professionals).
-- RLS: staff (admin/medico/recepcao) gerencia. Idempotente.
-- ════════════════════════════════════════════════════════════════

-- ── Escala de horários (configuração de grade por profissional) ──
create table if not exists public.schedules (
  id              uuid primary key default gen_random_uuid(),
  code            text unique not null,             -- código auto (ex.: ESC-0001)
  description     text,
  professional_id uuid references public.professionals (id) on delete set null,
  specialty       text,
  service_type    text,                             -- tipo de atendimento
  slot_minutes    int  not null default 30,         -- tempo de atendimento (min)
  overbook_limit  int  not null default 0,          -- limite de encaixe
  weekdays        int[] not null default '{}',      -- dias: 0=Dom .. 6=Sáb
  start_time      time not null default '08:00',    -- horário inicial
  end_time        time not null default '18:00',    -- horário final
  active          boolean not null default true,
  created_at      timestamptz not null default now()
);
create index if not exists idx_schedules_professional
  on public.schedules (professional_id);

-- ── Bloqueios de horário (datas/faixas indisponíveis) ────────────
create table if not exists public.schedule_blocks (
  id              uuid primary key default gen_random_uuid(),
  schedule_id     uuid references public.schedules (id) on delete cascade,
  professional_id uuid references public.professionals (id) on delete set null,
  block_date      date not null,
  start_time      time not null,
  end_time        time,
  reason          text,
  created_at      timestamptz not null default now()
);
create index if not exists idx_schedule_blocks_lookup
  on public.schedule_blocks (professional_id, block_date);

-- ── Coluna extra em appointments p/ rastrear a escala usada ──────
alter table public.appointments
  add column if not exists schedule_id uuid references public.schedules (id) on delete set null;

-- ════════════════════════════════════════════════════════════════
-- RLS — staff gerencia tudo (mesmo padrão da 0002).
-- ════════════════════════════════════════════════════════════════
alter table public.schedules       enable row level security;
alter table public.schedule_blocks enable row level security;

do $$
declare t text;
begin
  foreach t in array array['schedules','schedule_blocks'] loop
    execute format('drop policy if exists %I_staff_all on public.%I;', t, t);
    execute format(
      'create policy %I_staff_all on public.%I for all using (public.is_staff()) with check (public.is_staff());',
      t, t
    );
  end loop;
end $$;

-- ════════════════════════════════════════════════════════════════
-- ROLLBACK (manual):
--   alter table public.appointments drop column if exists schedule_id;
--   drop table public.schedule_blocks, public.schedules;
-- ════════════════════════════════════════════════════════════════


-- ╔══════════════════════════════════════════════════════════════╗
-- ║  >>> 0006_estoque.sql
-- ╚══════════════════════════════════════════════════════════════╝

-- ════════════════════════════════════════════════════════════════
-- agicare — migration 0006: módulo Estoque completo (Fase 6)
-- Fornecedores, Dispensação (c/ itens), Entradas (NF), Inventário
-- (c/ contagens) e Compras (solicitações + cotações).
-- Depende de 0001 (helper public.is_staff()) e 0002 (stock_products,
-- stock_movements). RLS: staff gerencia tudo; valores financeiros são
-- restritos ao gestor NO FRONT (via isGestor).
-- Idempotente: create ... if not exists / add column if not exists /
-- drop policy if exists. Aplicar manualmente no SQL Editor do Supabase.
-- ════════════════════════════════════════════════════════════════

-- ── Tipos ────────────────────────────────────────────────────────
do $$ begin create type public.dispensation_kind   as enum ('prescricao','setor');                       exception when duplicate_object then null; end $$;
do $$ begin create type public.dispensation_status as enum ('pendente','separacao','concluido','cancelado'); exception when duplicate_object then null; end $$;
do $$ begin create type public.purchase_status     as enum ('solicitado','cotacao','aprovado','reprovado');   exception when duplicate_object then null; end $$;
do $$ begin create type public.inventory_kind      as enum ('geral','parcial');                            exception when duplicate_object then null; end $$;
do $$ begin create type public.inventory_status    as enum ('aberto','fechado');                           exception when duplicate_object then null; end $$;

-- ── Fornecedores ─────────────────────────────────────────────────
create table if not exists public.suppliers (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  cnpj        text,
  contact     text,        -- nome do contato
  phone       text,
  email       text,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

-- ── Colunas extras em stock_products (financeiro + rastreabilidade) ─
alter table public.stock_products
  add column if not exists cost        numeric(12,2) not null default 0,  -- custo unitário (FINANCEIRO)
  add column if not exists price       numeric(12,2) not null default 0,  -- preço de venda  (FINANCEIRO)
  add column if not exists expiry      date,                              -- validade do lote
  add column if not exists location    text,                              -- localização física (ex.: Prateleira A3)
  add column if not exists supplier_id uuid references public.suppliers (id) on delete set null;

-- ── Dispensação (pedidos por paciente/prescrição ou por setor) ───
create table if not exists public.dispensations (
  id              uuid primary key default gen_random_uuid(),
  code            text not null,                                -- ex.: PRESC-001, REQ-014
  kind            public.dispensation_kind not null default 'prescricao',
  status          public.dispensation_status not null default 'pendente',
  urgent          boolean not null default false,
  patient_id      uuid references public.patients (id) on delete set null,
  professional_id uuid references public.professionals (id) on delete set null,
  origin_label    text,                                         -- "Paciente" | "Setor"
  origin_name     text,                                         -- nome do paciente/setor
  origin_ref      text,                                         -- identificador (PAC-.., SET-..)
  requested_by    text,                                         -- solicitante (texto livre)
  progress        int not null default 0,                       -- 0–100 (separação)
  created_at      timestamptz not null default now()
);
create index if not exists idx_dispensations_status on public.dispensations (status, created_at);

create table if not exists public.dispensation_items (
  id              uuid primary key default gen_random_uuid(),
  dispensation_id uuid not null references public.dispensations (id) on delete cascade,
  product_id      uuid references public.stock_products (id) on delete set null,
  name            text not null,                                -- desnormalizado p/ exibição
  quantity        text,                                         -- ex.: "3 ampolas"
  location        text,                                         -- ex.: "Prateleira A3"
  barcode         text,
  lot             text,
  expiry          date,
  picked          boolean not null default false,               -- separado?
  created_at      timestamptz not null default now()
);
create index if not exists idx_dispensation_items_disp on public.dispensation_items (dispensation_id);

-- ── Compras (solicitações + cotações) ────────────────────────────
create table if not exists public.purchase_requests (
  id            uuid primary key default gen_random_uuid(),
  code          text not null,                                  -- ex.: SC-2025-001
  product_id    uuid references public.stock_products (id) on delete set null,
  product_name  text not null,                                  -- desnormalizado
  quantity      text,                                           -- ex.: "100 caixas"
  justification text,                                           -- justificativa
  status        public.purchase_status not null default 'solicitado',
  requested_by  uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now()
);
create index if not exists idx_purchase_requests_status on public.purchase_requests (status, created_at);

create table if not exists public.quotations (
  id                  uuid primary key default gen_random_uuid(),
  purchase_request_id uuid not null references public.purchase_requests (id) on delete cascade,
  supplier_id         uuid references public.suppliers (id) on delete set null,
  supplier_name       text not null,                            -- desnormalizado
  amount              numeric(12,2) not null default 0,         -- valor cotado (FINANCEIRO)
  lead_time           text,                                     -- prazo de entrega
  attachment_url      text,                                     -- upload da cotação
  approved            boolean,                                  -- null=pendente, true/false=decisão
  created_at          timestamptz not null default now()
);
create index if not exists idx_quotations_request on public.quotations (purchase_request_id);

-- ── Inventário (geral/parcial) + até 3 contagens de conferência ──
create table if not exists public.inventories (
  id          uuid primary key default gen_random_uuid(),
  code        text not null,                                    -- ex.: INV-2025-001
  kind        public.inventory_kind not null default 'geral',
  category    text,                                             -- preenchido quando parcial
  status      public.inventory_status not null default 'aberto',
  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  closed_at   timestamptz
);

create table if not exists public.inventory_counts (
  id            uuid primary key default gen_random_uuid(),
  inventory_id  uuid not null references public.inventories (id) on delete cascade,
  product_id    uuid references public.stock_products (id) on delete set null,
  product_name  text not null,                                  -- desnormalizado
  system_qty    numeric(12,2) not null default 0,               -- saldo do sistema
  count_1       numeric(12,2),                                  -- 1ª contagem
  count_2       numeric(12,2),                                  -- 2ª contagem
  count_3       numeric(12,2),                                  -- 3ª contagem
  created_at    timestamptz not null default now()
);
create index if not exists idx_inventory_counts_inv on public.inventory_counts (inventory_id);

-- ── Entradas de produtos (NF) — colunas extras em stock_movements ─
alter table public.stock_movements
  add column if not exists invoice_number text,                 -- nº da Nota Fiscal
  add column if not exists supplier_id    uuid references public.suppliers (id) on delete set null,
  add column if not exists total_value    numeric(12,2);        -- valor total da NF (FINANCEIRO)

-- ════════════════════════════════════════════════════════════════
-- RLS — staff (admin/medico/recepcao) gerencia tudo.
-- ════════════════════════════════════════════════════════════════
alter table public.suppliers          enable row level security;
alter table public.dispensations      enable row level security;
alter table public.dispensation_items enable row level security;
alter table public.purchase_requests  enable row level security;
alter table public.quotations         enable row level security;
alter table public.inventories        enable row level security;
alter table public.inventory_counts   enable row level security;

do $$
declare t text;
begin
  foreach t in array array[
    'suppliers','dispensations','dispensation_items','purchase_requests',
    'quotations','inventories','inventory_counts'
  ] loop
    execute format('drop policy if exists %I_staff_all on public.%I;', t, t);
    execute format(
      'create policy %I_staff_all on public.%I for all using (public.is_staff()) with check (public.is_staff());',
      t, t
    );
  end loop;
end $$;

-- ════════════════════════════════════════════════════════════════
-- ROLLBACK (manual):
--   drop table inventory_counts, inventories, quotations, purchase_requests,
--              dispensation_items, dispensations, suppliers;
--   alter table stock_movements drop column invoice_number, drop column supplier_id, drop column total_value;
--   alter table stock_products  drop column cost, drop column price, drop column expiry,
--              drop column location, drop column supplier_id;
--   drop type inventory_status, inventory_kind, purchase_status,
--             dispensation_status, dispensation_kind;
-- ════════════════════════════════════════════════════════════════


-- ╔══════════════════════════════════════════════════════════════╗
-- ║  >>> 0007_clinico.sql
-- ╚══════════════════════════════════════════════════════════════╝

-- ════════════════════════════════════════════════════════════════
-- agicare — migration 0007: módulo CLÍNICO do prontuário (Fase 3)
-- Anamnese dinâmica, Prescrição (medicamentos + cuidados), Checagem,
-- Atestados/Altas e Consentimentos LGPD.
-- Depende de 0001 (medical_records, helpers is_staff()/current_role()),
-- 0002 (stock_products) e 0004 (vital_signs).
-- Dado clínico sensível (LGPD): RLS restrita a admin/médico (espelha medical_records do 0001).
-- Idempotente: create table if not exists / drop policy if exists.
-- Aplicar no SQL Editor do Supabase.
-- ════════════════════════════════════════════════════════════════

-- ── Anamnese (motor dinâmico por especialidade) ──────────────────
-- `fields` jsonb guarda os campos dinâmicos (Histórico Geral + módulo da especialidade).
create table if not exists public.anamneses (
  id               uuid primary key default gen_random_uuid(),
  patient_id       uuid not null references public.patients (id) on delete cascade,
  professional_id  uuid references public.professionals (id) on delete set null,
  specialty        text not null,                 -- especialidade da ficha (gera quem é da especialidade)
  fields           jsonb not null default '{}'::jsonb,
  consent_given    boolean not null default false,
  signature        text,                          -- assinatura digital (texto)
  created_at       timestamptz not null default now()
);
create index if not exists idx_anamneses_patient on public.anamneses (patient_id, created_at desc);

-- ── Prescrição médica ────────────────────────────────────────────
create table if not exists public.prescriptions (
  id               uuid primary key default gen_random_uuid(),
  patient_id       uuid not null references public.patients (id) on delete cascade,
  professional_id  uuid references public.professionals (id) on delete set null,
  notes            text,
  created_at       timestamptz not null default now()
);
create index if not exists idx_prescriptions_patient on public.prescriptions (patient_id, created_at desc);

-- Itens de medicamento (auto-complete do estoque traz nome + concentração).
create table if not exists public.prescription_items (
  id               uuid primary key default gen_random_uuid(),
  prescription_id  uuid not null references public.prescriptions (id) on delete cascade,
  product_id       uuid references public.stock_products (id) on delete set null,
  name             text not null,
  concentration    text,
  posology         text,
  duration         text,
  frequency        text,
  observations     text,
  created_at       timestamptz not null default now()
);
create index if not exists idx_prescription_items_presc on public.prescription_items (prescription_id);

-- Cuidados (menu pré-definido + frequência e duração).
create table if not exists public.care_orders (
  id               uuid primary key default gen_random_uuid(),
  prescription_id  uuid references public.prescriptions (id) on delete cascade,
  patient_id       uuid not null references public.patients (id) on delete cascade,
  name             text not null,
  frequency        text,
  duration         text,
  observations     text,
  created_at       timestamptz not null default now()
);
create index if not exists idx_care_orders_patient on public.care_orders (patient_id, created_at desc);

-- ── Checagem (medicamentos e cuidados com frequência geram aprazamentos) ──
create table if not exists public.prescription_checks (
  id               uuid primary key default gen_random_uuid(),
  patient_id       uuid not null references public.patients (id) on delete cascade,
  prescription_id  uuid references public.prescriptions (id) on delete cascade,
  source_type      text not null,                 -- 'medicamento' | 'cuidado'
  source_label     text not null,                 -- ex.: 'Dipirona 500mg' / 'Curativo'
  frequency        text,
  scheduled_at     timestamptz not null,
  status           text not null default 'pendente', -- 'pendente' | 'checado'
  checked_at       timestamptz,
  checked_by       uuid references public.profiles (id),
  created_at       timestamptz not null default now()
);
create index if not exists idx_checks_patient on public.prescription_checks (patient_id, scheduled_at);

-- ── Atestados e Altas ────────────────────────────────────────────
-- kind = 'atestado' | 'alta'. CID-10 é OPCIONAL (LGPD).
create table if not exists public.certificates (
  id               uuid primary key default gen_random_uuid(),
  patient_id       uuid not null references public.patients (id) on delete cascade,
  professional_id  uuid references public.professionals (id) on delete set null,
  kind             text not null,
  days             integer,                       -- atestado: dias de afastamento
  start_date       date,                          -- atestado: início
  end_date         date,                          -- atestado: fim
  diagnosis        text,                          -- diagnóstico (texto livre)
  cid10            text,                          -- OPCIONAL por LGPD
  reason           text,                          -- alta: motivo
  post_discharge   text,                          -- alta: orientações pós-alta
  created_at       timestamptz not null default now()
);
create index if not exists idx_certificates_patient on public.certificates (patient_id, created_at desc);

-- ── Consentimentos LGPD ──────────────────────────────────────────
create table if not exists public.consents (
  id               uuid primary key default gen_random_uuid(),
  patient_id       uuid not null references public.patients (id) on delete cascade,
  professional_id  uuid references public.professionals (id) on delete set null,
  context          text not null,                 -- ex.: 'anamnese'
  accepted         boolean not null default false,
  signature        text,
  created_at       timestamptz not null default now()
);
create index if not exists idx_consents_patient on public.consents (patient_id, created_at desc);

-- ════════════════════════════════════════════════════════════════
-- RLS — dado clínico sensível: apenas admin e médico (espelha medical_records).
-- ════════════════════════════════════════════════════════════════
do $$
declare t text;
begin
  foreach t in array array[
    'anamneses','prescriptions','prescription_items','care_orders',
    'prescription_checks','certificates','consents'
  ] loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('drop policy if exists %I_clinical_all on public.%I;', t, t);
    execute format(
      'create policy %I_clinical_all on public.%I for all using (public.current_role() in (''admin'',''medico'')) with check (public.current_role() in (''admin'',''medico''));',
      t, t
    );
  end loop;
end $$;

-- ════════════════════════════════════════════════════════════════
-- ROLLBACK (manual):
--   drop table consents, certificates, prescription_checks, care_orders,
--              prescription_items, prescriptions, anamneses;
-- ════════════════════════════════════════════════════════════════


-- ╔══════════════════════════════════════════════════════════════╗
-- ║  >>> 0008_enfermagem.sql
-- ╚══════════════════════════════════════════════════════════════╝

-- ════════════════════════════════════════════════════════════════
-- agicare — migration 0008: módulo Enfermagem (Fase 4)
-- Anotações, Checagem de Cuidados, Balanço Hídrico, Evolução,
-- Escalas de Avaliação, Procedimentos e SAE (NANDA).
-- Aférições de Sinais Vitais reutilizam public.vital_signs (0004).
-- Depende de 0001 (public.is_staff()) e 0002/0004 (patients, professionals).
-- RLS: staff gerencia tudo (dado assistencial de enfermagem).
-- Idempotente: create table if not exists / drop policy if exists.
-- ════════════════════════════════════════════════════════════════

-- ── Tipos ────────────────────────────────────────────────────────
do $$ begin create type public.care_check_status as enum ('pendente','administrado','aprazado'); exception when duplicate_object then null; end $$;
do $$ begin create type public.fluid_kind        as enum ('ganho','perda'); exception when duplicate_object then null; end $$;
do $$ begin create type public.scale_kind        as enum ('glasgow','fugulin','braden'); exception when duplicate_object then null; end $$;

-- ── Anotação de Enfermagem ───────────────────────────────────────
create table if not exists public.nursing_notes (
  id               uuid primary key default gen_random_uuid(),
  code             text not null,                 -- ex.: ANO-001
  patient_id       uuid references public.patients (id) on delete set null,
  professional_id  uuid references public.professionals (id) on delete set null,
  professional_name text,                          -- desnormalizado p/ exibição
  content          text not null,
  created_at       timestamptz not null default now()
);
create index if not exists idx_nursing_notes_created on public.nursing_notes (created_at desc);

-- ── SAE (NANDA) — diagnóstico + fator + prescrição ───────────────
create table if not exists public.sae_records (
  id               uuid primary key default gen_random_uuid(),
  patient_id       uuid references public.patients (id) on delete set null,
  professional_id  uuid references public.professionals (id) on delete set null,
  coren            text,
  nanda_diagnosis  text not null,                 -- Diagnóstico NANDA
  related_factor   text,                          -- Fator relacionado
  prescription     text not null,                 -- Prescrição de enfermagem
  frequency_hours  int not null default 6,        -- gera horários na checagem
  created_at       timestamptz not null default now()
);
create index if not exists idx_sae_created on public.sae_records (created_at desc);

-- ── Checagem de Cuidados (horários gerados pela SAE/manuais) ──────
create table if not exists public.care_checks (
  id               uuid primary key default gen_random_uuid(),
  sae_id           uuid references public.sae_records (id) on delete cascade,
  patient_id       uuid references public.patients (id) on delete set null,
  description      text not null,                 -- cuidado a checar
  scheduled_at     timestamptz not null,          -- horário aprazado
  status           public.care_check_status not null default 'pendente',
  justification    text,                          -- obrigatório se não administrado
  professional_id  uuid references public.professionals (id) on delete set null,
  professional_name text,
  checked_at       timestamptz,
  created_at       timestamptz not null default now()
);
create index if not exists idx_care_checks_sched on public.care_checks (scheduled_at);

-- ── Balanço Hídrico (ciclo 24h) + lançamentos (ganhos/perdas) ────
create table if not exists public.fluid_balance (
  id               uuid primary key default gen_random_uuid(),
  patient_id       uuid references public.patients (id) on delete cascade,
  cycle_start      timestamptz not null default now(),
  cycle_end        timestamptz,
  closed           boolean not null default false,
  created_at       timestamptz not null default now()
);
create index if not exists idx_fluid_balance_patient on public.fluid_balance (patient_id, cycle_start desc);

create table if not exists public.fluid_balance_entries (
  id               uuid primary key default gen_random_uuid(),
  balance_id       uuid not null references public.fluid_balance (id) on delete cascade,
  kind             public.fluid_kind not null,    -- 'ganho' (entrada) | 'perda' (saída)
  description      text not null,                 -- ex.: Soro fisiológico, Diurese
  volume_ml        numeric(8,2) not null default 0,
  recorded_at      timestamptz not null default now(),
  professional_id  uuid references public.professionals (id) on delete set null,
  professional_name text
);
create index if not exists idx_fluid_entries_balance on public.fluid_balance_entries (balance_id, recorded_at);

-- ── Evolução de Enfermagem (Avaliação/Reavaliação/Conduta) ───────
create table if not exists public.nursing_evolutions (
  id               uuid primary key default gen_random_uuid(),
  patient_id       uuid references public.patients (id) on delete set null,
  professional_id  uuid references public.professionals (id) on delete set null,
  professional_name text,
  coren            text,
  assessment       text,                          -- Avaliação
  reassessment     text,                          -- Reavaliação
  conduct          text,                          -- Conduta
  created_at       timestamptz not null default now()
);
create index if not exists idx_nursing_evol_created on public.nursing_evolutions (created_at desc);

-- ── Escalas de Avaliação (Glasgow/Fugulin/Braden) ────────────────
create table if not exists public.assessment_scales (
  id               uuid primary key default gen_random_uuid(),
  patient_id       uuid references public.patients (id) on delete set null,
  professional_id  uuid references public.professionals (id) on delete set null,
  professional_name text,
  scale            public.scale_kind not null,
  score            int not null default 0,
  classification   text,
  details          jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now()
);
create index if not exists idx_assessment_scales_created on public.assessment_scales (created_at desc);

-- ── Procedimentos de Enfermagem (TUSS) ───────────────────────────
create table if not exists public.nursing_procedures (
  id               uuid primary key default gen_random_uuid(),
  patient_id       uuid references public.patients (id) on delete set null,
  professional_id  uuid references public.professionals (id) on delete set null,
  professional_name text,
  tuss_code        text,
  name             text not null,
  materials        text,
  body_site        text,                          -- local do corpo
  notes            text,
  performed_at     timestamptz not null default now(),
  created_at       timestamptz not null default now()
);
create index if not exists idx_nursing_proc_created on public.nursing_procedures (created_at desc);

-- ════════════════════════════════════════════════════════════════
-- RLS — staff (admin/medico/recepcao) gerencia tudo.
-- ════════════════════════════════════════════════════════════════
alter table public.nursing_notes         enable row level security;
alter table public.sae_records           enable row level security;
alter table public.care_checks           enable row level security;
alter table public.fluid_balance         enable row level security;
alter table public.fluid_balance_entries enable row level security;
alter table public.nursing_evolutions    enable row level security;
alter table public.assessment_scales     enable row level security;
alter table public.nursing_procedures    enable row level security;

do $$
declare t text;
begin
  foreach t in array array[
    'nursing_notes','sae_records','care_checks','fluid_balance',
    'fluid_balance_entries','nursing_evolutions','assessment_scales','nursing_procedures'
  ] loop
    execute format('drop policy if exists %I_staff_all on public.%I;', t, t);
    execute format(
      'create policy %I_staff_all on public.%I for all using (public.is_staff()) with check (public.is_staff());',
      t, t
    );
  end loop;
end $$;

-- ════════════════════════════════════════════════════════════════
-- ROLLBACK (manual):
--   drop table nursing_procedures, assessment_scales, nursing_evolutions,
--              fluid_balance_entries, fluid_balance, care_checks,
--              sae_records, nursing_notes;
--   drop type scale_kind, fluid_kind, care_check_status;
-- ════════════════════════════════════════════════════════════════


-- ╔══════════════════════════════════════════════════════════════╗
-- ║  >>> 0009_faturamento_lab.sql
-- ╚══════════════════════════════════════════════════════════════╝

-- ════════════════════════════════════════════════════════════════
-- agicare — migration 0009: Faturamento TISS + Laboratório Financeiro
-- Fase 7. Depende de 0001 (public.is_staff()) e 0002 (billable_events, lab_cases).
-- RLS: staff (admin/medico/recepcao) gerencia tudo.
-- Idempotente: create ... if not exists, add column if not exists, drop policy if exists.
-- ════════════════════════════════════════════════════════════════

-- ── Tipos ────────────────────────────────────────────────────────
do $$ begin create type public.lab_payment_status as enum ('orcado','aprovado','faturado','pago'); exception when duplicate_object then null; end $$;
do $$ begin create type public.tiss_guide_status  as enum ('validada','alerta','erro');            exception when duplicate_object then null; end $$;
do $$ begin create type public.tiss_batch_status  as enum ('aberto','enviado','conciliado');        exception when duplicate_object then null; end $$;
do $$ begin create type public.billing_item_kind  as enum ('tuss','material','ajuste');             exception when duplicate_object then null; end $$;

-- ── Colunas financeiras em lab_cases (Módulo Financeiro do Laboratório) ──
alter table public.lab_cases
  add column if not exists price_base      numeric(12,2) not null default 0,
  add column if not exists additions       numeric(12,2) not null default 0,
  add column if not exists discounts        numeric(12,2) not null default 0,
  add column if not exists total            numeric(12,2) not null default 0,
  add column if not exists payment_status   public.lab_payment_status not null default 'orcado';

-- ── Lotes TISS (lote XML enviado ao convênio) ────────────────────
create table if not exists public.tiss_batches (
  id                uuid primary key default gen_random_uuid(),
  code              text unique not null,                 -- ex.: LOTE-2024-001
  insurance         text,                                 -- convênio
  status            public.tiss_batch_status not null default 'aberto',
  guides_count      int not null default 0,
  total             numeric(12,2) not null default 0,
  xml_generated_at  timestamptz,                          -- quando o XML foi gerado
  created_at        timestamptz not null default now()
);
create index if not exists idx_tiss_batches_status on public.tiss_batches (status, created_at);

-- ── Guias TISS (validação + conciliação + contas a receber) ──────
create table if not exists public.tiss_guides (
  id                uuid primary key default gen_random_uuid(),
  guide_number      text not null,                        -- nº da guia
  patient_id        uuid references public.patients (id) on delete set null,
  professional_id   uuid references public.professionals (id) on delete set null,
  insurance         text,                                 -- convênio
  procedure_code    text,                                 -- código TUSS
  amount            numeric(12,2) not null default 0,
  status            public.tiss_guide_status not null default 'validada',
  validation_note   text,                                 -- mensagem de alerta/erro
  batch_id          uuid references public.tiss_batches (id) on delete set null,
  created_at        timestamptz not null default now()
);
create index if not exists idx_tiss_guides_status on public.tiss_guides (status, created_at);
create index if not exists idx_tiss_guides_batch  on public.tiss_guides (batch_id);

-- ── Itens de faturamento (conferência de check-out: TUSS, materiais, ajustes) ──
create table if not exists public.billing_items (
  id           uuid primary key default gen_random_uuid(),
  event_id     uuid references public.billable_events (id) on delete cascade,
  kind         public.billing_item_kind not null default 'tuss',
  code         text,                                      -- código TUSS / SKU do material
  description  text not null,
  quantity     numeric(12,2) not null default 1,
  unit_price   numeric(12,2) not null default 0,
  amount       numeric(12,2) not null default 0,          -- pode ser negativo (desconto)
  created_at   timestamptz not null default now()
);
create index if not exists idx_billing_items_event on public.billing_items (event_id);

-- ════════════════════════════════════════════════════════════════
-- RLS — staff gerencia tudo.
-- ════════════════════════════════════════════════════════════════
alter table public.tiss_batches enable row level security;
alter table public.tiss_guides  enable row level security;
alter table public.billing_items enable row level security;

do $$
declare t text;
begin
  foreach t in array array['tiss_batches','tiss_guides','billing_items'] loop
    execute format('drop policy if exists %I_staff_all on public.%I;', t, t);
    execute format(
      'create policy %I_staff_all on public.%I for all using (public.is_staff()) with check (public.is_staff());',
      t, t
    );
  end loop;
end $$;

-- ════════════════════════════════════════════════════════════════
-- ROLLBACK (manual):
--   drop table public.billing_items, public.tiss_guides, public.tiss_batches;
--   alter table public.lab_cases
--     drop column payment_status, drop column total, drop column discounts,
--     drop column additions, drop column price_base;
--   drop type public.billing_item_kind, public.tiss_batch_status,
--             public.tiss_guide_status, public.lab_payment_status;
-- ════════════════════════════════════════════════════════════════


-- ╔══════════════════════════════════════════════════════════════╗
-- ║  >>> 0010_gestao.sql
-- ╚══════════════════════════════════════════════════════════════╝

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


-- ╔══════════════════════════════════════════════════════════════╗
-- ║  >>> 0013_rls_hardening.sql
-- ╚══════════════════════════════════════════════════════════════╝

-- ════════════════════════════════════════════════════════════════
-- agicare — migration 0013: endurecimento de RLS (defesa em profundidade)
-- Alinha a RLS às regras de negócio "catálogo/configuração = só gestor"
-- e ao que as Server Actions já passaram a exigir (isGestor) em 15/06.
--
-- Escopo CONSERVADOR (não quebra fluxos operacionais):
--   • procedures      → LEITURA: staff (agenda/faturamento usam) | ESCRITA: só admin
--   • clinic_settings → LEITURA: staff | ESCRITA: só admin (dados fiscais)
--
-- NÃO altera SELECT de billable_events/tiss_*/billing_items: a recepção
-- precisa das CONTAGENS operacionais. O vazamento de VALORES financeiros
-- foi fechado na camada de aplicação (gate server-side em Relatórios/
-- Faturamento). Se o negócio exigir esconder valores também no banco,
-- isso vira um item separado (ex.: view agregada só-admin).
-- Idempotente. RLS já habilitada nessas tabelas em 0002/0010.
-- ════════════════════════════════════════════════════════════════

-- ── procedures: leitura staff, escrita admin ────────────────────
drop policy if exists procedures_staff_all  on public.procedures;
drop policy if exists procedures_read_staff on public.procedures;
drop policy if exists procedures_write_admin on public.procedures;

create policy procedures_read_staff on public.procedures
  for select using (public.is_staff());

create policy procedures_write_admin on public.procedures
  for all using (public.current_role() = 'admin')
  with check (public.current_role() = 'admin');

-- ── clinic_settings: leitura staff, escrita admin ───────────────
drop policy if exists clinic_settings_staff_all   on public.clinic_settings;
drop policy if exists clinic_settings_read_staff  on public.clinic_settings;
drop policy if exists clinic_settings_write_admin on public.clinic_settings;

create policy clinic_settings_read_staff on public.clinic_settings
  for select using (public.is_staff());

create policy clinic_settings_write_admin on public.clinic_settings
  for all using (public.current_role() = 'admin')
  with check (public.current_role() = 'admin');

-- ════════════════════════════════════════════════════════════════
-- ROLLBACK (manual) — volta ao comportamento staff-all anterior:
--   drop policy if exists procedures_read_staff       on public.procedures;
--   drop policy if exists procedures_write_admin      on public.procedures;
--   create policy procedures_staff_all on public.procedures
--     for all using (public.is_staff()) with check (public.is_staff());
--   drop policy if exists clinic_settings_read_staff  on public.clinic_settings;
--   drop policy if exists clinic_settings_write_admin on public.clinic_settings;
--   create policy clinic_settings_staff_all on public.clinic_settings
--     for all using (public.is_staff()) with check (public.is_staff());
-- ════════════════════════════════════════════════════════════════


-- ╔══════════════════════════════════════════════════════════════╗
-- ║  >>> 0014_auditoria_lgpd.sql
-- ╚══════════════════════════════════════════════════════════════╝

-- ════════════════════════════════════════════════════════════════
-- agicare — migration 0014: Auditoria / GRC (LGPD, Lei 13.709)
-- Log de acessos a prontuários (rastreabilidade de dados sensíveis) +
-- auditoria de consentimentos. Depende de 0001 (patients/profiles, helpers)
-- e 0007 (consents). Aplicar DEPOIS do consolidado 0004–0010.
-- ════════════════════════════════════════════════════════════════

-- ── Log de acessos a prontuários / dados sensíveis ──────────────
create table if not exists public.access_logs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references public.profiles (id) on delete set null,
  user_name   text,                       -- desnormalizado (auditoria mantém histórico)
  user_role   public.user_role,
  patient_id  uuid references public.patients (id) on delete set null,
  patient_name text,                      -- desnormalizado p/ sobreviver à exclusão do paciente
  module      text not null,              -- ex.: 'prontuario','prescricao','anamnese','evolucao'
  action      text not null default 'view', -- 'view' | 'create' | 'update' | 'delete' | 'print' | 'export'
  created_at  timestamptz not null default now()
);
create index if not exists idx_access_logs_patient on public.access_logs (patient_id, created_at desc);
create index if not exists idx_access_logs_user    on public.access_logs (user_id, created_at desc);

-- ── Auditoria de consentimentos (quem registrou) ────────────────
alter table public.consents
  add column if not exists created_by uuid references public.profiles (id);

-- ════════════════════════════════════════════════════════════════
-- RLS: staff registra (insert); SOMENTE admin lê (auditoria/conformidade).
-- ════════════════════════════════════════════════════════════════
alter table public.access_logs enable row level security;

drop policy if exists access_logs_insert_staff on public.access_logs;
create policy access_logs_insert_staff on public.access_logs
  for insert with check (public.is_staff());

drop policy if exists access_logs_read_admin on public.access_logs;
create policy access_logs_read_admin on public.access_logs
  for select using (public.current_role() = 'admin');

-- ════════════════════════════════════════════════════════════════
-- ROLLBACK (manual):
--   drop table if exists public.access_logs;
--   alter table public.consents drop column if exists created_by;
-- ════════════════════════════════════════════════════════════════


-- ╔══════════════════════════════════════════════════════════════╗
-- ║  >>> 0015_fila_totem.sql
-- ╚══════════════════════════════════════════════════════════════╝

-- ════════════════════════════════════════════════════════════════
-- agicare — migration 0015: Fluxo Totem (Fila ↔ Agenda)
-- Vincula a entrada da fila ao agendamento e registra a chegada
-- (check-in via totem). A "senha" continua sendo queue_entries.ticket_code.
-- Depende de 0001 (appointments) e 0002 (queue_entries).
-- ════════════════════════════════════════════════════════════════

alter table public.queue_entries
  add column if not exists appointment_id uuid references public.appointments (id) on delete set null,
  add column if not exists arrived_at     timestamptz;   -- momento do check-in no totem

create index if not exists idx_queue_appointment on public.queue_entries (appointment_id);

-- ════════════════════════════════════════════════════════════════
-- ROLLBACK (manual):
--   alter table public.queue_entries
--     drop column if exists appointment_id,
--     drop column if exists arrived_at;
-- ════════════════════════════════════════════════════════════════


-- ╔══════════════════════════════════════════════════════════════╗
-- ║  >>> 0016_exames.sql
-- ╚══════════════════════════════════════════════════════════════╝

-- ════════════════════════════════════════════════════════════════
-- agicare — migration 0016: Pedidos de Exames (prontuário 5.6)
-- Seleção por código TUSS, status e observações por item.
-- Dado clínico sensível (LGPD): RLS admin/medico (espelha 0007).
-- Depende de 0001 (patients/professionals/helpers).
-- ════════════════════════════════════════════════════════════════

create table if not exists public.exam_orders (
  id               uuid primary key default gen_random_uuid(),
  patient_id       uuid not null references public.patients (id) on delete cascade,
  professional_id  uuid references public.professionals (id) on delete set null,
  tuss_code        text,                          -- código oficial p/ faturamento
  exam_name        text not null,
  category         text not null default 'laboratorial', -- 'laboratorial' | 'imagem'
  status           text not null default 'solicitado',   -- 'solicitado' | 'concluido'
  notes            text,                          -- observações contextuais (ex.: jejum)
  created_at       timestamptz not null default now()
);
create index if not exists idx_exam_orders_patient on public.exam_orders (patient_id, created_at desc);

alter table public.exam_orders enable row level security;
drop policy if exists exam_orders_clinical_all on public.exam_orders;
create policy exam_orders_clinical_all on public.exam_orders
  for all using (public.current_role() in ('admin','medico'))
  with check (public.current_role() in ('admin','medico'));

-- ROLLBACK: drop table if exists public.exam_orders;


-- ╔══════════════════════════════════════════════════════════════╗
-- ║  >>> 0017_protetico.sql
-- ╚══════════════════════════════════════════════════════════════╝

-- ════════════════════════════════════════════════════════════════
-- agicare — migration 0017: Fluxo Protético no prontuário (5.5)
-- Pedido de trabalho protético (dentes, tipo, material/cor, prazo) +
-- anexos (STL/Scan, fotos, radiografias, guia de mordida) em Storage.
-- Dado clínico sensível (LGPD): RLS admin/medico.
-- Depende de 0001. Cria o bucket de Storage 'protetico' (privado).
-- ════════════════════════════════════════════════════════════════

create table if not exists public.prosthetic_orders (
  id               uuid primary key default gen_random_uuid(),
  patient_id       uuid not null references public.patients (id) on delete cascade,
  professional_id  uuid references public.professionals (id) on delete set null,
  teeth            text,                          -- ex.: '11, 12, 21'
  work_type        text,                          -- Coroa | Faceta | Ponte | Protocolo | Inlay/Onlay | Provisório
  urgent           boolean not null default false,
  due_date         date,                          -- prazo (urgente = 5 dias, padrão 10)
  material         text,
  color            text,                          -- escala de cor (ex.: A2, B1)
  clinical_notes   text,                          -- linha de término, oclusão, observações
  status           text not null default 'aberto',
  created_at       timestamptz not null default now()
);
create index if not exists idx_prosthetic_patient on public.prosthetic_orders (patient_id, created_at desc);

create table if not exists public.prosthetic_files (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid not null references public.prosthetic_orders (id) on delete cascade,
  file_name     text not null,
  storage_path  text not null,                    -- caminho dentro do bucket 'protetico'
  kind          text not null default 'scan',     -- 'scan' (STL) | 'foto' | 'radiografia' | 'mordida'
  size_bytes    bigint,
  created_at    timestamptz not null default now()
);
create index if not exists idx_prosthetic_files_order on public.prosthetic_files (order_id);

alter table public.prosthetic_orders enable row level security;
alter table public.prosthetic_files  enable row level security;
do $$
declare t text;
begin
  foreach t in array array['prosthetic_orders','prosthetic_files'] loop
    execute format('drop policy if exists %I_clinical_all on public.%I;', t, t);
    execute format(
      'create policy %I_clinical_all on public.%I for all using (public.current_role() in (''admin'',''medico'')) with check (public.current_role() in (''admin'',''medico''));',
      t, t
    );
  end loop;
end $$;

-- ── Storage: bucket privado 'protetico' + policy de staff ────────
insert into storage.buckets (id, name, public)
values ('protetico', 'protetico', false)
on conflict (id) do nothing;

drop policy if exists protetico_staff_all on storage.objects;
create policy protetico_staff_all on storage.objects
  for all using (bucket_id = 'protetico' and public.is_staff())
  with check (bucket_id = 'protetico' and public.is_staff());

-- ROLLBACK (manual):
--   drop policy if exists protetico_staff_all on storage.objects;
--   delete from storage.buckets where id = 'protetico';
--   drop table if exists public.prosthetic_files, public.prosthetic_orders;


-- ╔══════════════════════════════════════════════════════════════╗
-- ║  >>> 0018_sinais_extras.sql
-- ╚══════════════════════════════════════════════════════════════╝

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


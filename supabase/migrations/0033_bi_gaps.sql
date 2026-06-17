-- ════════════════════════════════════════════════════════════════
-- agicare — migration 0033: BI / Relatórios — fechamento de gaps (escopo 14)
--
-- Fecha lacunas dos indicadores estratégicos da tela /relatorios sem mexer
-- nos módulos donos (pacientes/agenda/faturamento) — apenas ACRESCENTA o que
-- o BI precisa para ler dado REAL:
--
--   1) ORIGEM DOS PACIENTES (ROI de marketing): `patients.origin` — canal de
--      captação (indicação, instagram, google, etc.). Coluna nova, opcional;
--      o cadastro (módulo 6) passa a preenchê-la. BI agrega por canal.
--
--   2) CONVERSÃO DE ORÇAMENTOS: não havia modelo de ORÇAMENTO CLÍNICO — o BI
--      vinha usando `lab_cases.payment_status` como proxy. Criamos um modelo
--      mínimo e honesto: `budgets` (cabeçalho: paciente, valor, status
--      proposto/aprovado/recusado) + `budget_items` (linhas opcionais). A
--      conversão passa a ser aprovados/total REAL.
--
-- O QUE NÃO entrou (decisão de engenharia, ver relatório):
--   • TEMPO MÉDIO DE ESPERA por dia da semana NÃO exige coluna nova. Já existe
--     infra REAL em `queue_entries` (arrived_at=check-in no totem 0015;
--     called_at/started_at 0029, carimbados pelas actions de fila). O BI agrega
--     essa base por dia da semana — não criamos `appointments.checked_in_at`
--     (seria coluna morta que nenhum módulo preenche).
--   • TICKET MÉDIO por especialidade reusa `billable_events` × `professionals.
--     specialty` (a especialidade vive no profissional). Sem schema novo.
--   • DESEMPENHO POR CONVÊNIO (glosa + tempo de recebimento) já é REAL a partir
--     de `tiss_guides` (0009/0024). Sem schema novo.
--
-- Depende de 0001 (patients, professionals, public.is_staff(),
-- public.current_role()) e de 0020 (clinics, current_clinic_id(),
-- set_clinic_id_default()). Idempotente: add column / create table if not
-- exists, enum com guard. budgets/budget_items são MULTITENANT (clinic_id
-- NOT NULL + trigger de default + RLS por tenant), mesmo padrão da 0035.
-- Aplicar MANUALMENTE no SQL Editor.
-- ════════════════════════════════════════════════════════════════

-- ── 1) Origem do paciente (canal de captação) ────────────────────
-- Texto livre/controlado pela UI (ex.: 'Indicação', 'Instagram', 'Google',
-- 'Convênio', 'Passante'). Null = "Não informado" no BI.
alter table public.patients
  add column if not exists origin text;

-- Agregação do BI filtra/agrupa por canal.
create index if not exists idx_patients_origin on public.patients (origin);

-- ── 2) Orçamento clínico (conversão) ─────────────────────────────
-- Status do orçamento: proposto → aprovado | recusado.
do $$ begin
  create type public.budget_status as enum ('proposto', 'aprovado', 'recusado');
exception when duplicate_object then null; end $$;

-- Cabeçalho do orçamento.
create table if not exists public.budgets (
  id               uuid primary key default gen_random_uuid(),
  clinic_id        uuid not null references public.clinics (id) on delete cascade,
  code             text,                              -- ex.: ORC-2026-001 (gerado pela app)
  patient_id       uuid references public.patients (id) on delete set null,
  professional_id  uuid references public.professionals (id) on delete set null,
  description       text,                             -- resumo/observação do orçamento
  amount           numeric(12,2) not null default 0, -- valor total proposto
  status           public.budget_status not null default 'proposto',
  decided_at       timestamptz,                       -- quando aprovado/recusado
  created_by       uuid references public.profiles (id),
  created_at       timestamptz not null default now()
);
create index if not exists idx_budgets_status  on public.budgets (status, created_at);
create index if not exists idx_budgets_patient on public.budgets (patient_id);
create index if not exists idx_budgets_clinic  on public.budgets (clinic_id);

-- Itens do orçamento (linhas opcionais — modelo mínimo).
create table if not exists public.budget_items (
  id           uuid primary key default gen_random_uuid(),
  clinic_id    uuid not null references public.clinics (id) on delete cascade,
  budget_id    uuid not null references public.budgets (id) on delete cascade,
  description  text not null,
  quantity     numeric(12,2) not null default 1,
  unit_price   numeric(12,2) not null default 0,
  amount       numeric(12,2) not null default 0,      -- quantity × unit_price (desnormalizado)
  created_at   timestamptz not null default now()
);
create index if not exists idx_budget_items_budget on public.budget_items (budget_id);

-- ── Rede de segurança: default de clinic_id (BEFORE INSERT) — 0023. ──
-- Preenche clinic_id = current_clinic_id() quando a app não setar.
do $$
declare t text;
begin
  foreach t in array array['budgets', 'budget_items'] loop
    execute format('drop trigger if exists trg_set_clinic_id_%I on public.%I;', t, t);
    execute format(
      'create trigger trg_set_clinic_id_%I
         before insert on public.%I
         for each row execute function public.set_clinic_id_default();',
      t, t
    );
  end loop;
end $$;

-- ════════════════════════════════════════════════════════════════
-- RLS — orçamento é dado de negócio/estratégico, ISOLADO por clínica:
--   • STAFF (admin/medico/recepcao) LÊ os da SUA clínica;
--   • GESTOR (papel `admin`) ESCREVE (cria/edita/decide) na SUA clínica.
-- Mesmo padrão multitenant da 0035 (amarra a current_clinic_id()).
-- ════════════════════════════════════════════════════════════════
alter table public.budgets      enable row level security;
alter table public.budget_items enable row level security;

do $$
declare t text;
begin
  foreach t in array array['budgets', 'budget_items'] loop
    -- Leitura: staff da própria clínica.
    execute format('drop policy if exists %I_staff_select on public.%I;', t, t);
    execute format(
      'create policy %I_staff_select on public.%I for select '
      'using (public.is_staff() and clinic_id = public.current_clinic_id());',
      t, t
    );
    -- Escrita (insert/update/delete): só gestor (admin) da própria clínica.
    execute format('drop policy if exists %I_gestor_write on public.%I;', t, t);
    execute format(
      'create policy %I_gestor_write on public.%I for all '
      'using (public.current_role() = ''admin'' and clinic_id = public.current_clinic_id()) '
      'with check (public.current_role() = ''admin'' and clinic_id = public.current_clinic_id());',
      t, t
    );
  end loop;
end $$;

-- ════════════════════════════════════════════════════════════════
-- ROLLBACK (manual):
--   drop trigger if exists trg_set_clinic_id_budget_items on public.budget_items;
--   drop trigger if exists trg_set_clinic_id_budgets on public.budgets;
--   drop table if exists public.budget_items;
--   drop table if exists public.budgets;
--   drop type  if exists public.budget_status;
--   drop index if exists public.idx_patients_origin;
--   alter table public.patients drop column if exists origin;
-- ════════════════════════════════════════════════════════════════

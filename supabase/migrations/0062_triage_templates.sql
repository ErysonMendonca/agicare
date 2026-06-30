-- ════════════════════════════════════════════════════════════════
-- agicare — migration 0062: modelos de triagem por especialidade
--
-- Hoje a TRIAGEM é 100% HARDCODED (sinais vitais fixos + classificação de risco
-- Manchester) no TriagemModal. Esta tabela permite que cada CLÍNICA personalize
-- os campos da triagem por especialidade, espelhando exatamente o mecanismo de
-- anamnese_templates (0051). Quando não houver linha (clinic_id, specialty)
-- ativa, o BACKEND cai no fallback hardcoded (src/lib/data/triage-templates.shared.ts)
-- que reproduz a triagem fixa atual — não há SEED aqui (a base nasce vazia).
--
--   triage_templates:
--     specialty  text   — chave da especialidade (= chaves do anamnese-config.ts)
--     fields     jsonb  — array de campos { id, tipo, label, options?, unidade? }
--     active     bool   — modelo ativo; permite "desligar" sem apagar
--   unique(clinic_id, specialty) — 1 modelo por especialidade por clínica.
--
-- Também acrescenta triage_records.data (jsonb) — guarda as respostas
-- configuráveis ({ id, label, value }[]); as colunas estruturadas legadas
-- (systolic/diastolic/...) seguem sendo preenchidas p/ BI/queries existentes.
--
-- RLS: padrão multitenant (0021) — staff lê/escreve só na própria clínica.
--   A ESCRITA (criar/editar modelo) é GATEADA por isGestor na Server Action,
--   consistente com anamnese_templates (0051). A RLS garante o isolamento por
--   tenant; o papel fino (gestor) é validado na action.
--
-- updated_at: deixado para a ACTION setar no UPDATE (mesmo padrão do 0051).
--
-- Aditiva e idempotente. DEPENDE de: clinics (0020), helpers is_staff() /
--   current_clinic_id() (0021), triage_records (0053). NÃO APLICADA
--   automaticamente — aplicar via scripts/migrate.mjs.
-- ════════════════════════════════════════════════════════════════

create table if not exists public.triage_templates (
  id         uuid primary key default gen_random_uuid(),
  clinic_id  uuid not null references public.clinics(id) on delete cascade,
  specialty  text not null,
  fields     jsonb not null default '[]'::jsonb,
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_triage_templates_clinic_specialty unique (clinic_id, specialty)
);

comment on table public.triage_templates is
  'Modelo de triagem por especialidade, personalizável por clínica. Quando não há linha ativa para (clinic_id, specialty), o backend cai no fallback de src/lib/data/triage-templates.shared.ts (triagem fixa atual). Escrita gateada por isGestor na action.';
comment on column public.triage_templates.specialty is
  'Chave da especialidade (mesmas chaves do anamnese-config.ts: ex. Odontológico, Podológico, Estético, Geral).';
comment on column public.triage_templates.fields is
  'Array JSON de campos da triagem: { id, tipo, label, section?, options?, unidade? }.';

-- índice para a query quente: buscar o modelo por clínica+especialidade.
-- (a unique já cria índice em (clinic_id, specialty); mantemos explícito por
--  clareza/idempotência — create index if not exists é no-op se já existir.)
create index if not exists idx_triage_templates_clinic_specialty
  on public.triage_templates (clinic_id, specialty);

-- ── RLS: multitenant staff-based (padrão 0021) ───────────────────
alter table public.triage_templates enable row level security;

drop policy if exists triage_templates_staff_all on public.triage_templates;
create policy triage_templates_staff_all on public.triage_templates
  for all
  using      (public.is_staff() and clinic_id = public.current_clinic_id())
  with check (public.is_staff() and clinic_id = public.current_clinic_id());

-- ── triage_records.data — respostas configuráveis (denormalizadas) ─
-- Array JSON { id, label, value }[]. As colunas estruturadas legadas seguem
-- preenchidas quando os ids correspondentes existem no template (BI/queries).
alter table public.triage_records
  add column if not exists data jsonb not null default '{}'::jsonb;

comment on column public.triage_records.data is
  'Respostas configuráveis da triagem (array { id, label, value }). As colunas estruturadas legadas seguem preenchidas para BI/queries quando os ids existirem no template.';

-- ════════════════════════════════════════════════════════════════
-- ROLLBACK (manual):
--   alter table public.triage_records drop column if exists data;
--   drop table if exists public.triage_templates;
--   (drop table remove em cascata a policy e o índice associados.)
--
-- IMPACTO: aditivo. Tabela nova nasce vazia — nenhuma triagem existente é
--   afetada e o modal continua usando o fallback hardcoded até a clínica criar
--   um modelo. Reverter apenas descarta os modelos personalizados.
-- HANDOFF: backend-dev — getTriageTemplate/listTriageTemplates com fallback +
--   upsertTriageTemplate gateado por isGestor; salvarTriagem grava `data`.
--   frontend-dev — TriagemBuilder (lousa) + TriagemModal por template.
-- ════════════════════════════════════════════════════════════════

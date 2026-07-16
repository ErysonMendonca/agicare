-- ════════════════════════════════════════════════════════════════
-- agicare — migration 0051: modelos de anamnese por especialidade
--
-- Hoje o motor de anamnese é HARDCODED em src/lib/clinico/anamnese-config.ts
-- (campos por especialidade: odontologico, podologico, estetico, geral...).
-- Esta tabela permite que cada CLÍNICA personalize os campos da anamnese por
-- especialidade, mantendo o config.ts como FALLBACK no código quando não houver
-- linha (clinic_id, specialty) ativa — esse fallback é responsabilidade do
-- BACKEND, não há SEED aqui (a base nasce vazia e usa o config hardcoded).
--
--   anamnese_templates:
--     specialty  text   — chave da especialidade (= chaves do anamnese-config.ts)
--     fields     jsonb  — array de campos { id, tipo, label, options? }
--     active     bool   — modelo ativo; permite "desligar" sem apagar
--   unique(clinic_id, specialty) — 1 modelo por especialidade por clínica.
--
-- RLS: padrão multitenant (0021) — staff lê/escreve só na própria clínica.
--   A ESCRITA (criar/editar modelo) é GATEADA por isGestor na Server Action,
--   consistente com attendance_options (0050). A RLS garante o isolamento por
--   tenant; o papel fino (gestor) é validado na action.
--
-- updated_at: deixado para a ACTION setar no UPDATE (mais simples; mesmo padrão
--   adotado no projeto). Sem trigger dedicado para não multiplicar objetos.
--
-- Aditiva e idempotente. DEPENDE de: clinics (0020), helpers is_staff() /
--   current_clinic_id() (0021). NÃO APLICADA automaticamente — aplicar via
--   scripts/migrate.mjs.
-- ════════════════════════════════════════════════════════════════

create table if not exists public.anamnese_templates (
  id         uuid primary key default gen_random_uuid(),
  clinic_id  uuid not null references public.clinics(id) on delete cascade,
  specialty  text not null,
  fields     jsonb not null default '[]'::jsonb,
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_anamnese_templates_clinic_specialty unique (clinic_id, specialty)
);

comment on table public.anamnese_templates is
  'Modelo de anamnese por especialidade, personalizável por clínica. Quando não há linha ativa para (clinic_id, specialty), o backend cai no fallback de src/lib/clinico/anamnese-config.ts. Escrita gateada por isGestor na action.';
comment on column public.anamnese_templates.specialty is
  'Chave da especialidade (mesmas chaves do anamnese-config.ts: ex. odontologico, podologico, estetico, geral).';
comment on column public.anamnese_templates.fields is
  'Array JSON de campos do formulário: { id, tipo, label, options? }.';

-- índice para a query quente: buscar o modelo por clínica+especialidade.
-- (a unique já cria índice em (clinic_id, specialty); mantemos explícito por
--  clareza/idempotência — create index if not exists é no-op se já existir.)
create index if not exists idx_anamnese_templates_clinic_specialty
  on public.anamnese_templates (clinic_id, specialty);

-- ── RLS: multitenant staff-based (padrão 0021) ───────────────────
alter table public.anamnese_templates enable row level security;

drop policy if exists anamnese_templates_staff_all on public.anamnese_templates;
create policy anamnese_templates_staff_all on public.anamnese_templates
  for all
  using      (public.is_staff() and clinic_id = public.current_clinic_id())
  with check (public.is_staff() and clinic_id = public.current_clinic_id());

-- ════════════════════════════════════════════════════════════════
-- ROLLBACK (manual):
--   drop table if exists public.anamnese_templates;
--   (drop table remove em cascata a policy e o índice associados.)
--
-- IMPACTO: aditivo. Tabela nova, nasce vazia — nenhuma anamnese existente é
--   afetada e o motor continua usando o anamnese-config.ts até a clínica criar
--   um modelo. Reverter apenas descarta os modelos personalizados.
-- HANDOFF: backend-dev — Server Action de leitura com fallback ao anamnese-
--   config.ts quando não houver template ativo; escrita gateada por isGestor e
--   setando updated_at=now() no UPDATE. frontend-dev — builder de campos (lousa).
-- ════════════════════════════════════════════════════════════════

-- ════════════════════════════════════════════════════════════════
-- agicare — migration 0107: catálogo de TERMOS DE CONSENTIMENTO
--
-- (A) public.consent_templates — documentos/termos padronizados por clínica
--     (título + texto longo). O admin cadastra; ao salvar a Ficha de
--     Atendimento, a recepção imprime os termos ATIVOS para assinatura em
--     papel. O registro de emissão vai para public.consents (0007) — esta
--     migration NÃO toca em consents.
--     Multitenant (clinic_id) + RLS no padrão *_staff_all (0021/0080/0105).
-- (B) SEED idempotente: cria, para cada clínica, o termo inicial cujo texto
--     hoje está hardcoded em FichaAtendimento.tsx (Termo de Consentimento e
--     Responsabilidade). WHERE NOT EXISTS por clinic_id + lower(title).
--
-- Aditiva e idempotente (create table/index if not exists, drop policy if
--   exists, insert ... where not exists). Sem limpeza de dados.
-- DEPENDE de: 0001 (clinics, helpers is_staff()/current_clinic_id()).
-- NÃO APLICADA automaticamente — aplicar via scripts/migrate.mjs (porta 6543).
-- ════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────
-- (A) Tabela do catálogo de termos
--   · body é texto longo (o corpo do termo, exibido/impresso na íntegra).
--   · sort_order controla a ordem de impressão dos termos no modal.
--   · active permite aposentar um termo sem apagá-lo (mantém histórico).
-- ─────────────────────────────────────────────────────────────────
create table if not exists public.consent_templates (
  id         uuid primary key default gen_random_uuid(),
  clinic_id  uuid not null references public.clinics(id) on delete cascade,
  title      text not null,
  body       text not null,
  sort_order int not null default 0,
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Query quente: listar os termos da clínica na ordem de exibição/impressão.
create index if not exists idx_consent_templates_clinic_sort
  on public.consent_templates (clinic_id, sort_order);

-- ─────────────────────────────────────────────────────────────────
-- RLS — mesmo padrão dos catálogos de parametrização (0080/0105):
--   staff da clínica ativa gerencia tudo; qualquer outro papel não enxerga
--   nada (fail-closed via current_clinic_id()). Termo padronizado é
--   parametrização (não é dado clínico do paciente) → staff_all basta; a
--   ESCRITA é restrita a admin na camada de Server Action (autorização real
--   no servidor). A recepção precisa LER os termos ativos para imprimir.
-- ─────────────────────────────────────────────────────────────────
alter table public.consent_templates enable row level security;
drop policy if exists consent_templates_staff_all on public.consent_templates;
create policy consent_templates_staff_all on public.consent_templates
  for all
  using      (public.is_staff() and clinic_id = public.current_clinic_id())
  with check (public.is_staff() and clinic_id = public.current_clinic_id());

-- ════════════════════════════════════════════════════════════════
-- (B) SEED — termo inicial por clínica.
--   Texto copiado LITERALMENTE do bloco hardcoded em
--   src/app/(app)/fila/FichaAtendimento.tsx. Idempotente por
--   clinic_id + lower(title): reexecutar não duplica nem sobrescreve um
--   termo já editado pelo admin.
-- ════════════════════════════════════════════════════════════════
insert into public.consent_templates (clinic_id, title, body, sort_order, active)
select
  c.id,
  'Termo de Consentimento e Responsabilidade',
  'Declaro sob as penas da lei que as informações cadastrais prestadas acima são verdadeiras. Autorizo a realização de consultas, exames e procedimentos indicados, consentindo com o tratamento médico necessário. Declaro também estar ciente de que as despesas não cobertas pelo meu convênio são de minha inteira responsabilidade, comprometendo-me a quitá-las diretamente com esta instituição.',
  0,
  true
from public.clinics c
where not exists (
  select 1
  from public.consent_templates ct
  where ct.clinic_id = c.id
    and lower(ct.title) = lower('Termo de Consentimento e Responsabilidade')
);

-- ════════════════════════════════════════════════════════════════
-- ROLLBACK (manual):
--   -- derruba tabela, policy e índice.
--   drop table if exists public.consent_templates;
--   -- public.consents NÃO é tocada por esta migration → nada a reverter lá.
--
-- IMPACTO: 100% aditivo. Nenhuma tabela existente é alterada. O texto do termo
--   continua também hardcoded em FichaAtendimento.tsx até o frontend passar a
--   ler de consent_templates (ver HANDOFF).
-- HANDOFF: frontend-dev — o modal de impressão deve ler os termos ATIVOS via
--   listActiveConsentTemplates() em vez do bloco hardcoded; backend-dev —
--   registrar a emissão via registrarConsentimentosImpressos() (consents.ts).
-- ════════════════════════════════════════════════════════════════

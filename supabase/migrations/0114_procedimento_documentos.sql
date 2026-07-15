-- ════════════════════════════════════════════════════════════════
-- agicare — migration 0114: Documento de Procedimentos no prontuário
--
-- "Turbina" a aba Procedimentos: além de registrar os procedimentos do
-- atendimento (procedure_executions, faturamento), o médico pode SALVAR
-- um DOCUMENTO com os procedimentos realizados — imprimível, visualizável
-- e cancelável (não destrutivo), no mesmo modelo do Ortograma (0103).
--
-- Modelo (espelha dental_charts / dental_chart_marks):
--   procedure_documents       — 1 documento por "salvar" (vários por atendimento).
--   procedure_document_items  — N procedimentos dentro de um documento, com o
--                                nome e o preço FOTOGRAFADOS no salvamento
--                                (name_snapshot / price_snapshot) — editar o
--                                catálogo depois NÃO reescreve documento antigo.
--
-- Dado clínico sensível (LGPD): RLS restrita a admin/medico da clínica ativa
-- (padrão *_clinical_all da 0021, mesmo grupo de medical_records/anamneses).
-- procedure_document_items NÃO tem clinic_id próprio: herda via join com
-- procedure_documents (mesma escolha deliberada do dental_chart_marks, 0103).
--
-- Colunas de cancelamento (cancelled_at / cancelled_by / cancel_reason) já
-- nascem na tabela — o cancelamento genérico (0111 + documento-cancelamento.ts)
-- passa a aceitar "procedure_documents" na whitelist.
--
-- Depende de 0001 (patients, professionals, profiles), 0002 (procedures),
-- 0020 (clinic_id/multitenant), 0037 (queue_entries) e 0044 (public.set_updated_at()).
-- 100% ADITIVA e IDEMPOTENTE — nenhum DROP/DELETE de dado.
-- ════════════════════════════════════════════════════════════════

-- ── 1) procedure_documents — cabeçalho do documento ───────────────
create table if not exists public.procedure_documents (
  id               uuid primary key default gen_random_uuid(),
  clinic_id        uuid not null references public.clinics (id) on delete cascade,
  patient_id       uuid not null references public.patients (id) on delete cascade,
  professional_id  uuid references public.professionals (id) on delete set null,
  -- set null (NUNCA cascade): o documento é registro clínico permanente do
  -- paciente; não some porque a entrada da fila foi removida.
  queue_entry_id   uuid references public.queue_entries (id) on delete set null,
  -- Autor do documento (mesmo padrão da 0109); sem ON DELETE p/ preservar histórico.
  created_by       uuid references public.profiles (id),
  notes            text,
  -- Cancelamento não-destrutivo (padrão 0111): null = documento ativo.
  cancelled_at     timestamptz,
  cancelled_by     uuid references public.profiles (id),
  cancel_reason    text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists idx_procedure_documents_patient
  on public.procedure_documents (clinic_id, patient_id, created_at desc);

create index if not exists idx_procedure_documents_cancelled
  on public.procedure_documents (cancelled_at) where cancelled_at is not null;

-- Reaproveita o helper genérico de touch criado na 0044.
drop trigger if exists procedure_documents_set_updated_at on public.procedure_documents;
create trigger procedure_documents_set_updated_at
  before update on public.procedure_documents
  for each row
  execute function public.set_updated_at();

-- ── 2) procedure_document_items — procedimentos do documento ──────
create table if not exists public.procedure_document_items (
  id            uuid primary key default gen_random_uuid(),
  document_id   uuid not null references public.procedure_documents (id) on delete cascade,
  -- set null: se o procedimento sair do catálogo, o item permanece (snapshot).
  procedure_id  uuid references public.procedures (id) on delete set null,
  name_snapshot  text not null,
  price_snapshot numeric(12,2) not null default 0,
  created_at    timestamptz not null default now()
);

create index if not exists idx_procedure_document_items_document
  on public.procedure_document_items (document_id);

-- ── 3) RLS — dado clínico: leitura/escrita só admin+medico da clínica ──
alter table public.procedure_documents      enable row level security;
alter table public.procedure_document_items enable row level security;

-- Padrão *_clinical_all (0021/0103): current_role() in ('admin','medico')
-- AND clinic_id = current_clinic_id().
drop policy if exists procedure_documents_clinical_all on public.procedure_documents;
create policy procedure_documents_clinical_all on public.procedure_documents
  for all
  using (
    public.current_role() in ('admin','medico')
    and clinic_id = public.current_clinic_id()
  )
  with check (
    public.current_role() in ('admin','medico')
    and clinic_id = public.current_clinic_id()
  );

-- Sem clinic_id próprio: a clínica vem do documento pai. O EXISTS é avaliado
-- COM a RLS de procedure_documents ativa (mesma lógica do dental_chart_marks).
drop policy if exists procedure_document_items_clinical_all on public.procedure_document_items;
create policy procedure_document_items_clinical_all on public.procedure_document_items
  for all
  using (
    public.current_role() in ('admin','medico')
    and exists (
      select 1 from public.procedure_documents pd
       where pd.id = procedure_document_items.document_id
         and pd.clinic_id = public.current_clinic_id()
    )
  )
  with check (
    public.current_role() in ('admin','medico')
    and exists (
      select 1 from public.procedure_documents pd
       where pd.id = procedure_document_items.document_id
         and pd.clinic_id = public.current_clinic_id()
    )
  );

-- FORCE RLS — mesma defesa em profundidade das tabelas clínicas (0021/0103).
alter table public.procedure_documents      force row level security;
alter table public.procedure_document_items force row level security;

-- ════════════════════════════════════════════════════════════════
-- ROLLBACK (manual):
--   alter table public.procedure_documents      no force row level security;
--   alter table public.procedure_document_items no force row level security;
--   drop policy if exists procedure_document_items_clinical_all on public.procedure_document_items;
--   drop policy if exists procedure_documents_clinical_all       on public.procedure_documents;
--   drop trigger if exists procedure_documents_set_updated_at on public.procedure_documents;
--   drop table if exists public.procedure_document_items;
--   drop table if exists public.procedure_documents;
--   -- public.set_updated_at() NÃO é removida (reutilizada por patients/dental_charts).
--
-- IMPACTO: reverter apaga TODOS os documentos de procedimentos (cascade).
-- Dado clínico não recriável — só com confirmação explícita.
-- ════════════════════════════════════════════════════════════════

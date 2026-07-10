-- ════════════════════════════════════════════════════════════════
-- agicare — migration 0109: AUTORIA dos DOCUMENTOS do prontuário
--
-- Todo documento clínico deve registrar QUEM o salvou (autoria), QUANDO
-- (created_at, já existente) e a QUAL atendimento pertence (queue_entry_id,
-- iniciado em 0108 p/ 5 tabelas). Esta migration:
--
--   (A) Padrão CANÔNICO de autor: `created_by uuid references profiles(id)`
--       (NULLABLE, sem ON DELETE — igual patients/appointments em 0001 e
--       consents em 0014). Gravado no backend com getCurrentUser().userId.
--       Adicionado às 12 tabelas de documento que ainda não têm autor próprio.
--       (vital_signs/procedure_executions/triage_records/consents já possuem
--       recorded_by/executed_by/created_by — NÃO tocadas aqui.)
--
--   (B) Vínculo com o ATENDIMENTO: `queue_entry_id uuid references
--       queue_entries(id) on delete set null` + índice, no MESMO padrão de
--       0108, para as 6 tabelas de enfermagem/odonto/prótese que ainda não
--       têm o elo (as demais receberam em 0108/0073/0053/0103).
--
-- 100% ADITIVA e IDEMPOTENTE (add column if not exists / create index if not
-- exists). NÃO toca em RLS (políticas por tabela permanecem as herdadas).
-- SEM backfill. SEM limpeza de dados.
-- DEPENDE de: 0001 (medical_records, profiles), 0007 (anamneses, prescriptions,
--   certificates), 0016 (exam_orders), tabelas de enfermagem/odonto/prótese,
--   queue_entries (0002 + 0060 attendance_code).
-- NÃO APLICADA automaticamente — aplicar via scripts/migrate.mjs (porta 6543).
-- ════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────
-- (A) created_by (autor) — 12 tabelas de documento.
--     NULLABLE, sem ON DELETE (preserva o histórico se o profile sumir).
--     Sem índice: não é query quente (só join p/ exibir o nome).
-- ────────────────────────────────────────────────────────────────
alter table public.medical_records
  add column if not exists created_by uuid references public.profiles (id);
alter table public.anamneses
  add column if not exists created_by uuid references public.profiles (id);
alter table public.prescriptions
  add column if not exists created_by uuid references public.profiles (id);
alter table public.certificates
  add column if not exists created_by uuid references public.profiles (id);
alter table public.exam_orders
  add column if not exists created_by uuid references public.profiles (id);
alter table public.nursing_evolutions
  add column if not exists created_by uuid references public.profiles (id);
alter table public.nursing_notes
  add column if not exists created_by uuid references public.profiles (id);
alter table public.nursing_procedures
  add column if not exists created_by uuid references public.profiles (id);
alter table public.care_checks
  add column if not exists created_by uuid references public.profiles (id);
alter table public.sae_records
  add column if not exists created_by uuid references public.profiles (id);
alter table public.dental_charts
  add column if not exists created_by uuid references public.profiles (id);
alter table public.prosthetic_orders
  add column if not exists created_by uuid references public.profiles (id);

-- ────────────────────────────────────────────────────────────────
-- (B) queue_entry_id (vínculo com o atendimento) — 6 tabelas restantes.
--     ON DELETE SET NULL + índice (query quente: agrupar por atendimento).
-- ────────────────────────────────────────────────────────────────
alter table public.nursing_evolutions
  add column if not exists queue_entry_id uuid
    references public.queue_entries (id) on delete set null;
create index if not exists idx_nursing_evolutions_queue_entry
  on public.nursing_evolutions (queue_entry_id);

alter table public.nursing_notes
  add column if not exists queue_entry_id uuid
    references public.queue_entries (id) on delete set null;
create index if not exists idx_nursing_notes_queue_entry
  on public.nursing_notes (queue_entry_id);

alter table public.nursing_procedures
  add column if not exists queue_entry_id uuid
    references public.queue_entries (id) on delete set null;
create index if not exists idx_nursing_procedures_queue_entry
  on public.nursing_procedures (queue_entry_id);

alter table public.care_checks
  add column if not exists queue_entry_id uuid
    references public.queue_entries (id) on delete set null;
create index if not exists idx_care_checks_queue_entry
  on public.care_checks (queue_entry_id);

alter table public.sae_records
  add column if not exists queue_entry_id uuid
    references public.queue_entries (id) on delete set null;
create index if not exists idx_sae_records_queue_entry
  on public.sae_records (queue_entry_id);

alter table public.prosthetic_orders
  add column if not exists queue_entry_id uuid
    references public.queue_entries (id) on delete set null;
create index if not exists idx_prosthetic_orders_queue_entry
  on public.prosthetic_orders (queue_entry_id);

-- ════════════════════════════════════════════════════════════════
-- ROLLBACK (manual):
--   -- (A) autoria:
--   alter table public.medical_records    drop column if exists created_by;
--   alter table public.anamneses          drop column if exists created_by;
--   alter table public.prescriptions      drop column if exists created_by;
--   alter table public.certificates       drop column if exists created_by;
--   alter table public.exam_orders        drop column if exists created_by;
--   alter table public.nursing_evolutions drop column if exists created_by;
--   alter table public.nursing_notes      drop column if exists created_by;
--   alter table public.nursing_procedures drop column if exists created_by;
--   alter table public.care_checks        drop column if exists created_by;
--   alter table public.sae_records        drop column if exists created_by;
--   alter table public.dental_charts      drop column if exists created_by;
--   alter table public.prosthetic_orders  drop column if exists created_by;
--   -- (B) vínculo com atendimento:
--   alter table public.nursing_evolutions drop column if exists queue_entry_id;
--   alter table public.nursing_notes      drop column if exists queue_entry_id;
--   alter table public.nursing_procedures drop column if exists queue_entry_id;
--   alter table public.care_checks        drop column if exists queue_entry_id;
--   alter table public.sae_records        drop column if exists queue_entry_id;
--   alter table public.prosthetic_orders  drop column if exists queue_entry_id;
--   -- (dropar a coluna já remove FK e índice associados)
--
-- IMPACTO: 100% aditivo. Nenhuma coluna existente muda; nenhum dado é migrado.
--   Documentos criados ANTES desta migration ficam com created_by/queue_entry_id
--   null → autor exibido como "—" e agrupados em "Anteriores". RLS inalterada.
-- DEPENDE DE: profiles (0001), queue_entries (0002 + 0060), tabelas de documento.
-- HANDOFF: backend-dev — ao CRIAR cada documento durante um atendimento,
--   preencher created_by com getCurrentUser().userId e queue_entry_id com
--   getAtendimentoAtivo(patientId).queueEntryId, para que a Linha do Tempo
--   exiba autor e agrupe por atendimento os NOVOS documentos.
-- ════════════════════════════════════════════════════════════════

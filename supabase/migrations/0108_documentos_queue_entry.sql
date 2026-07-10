-- ════════════════════════════════════════════════════════════════
-- agicare — migration 0108: liga os DOCUMENTOS CLÍNICOS ao ATENDIMENTO
--
-- Hoje o prontuário é por PACIENTE e os documentos persistem, mas a maioria
-- não grava a QUAL atendimento (entrada da fila) pertence. O nº do atendimento
-- vive em queue_entries.attendance_code. Para montar o histórico "por
-- atendimento", cada documento passa a apontar (opcionalmente) para a entrada
-- da fila que o originou — no mesmo padrão que 0073 já fez em
-- procedure_executions.queue_entry_id.
--
-- Regras de integridade:
--   · queue_entry_id é NULLABLE — documentos antigos (legados) ficam null e são
--     agrupados como "Anteriores / sem atendimento" na UI. SEM backfill.
--   · ON DELETE SET NULL — remover uma entrada de fila NUNCA apaga um documento
--     clínico (dado sensível/LGPD). O documento sobrevive, apenas perde o elo.
--   · Índice em (queue_entry_id) para a query quente de agrupar por atendimento.
--
-- 100% ADITIVA e IDEMPOTENTE (add column if not exists / create index if not
-- exists). NÃO toca em RLS (as políticas por tabela permanecem as herdadas).
-- SEM limpeza de dados.
-- DEPENDE de: 0002/0060 (queue_entries), 0007 (anamneses, prescriptions,
--   certificates), 0016 (exam_orders), 0001 (medical_records).
-- NÃO APLICADA automaticamente — aplicar via scripts/migrate.mjs (porta 6543).
-- ════════════════════════════════════════════════════════════════

-- 1) Atestados / altas / receituários (certificates distinguidos por `kind`).
alter table public.certificates
  add column if not exists queue_entry_id uuid
    references public.queue_entries (id) on delete set null;
create index if not exists idx_certificates_queue_entry
  on public.certificates (queue_entry_id);

-- 2) Prescrições médicas.
alter table public.prescriptions
  add column if not exists queue_entry_id uuid
    references public.queue_entries (id) on delete set null;
create index if not exists idx_prescriptions_queue_entry
  on public.prescriptions (queue_entry_id);

-- 3) Anamneses.
alter table public.anamneses
  add column if not exists queue_entry_id uuid
    references public.queue_entries (id) on delete set null;
create index if not exists idx_anamneses_queue_entry
  on public.anamneses (queue_entry_id);

-- 4) Solicitações de exame.
alter table public.exam_orders
  add column if not exists queue_entry_id uuid
    references public.queue_entries (id) on delete set null;
create index if not exists idx_exam_orders_queue_entry
  on public.exam_orders (queue_entry_id);

-- 5) Prontuário / evolução (dado sensível/LGPD — política herdada, intocada).
alter table public.medical_records
  add column if not exists queue_entry_id uuid
    references public.queue_entries (id) on delete set null;
create index if not exists idx_medical_records_queue_entry
  on public.medical_records (queue_entry_id);

-- ════════════════════════════════════════════════════════════════
-- ROLLBACK (manual):
--   alter table public.certificates    drop column if exists queue_entry_id;
--   alter table public.prescriptions   drop column if exists queue_entry_id;
--   alter table public.anamneses       drop column if exists queue_entry_id;
--   alter table public.exam_orders     drop column if exists queue_entry_id;
--   alter table public.medical_records drop column if exists queue_entry_id;
--   -- (dropar a coluna já remove FK e índice associados)
--
-- IMPACTO: 100% aditivo. Nenhuma coluna existente muda; nenhum dado é migrado.
--   Documentos criados ANTES desta migration mantêm queue_entry_id null e são
--   exibidos no grupo "Anteriores / sem atendimento". RLS inalterada.
-- DEPENDE DE: queue_entries (0002 + 0060 attendance_code).
-- HANDOFF: backend-dev — ao CRIAR cada documento (atestado, alta, receituário,
--   prescrição, anamnese, exame, evolução) durante um atendimento ativo,
--   preencher queue_entry_id com getAtendimentoAtivo(patientId).queueEntryId
--   para que o histórico por atendimento passe a agrupar os NOVOS documentos.
-- ════════════════════════════════════════════════════════════════

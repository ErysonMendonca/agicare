-- ════════════════════════════════════════════════════════════════
-- agicare — migration 0115: vincula procedimento executado ao documento
--
-- Ao "Salvar documento" (0114), os procedimentos registrados no atendimento
-- passam a ser "consumidos" pelo documento: saem da LISTA de registro do
-- médico, mas continuam existindo em procedure_executions para o FATURAMENTO
-- cobrar no check-out (a vinculação ao billable_event no fechamento é por
-- queue_entry_id e NÃO filtra esta coluna — cobrança preservada).
--
-- document_id null  = procedimento pendente (aparece na lista de registro).
-- document_id setado = já fotografado num documento (some da lista).
--
-- ON DELETE SET NULL: cancelamento de documento é não-destrutivo (0111), então
-- na prática o vínculo permanece; só volta a null se o documento for apagado.
--
-- Depende de 0114 (procedure_documents) e da tabela procedure_executions (0031).
-- 100% ADITIVA e IDEMPOTENTE — nenhum DROP/DELETE de dado.
-- ════════════════════════════════════════════════════════════════

alter table public.procedure_executions
  add column if not exists document_id uuid
    references public.procedure_documents (id) on delete set null;

create index if not exists idx_procedure_executions_document
  on public.procedure_executions (document_id)
  where document_id is not null;

-- ════════════════════════════════════════════════════════════════
-- ROLLBACK (manual):
--   drop index if exists public.idx_procedure_executions_document;
--   alter table public.procedure_executions drop column if exists document_id;
-- ════════════════════════════════════════════════════════════════

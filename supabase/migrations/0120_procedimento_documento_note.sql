-- ════════════════════════════════════════════════════════════════
-- agicare — migration 0120: nota do procedimento fotografada no documento
--
-- O registro de procedimento do atendimento aceita uma nota livre
-- (procedure_executions.note, coluna da 0031) usada na clínica para a
-- ESTERILIZAÇÃO do instrumental. Ao "Salvar documento" (0114), os
-- procedimentos são fotografados em procedure_document_items — mas só
-- nome e preço tinham snapshot, então a nota sumia do documento salvo.
--
-- Esta migration adiciona o snapshot da nota, no mesmo espírito de
-- name_snapshot / price_snapshot: o documento é registro permanente e
-- não deve depender da linha viva em procedure_executions.
--
-- Nullable de propósito: documentos já salvos ficam com null (nota não
-- existia no momento do salvamento) e a nota é opcional no registro.
--
-- Depende de 0114 (procedure_document_items) e da coluna note da 0031.
-- 100% ADITIVA e IDEMPOTENTE — nenhum DROP/DELETE de dado.
-- ════════════════════════════════════════════════════════════════

alter table public.procedure_document_items
  add column if not exists note_snapshot text;

-- ════════════════════════════════════════════════════════════════
-- ROLLBACK (manual):
--   alter table public.procedure_document_items drop column if exists note_snapshot;
-- ════════════════════════════════════════════════════════════════

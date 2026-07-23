-- ════════════════════════════════════════════════════════════════
-- agicare — migration 0118: vínculo Dispensação ↔ Solicitação de Produtos
--
-- Objetivo:
--   Ligar os dois fluxos de estoque que hoje vivem separados. Ao ATENDER uma
--   Solicitação de Produtos (public.product_requests, 0069) o Estoque passa a
--   gerar uma DISPENSAÇÃO por setor que dá a baixa real de saldo (trigger 0038,
--   endurecido pela 0045). Para rastrear a origem do atendimento, cada
--   dispensação pode apontar para a solicitação que a originou.
--
--   Nova coluna dispensations.product_request_id:
--     • Nullable — dispensações "manuais" (por prescrição ou por setor avulso)
--       continuam sem vínculo. Só as geradas pelo "Atender e dispensar" preenchem.
--     • on delete set null — apagar a solicitação NÃO apaga a dispensação já
--       concluída (o histórico de baixa/movimento é imutável); apenas desfaz o
--       ponteiro de origem.
--
-- Aditiva e idempotente (add column if not exists). NÃO altera RLS: a coluna
-- herda as policies existentes de public.dispensations.
-- DEPENDE de: 0006 (dispensations), 0069 (product_requests).
-- NÃO APLICADA automaticamente — aplicar manualmente no SQL Editor do Supabase.
-- ════════════════════════════════════════════════════════════════

alter table public.dispensations
  add column if not exists product_request_id uuid
    references public.product_requests (id) on delete set null;

comment on column public.dispensations.product_request_id is
  'Solicitação de produtos (0069) que originou esta dispensação, quando gerada pelo fluxo "Atender e dispensar". NULL em dispensações manuais (prescrição/setor avulso).';

create index if not exists idx_dispensations_product_request
  on public.dispensations (product_request_id);

-- ════════════════════════════════════════════════════════════════
-- ROLLBACK (manual):
--   drop index if exists public.idx_dispensations_product_request;
--   alter table public.dispensations drop column if exists product_request_id;
--
-- IMPACTO de reverter: aditivo. A coluna é nullable → dispensações existentes
--   não são afetadas. Perde-se apenas o ponteiro de origem solicitação→dispensação
--   (o vínculo por auditoria/histórico de movimentos permanece). NÃO destrói dados.
-- ════════════════════════════════════════════════════════════════

-- ════════════════════════════════════════════════════════════════
-- agicare — migration 0119: Atendimento PARCIAL de Solicitação de Produtos
--
-- Objetivo:
--   Hoje (0069/0118) uma solicitação é atendida tudo-ou-nada: uma única
--   chamada de "Atender e dispensar" marca a solicitação inteira como
--   'atendida'. Na prática, o setor fornecedor (Farmácia/Almoxarifado) nem
--   sempre tem saldo para entregar 100% do pedido de uma vez — precisa dar
--   baixa do que tem agora e voltar depois para completar o restante.
--
--   Esta migration:
--     1) Adiciona o status 'atendida_parcial' ao enum product_request_status.
--        A solicitação com esse status CONTINUA na fila de pendências do
--        Estoque até ser complementada ou concluída (decisão de produto).
--     2) Adiciona product_request_items.quantity_atendida — quantidade JÁ
--        dada baixa (cumulativa) para aquele item, através de sucessivas
--        chamadas de atendimento (bipagem por código de barras ou digitação
--        manual). quantity_atendida < quantity_num → item ainda tem saldo
--        pendente a atender.
--
-- Aditiva e idempotente. NÃO altera RLS (herda as policies existentes de
-- product_requests/product_request_items, 0069). NÃO remove nem reescreve
-- dados existentes — solicitações já 'atendida'/'cancelada'/'pendente'
-- continuam válidas; quantity_atendida nasce 0 para os itens já existentes.
-- DEPENDE de: 0069 (product_requests, product_request_items).
-- NÃO APLICADA automaticamente — aplicar manualmente no SQL Editor do Supabase.
-- ════════════════════════════════════════════════════════════════

alter type public.product_request_status add value if not exists 'atendida_parcial';

alter table public.product_request_items
  add column if not exists quantity_atendida numeric(12,2) not null default 0;

comment on column public.product_request_items.quantity_atendida is
  'Quantidade já dada baixa (cumulativa) para este item via "Atender e dispensar". '
  'quantity_atendida < quantity_num => item ainda tem saldo pendente a atender.';

-- ════════════════════════════════════════════════════════════════
-- ROLLBACK (manual):
--   alter table public.product_request_items drop column if exists quantity_atendida;
--   -- Postgres NÃO permite remover um valor de enum isoladamente; para reverter
--   -- 'atendida_parcial' seria necessário recriar o tipo (fora do escopo deste
--   -- rollback simples). Enquanto nenhuma linha usar o valor, ele fica apenas
--   -- disponível e inofensivo.
--
-- IMPACTO de reverter a coluna: aditiva, default 0 → nenhuma linha existente é
--   afetada. Perde-se apenas o rastreio de quanto já foi atendido por item.
-- ════════════════════════════════════════════════════════════════

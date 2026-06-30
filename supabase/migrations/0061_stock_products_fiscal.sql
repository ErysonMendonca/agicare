-- ════════════════════════════════════════════════════════════════
-- agicare — migration 0061: dados fiscais do produto (NCM / CEST)
--
-- Acrescenta os campos fiscais NCM e CEST ao cadastro-mestre do produto.
-- Lote (`lot`) e Validade (`expiry`) já existem (0002/0006) — esta migration
-- NÃO os recria, apenas adiciona os fiscais que faltavam no schema.
--
-- Aditiva e idempotente. DEPENDE de: 0002 (stock_products), 0058 (cadastro).
-- RLS herdada de stock_products (sem novas políticas).
-- NÃO APLICADA automaticamente — aplicar via scripts/migrate.mjs.
-- ════════════════════════════════════════════════════════════════

alter table public.stock_products
  add column if not exists ncm  text,
  add column if not exists cest text;

comment on column public.stock_products.ncm  is 'Nomenclatura Comum do Mercosul (código fiscal do produto).';
comment on column public.stock_products.cest is 'Código Especificador da Substituição Tributária.';

-- 0113 — Lateralidade do pedido de exame.
-- Aditiva e idempotente: coluna livre (Direito / Esquerdo / Bilateral / etc.).
-- Quando informada, sai impressa no pedido/relatório do exame (pedido do cliente).
-- Sem backfill, sem índice, sem RLS nova (herda as políticas de exam_orders).

alter table public.exam_orders
  add column if not exists laterality text;

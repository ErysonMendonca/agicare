-- ════════════════════════════════════════════════════════════════
-- agicare — migration 0122: procedure_id em billing_items
--
-- Motivo: o Recibo de Pagamento precisa anexar material/instrumental do
-- CATÁLOGO (procedure_materials/procedure_instruments) a cada item de
-- origem "procedimento". Sem uma FK direta, a única forma de religar um
-- billing_item ao procedimento era casar `billing_items.code` (TUSS) com
-- `procedures.code` — frágil quando o procedimento não tem TUSS real (cai
-- no fallback "10101012", que não existe em `procedures`, e o material/
-- instrumental nunca é encontrado). Guardando o procedure_id no ato do
-- check-out, a religação fica exata e não depende do código TUSS.
--
-- Aditiva e idempotente. Linhas antigas (antes desta migration) ficam com
-- procedure_id NULL — o app cai num fallback por código só para elas.
-- ════════════════════════════════════════════════════════════════

alter table public.billing_items
  add column if not exists procedure_id uuid references public.procedures (id) on delete set null;

create index if not exists idx_billing_items_procedure on public.billing_items (procedure_id);

-- ════════════════════════════════════════════════════════════════
-- ROLLBACK (manual):
--   drop index if exists idx_billing_items_procedure;
--   alter table public.billing_items drop column if exists procedure_id;
-- ════════════════════════════════════════════════════════════════

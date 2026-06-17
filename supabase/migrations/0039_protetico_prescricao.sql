-- ════════════════════════════════════════════════════════════════
-- agicare — migration 0039: campos dedicados de prescrição protética
-- e via de administração na prescrição.
--   • prosthetic_orders: linha de término + oclusão (antes só texto livre
--     dentro de clinical_notes — ver 5.5).
--   • prescription_items: via de administração por medicamento (5.4).
-- Colunas nullable → retrocompatível; RLS herdada das tabelas (0007/0017).
-- Depende de 0007 (prescription_items) e 0017 (prosthetic_orders).
-- ════════════════════════════════════════════════════════════════

-- ── Protético (5.5): linha de término e esquema oclusal dedicados ──
alter table public.prosthetic_orders
  add column if not exists finish_line text,   -- linha de término (ex.: chanfro, ombro)
  add column if not exists occlusion   text;   -- relação/ajuste oclusal

-- ── Prescrição (5.4): via de administração por medicamento ─────────
alter table public.prescription_items
  add column if not exists route text;         -- oral | EV | IM | SC | tópica | ...

-- ROLLBACK (manual):
--   alter table public.prosthetic_orders drop column if exists finish_line, drop column if exists occlusion;
--   alter table public.prescription_items drop column if exists route;

-- ════════════════════════════════════════════════════════════════
-- agicare — migration 0043: vínculo Dispensação ↔ Item Prescrito
-- ----------------------------------------------------------------
-- PROPÓSITO: rastrear QUAL item prescrito (prescription_items) deu
-- origem a cada item de dispensação (dispensation_items). Sem esse
-- vínculo, a tela de "Nova Dispensação por prescrição" reexibe TODA
-- prescrição recente do paciente — inclusive a já dispensada —,
-- permitindo N dispensações que debitam o estoque de novo a cada
-- conclusão (trigger 0038). Com a coluna, a listagem passa a EXCLUIR
-- os itens já dispensados (em dispensações não-canceladas), evitando
-- a re-dispensação acidental.
--
-- Depende de: 0006 (dispensation_items), 0007 (prescription_items),
--             0020 (clinic_id + RLS de dispensation_items).
-- Aditiva e idempotente (add column if not exists / create index if
-- not exists). NÃO mexe em RLS/clinic_id: dispensation_items já é
-- tenant-isolada (0020). Aplicar manualmente no SQL Editor.
-- ════════════════════════════════════════════════════════════════

-- Vínculo opcional ao item prescrito de origem. ON DELETE SET NULL:
-- apagar a prescrição NÃO apaga o histórico de dispensação (a baixa de
-- estoque já ocorreu), apenas solta o vínculo de rastreabilidade.
alter table public.dispensation_items
  add column if not exists prescription_item_id uuid
    references public.prescription_items (id) on delete set null;

comment on column public.dispensation_items.prescription_item_id is
  'Item prescrito (prescription_items.id) que originou esta linha de dispensação. Null = origem por setor ou item avulso. Usado para evitar re-dispensar o mesmo item prescrito.';

-- Índice para o anti-duplicidade: filtra dispensation_items por
-- prescription_item_id ao montar a lista de itens prescritos pendentes.
create index if not exists idx_dispensation_items_presc_item
  on public.dispensation_items (prescription_item_id)
  where prescription_item_id is not null;

-- ── Rollback (manual) ─────────────────────────────────────────────
--   drop index if exists public.idx_dispensation_items_presc_item;
--   alter table public.dispensation_items
--     drop column if exists prescription_item_id;

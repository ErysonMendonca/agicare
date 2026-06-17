-- ════════════════════════════════════════════════════════════════
-- agicare — migration 0024: Faturamento — Check-out, Empresa, TISS
-- Fecha gaps do módulo 13 (Faturamento). Persistência real de:
--   • itens conferidos (billing_items, já em 0009) — TUSS + materiais reais;
--   • descontos/acréscimos do check-out (billable_events.discount/surcharge);
--   • forma de cobrança "empresa" (novo valor do enum billing_kind);
--   • conciliação TISS (glosa por guia → billing_status já existe).
-- Depende de 0002 (billable_events, billing_kind, billing_status) e
--           0009 (billing_items, tiss_guides, tiss_batches).
-- RLS: tabelas reaproveitadas (já têm policy de staff em 0002/0009).
-- Idempotente: add value if not exists, add column if not exists.
-- SEM clinic_id (multitenant 0020 não aplicado — segue padrão 0004-0019).
-- ════════════════════════════════════════════════════════════════

-- ── Forma de cobrança "empresa" no enum billing_kind ─────────────
-- (Particular/Convênio já existem em 0002.) add value não roda dentro
-- de bloco/transação em algumas versões → usar IF NOT EXISTS direto.
alter type public.billing_kind add value if not exists 'empresa';

-- ── Ajustes financeiros do check-out em billable_events ──────────
-- discount  = desconto aplicado (valor positivo abatido do subtotal)
-- surcharge = acréscimo aplicado (valor positivo somado ao subtotal)
-- net_amount = total final cobrado após ajustes (desnormalizado p/ KPIs)
-- payment_method = forma de pagamento quando particular (pix/cartao/boleto)
alter table public.billable_events
  add column if not exists discount        numeric(12,2) not null default 0,
  add column if not exists surcharge       numeric(12,2) not null default 0,
  add column if not exists net_amount      numeric(12,2),
  add column if not exists payment_method  text,
  add column if not exists checked_out_at  timestamptz;

-- ── Reforço de colunas em billing_items (já criadas em 0009) ─────
-- source = origem do item ('procedimento' | 'exame' | 'material' | 'ajuste')
alter table public.billing_items
  add column if not exists source text;

-- ── Conciliação TISS: registro de glosa/aceite por guia ──────────
-- reconciled_at = quando a guia foi conciliada (aceita ou glosada)
-- glosa_amount  = valor glosado (parcial/total); glosa_reason = motivo
alter table public.tiss_guides
  add column if not exists reconciled_at  timestamptz,
  add column if not exists glosa_amount   numeric(12,2) not null default 0,
  add column if not exists glosa_reason   text;

-- ════════════════════════════════════════════════════════════════
-- RLS: billable_events, billing_items, tiss_guides já têm policy de
-- staff (0002/0009). Nenhuma tabela nova → nada a (re)criar aqui.
-- ════════════════════════════════════════════════════════════════

-- ════════════════════════════════════════════════════════════════
-- ROLLBACK (manual):
--   alter table public.tiss_guides
--     drop column if exists glosa_reason, drop column if exists glosa_amount,
--     drop column if exists reconciled_at;
--   alter table public.billing_items drop column if exists source;
--   alter table public.billable_events
--     drop column if exists checked_out_at, drop column if exists payment_method,
--     drop column if exists net_amount, drop column if exists surcharge,
--     drop column if exists discount;
--   -- 'empresa' não pode ser removido de um enum sem recriar o tipo.
-- ════════════════════════════════════════════════════════════════

-- ════════════════════════════════════════════════════════════════
-- agicare — migration 0009: Faturamento TISS + Laboratório Financeiro
-- Fase 7. Depende de 0001 (public.is_staff()) e 0002 (billable_events, lab_cases).
-- RLS: staff (admin/medico/recepcao) gerencia tudo.
-- Idempotente: create ... if not exists, add column if not exists, drop policy if exists.
-- ════════════════════════════════════════════════════════════════

-- ── Tipos ────────────────────────────────────────────────────────
do $$ begin create type public.lab_payment_status as enum ('orcado','aprovado','faturado','pago'); exception when duplicate_object then null; end $$;
do $$ begin create type public.tiss_guide_status  as enum ('validada','alerta','erro');            exception when duplicate_object then null; end $$;
do $$ begin create type public.tiss_batch_status  as enum ('aberto','enviado','conciliado');        exception when duplicate_object then null; end $$;
do $$ begin create type public.billing_item_kind  as enum ('tuss','material','ajuste');             exception when duplicate_object then null; end $$;

-- ── Colunas financeiras em lab_cases (Módulo Financeiro do Laboratório) ──
alter table public.lab_cases
  add column if not exists price_base      numeric(12,2) not null default 0,
  add column if not exists additions       numeric(12,2) not null default 0,
  add column if not exists discounts        numeric(12,2) not null default 0,
  add column if not exists total            numeric(12,2) not null default 0,
  add column if not exists payment_status   public.lab_payment_status not null default 'orcado';

-- ── Lotes TISS (lote XML enviado ao convênio) ────────────────────
create table if not exists public.tiss_batches (
  id                uuid primary key default gen_random_uuid(),
  code              text unique not null,                 -- ex.: LOTE-2024-001
  insurance         text,                                 -- convênio
  status            public.tiss_batch_status not null default 'aberto',
  guides_count      int not null default 0,
  total             numeric(12,2) not null default 0,
  xml_generated_at  timestamptz,                          -- quando o XML foi gerado
  created_at        timestamptz not null default now()
);
create index if not exists idx_tiss_batches_status on public.tiss_batches (status, created_at);

-- ── Guias TISS (validação + conciliação + contas a receber) ──────
create table if not exists public.tiss_guides (
  id                uuid primary key default gen_random_uuid(),
  guide_number      text not null,                        -- nº da guia
  patient_id        uuid references public.patients (id) on delete set null,
  professional_id   uuid references public.professionals (id) on delete set null,
  insurance         text,                                 -- convênio
  procedure_code    text,                                 -- código TUSS
  amount            numeric(12,2) not null default 0,
  status            public.tiss_guide_status not null default 'validada',
  validation_note   text,                                 -- mensagem de alerta/erro
  batch_id          uuid references public.tiss_batches (id) on delete set null,
  created_at        timestamptz not null default now()
);
create index if not exists idx_tiss_guides_status on public.tiss_guides (status, created_at);
create index if not exists idx_tiss_guides_batch  on public.tiss_guides (batch_id);

-- ── Itens de faturamento (conferência de check-out: TUSS, materiais, ajustes) ──
create table if not exists public.billing_items (
  id           uuid primary key default gen_random_uuid(),
  event_id     uuid references public.billable_events (id) on delete cascade,
  kind         public.billing_item_kind not null default 'tuss',
  code         text,                                      -- código TUSS / SKU do material
  description  text not null,
  quantity     numeric(12,2) not null default 1,
  unit_price   numeric(12,2) not null default 0,
  amount       numeric(12,2) not null default 0,          -- pode ser negativo (desconto)
  created_at   timestamptz not null default now()
);
create index if not exists idx_billing_items_event on public.billing_items (event_id);

-- ════════════════════════════════════════════════════════════════
-- RLS — staff gerencia tudo.
-- ════════════════════════════════════════════════════════════════
alter table public.tiss_batches enable row level security;
alter table public.tiss_guides  enable row level security;
alter table public.billing_items enable row level security;

do $$
declare t text;
begin
  foreach t in array array['tiss_batches','tiss_guides','billing_items'] loop
    execute format('drop policy if exists %I_staff_all on public.%I;', t, t);
    execute format(
      'create policy %I_staff_all on public.%I for all using (public.is_staff()) with check (public.is_staff());',
      t, t
    );
  end loop;
end $$;

-- ════════════════════════════════════════════════════════════════
-- ROLLBACK (manual):
--   drop table public.billing_items, public.tiss_guides, public.tiss_batches;
--   alter table public.lab_cases
--     drop column payment_status, drop column total, drop column discounts,
--     drop column additions, drop column price_base;
--   drop type public.billing_item_kind, public.tiss_batch_status,
--             public.tiss_guide_status, public.lab_payment_status;
-- ════════════════════════════════════════════════════════════════

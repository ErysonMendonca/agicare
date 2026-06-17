-- ════════════════════════════════════════════════════════════════
-- agicare — migration 0006: módulo Estoque completo (Fase 6)
-- Fornecedores, Dispensação (c/ itens), Entradas (NF), Inventário
-- (c/ contagens) e Compras (solicitações + cotações).
-- Depende de 0001 (helper public.is_staff()) e 0002 (stock_products,
-- stock_movements). RLS: staff gerencia tudo; valores financeiros são
-- restritos ao gestor NO FRONT (via isGestor).
-- Idempotente: create ... if not exists / add column if not exists /
-- drop policy if exists. Aplicar manualmente no SQL Editor do Supabase.
-- ════════════════════════════════════════════════════════════════

-- ── Tipos ────────────────────────────────────────────────────────
do $$ begin create type public.dispensation_kind   as enum ('prescricao','setor');                       exception when duplicate_object then null; end $$;
do $$ begin create type public.dispensation_status as enum ('pendente','separacao','concluido','cancelado'); exception when duplicate_object then null; end $$;
do $$ begin create type public.purchase_status     as enum ('solicitado','cotacao','aprovado','reprovado');   exception when duplicate_object then null; end $$;
do $$ begin create type public.inventory_kind      as enum ('geral','parcial');                            exception when duplicate_object then null; end $$;
do $$ begin create type public.inventory_status    as enum ('aberto','fechado');                           exception when duplicate_object then null; end $$;

-- ── Fornecedores ─────────────────────────────────────────────────
create table if not exists public.suppliers (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  cnpj        text,
  contact     text,        -- nome do contato
  phone       text,
  email       text,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

-- ── Colunas extras em stock_products (financeiro + rastreabilidade) ─
alter table public.stock_products
  add column if not exists cost        numeric(12,2) not null default 0,  -- custo unitário (FINANCEIRO)
  add column if not exists price       numeric(12,2) not null default 0,  -- preço de venda  (FINANCEIRO)
  add column if not exists expiry      date,                              -- validade do lote
  add column if not exists location    text,                              -- localização física (ex.: Prateleira A3)
  add column if not exists supplier_id uuid references public.suppliers (id) on delete set null;

-- ── Dispensação (pedidos por paciente/prescrição ou por setor) ───
create table if not exists public.dispensations (
  id              uuid primary key default gen_random_uuid(),
  code            text not null,                                -- ex.: PRESC-001, REQ-014
  kind            public.dispensation_kind not null default 'prescricao',
  status          public.dispensation_status not null default 'pendente',
  urgent          boolean not null default false,
  patient_id      uuid references public.patients (id) on delete set null,
  professional_id uuid references public.professionals (id) on delete set null,
  origin_label    text,                                         -- "Paciente" | "Setor"
  origin_name     text,                                         -- nome do paciente/setor
  origin_ref      text,                                         -- identificador (PAC-.., SET-..)
  requested_by    text,                                         -- solicitante (texto livre)
  progress        int not null default 0,                       -- 0–100 (separação)
  created_at      timestamptz not null default now()
);
create index if not exists idx_dispensations_status on public.dispensations (status, created_at);

create table if not exists public.dispensation_items (
  id              uuid primary key default gen_random_uuid(),
  dispensation_id uuid not null references public.dispensations (id) on delete cascade,
  product_id      uuid references public.stock_products (id) on delete set null,
  name            text not null,                                -- desnormalizado p/ exibição
  quantity        text,                                         -- ex.: "3 ampolas"
  location        text,                                         -- ex.: "Prateleira A3"
  barcode         text,
  lot             text,
  expiry          date,
  picked          boolean not null default false,               -- separado?
  created_at      timestamptz not null default now()
);
create index if not exists idx_dispensation_items_disp on public.dispensation_items (dispensation_id);

-- ── Compras (solicitações + cotações) ────────────────────────────
create table if not exists public.purchase_requests (
  id            uuid primary key default gen_random_uuid(),
  code          text not null,                                  -- ex.: SC-2025-001
  product_id    uuid references public.stock_products (id) on delete set null,
  product_name  text not null,                                  -- desnormalizado
  quantity      text,                                           -- ex.: "100 caixas"
  justification text,                                           -- justificativa
  status        public.purchase_status not null default 'solicitado',
  requested_by  uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now()
);
create index if not exists idx_purchase_requests_status on public.purchase_requests (status, created_at);

create table if not exists public.quotations (
  id                  uuid primary key default gen_random_uuid(),
  purchase_request_id uuid not null references public.purchase_requests (id) on delete cascade,
  supplier_id         uuid references public.suppliers (id) on delete set null,
  supplier_name       text not null,                            -- desnormalizado
  amount              numeric(12,2) not null default 0,         -- valor cotado (FINANCEIRO)
  lead_time           text,                                     -- prazo de entrega
  attachment_url      text,                                     -- upload da cotação
  approved            boolean,                                  -- null=pendente, true/false=decisão
  created_at          timestamptz not null default now()
);
create index if not exists idx_quotations_request on public.quotations (purchase_request_id);

-- ── Inventário (geral/parcial) + até 3 contagens de conferência ──
create table if not exists public.inventories (
  id          uuid primary key default gen_random_uuid(),
  code        text not null,                                    -- ex.: INV-2025-001
  kind        public.inventory_kind not null default 'geral',
  category    text,                                             -- preenchido quando parcial
  status      public.inventory_status not null default 'aberto',
  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  closed_at   timestamptz
);

create table if not exists public.inventory_counts (
  id            uuid primary key default gen_random_uuid(),
  inventory_id  uuid not null references public.inventories (id) on delete cascade,
  product_id    uuid references public.stock_products (id) on delete set null,
  product_name  text not null,                                  -- desnormalizado
  system_qty    numeric(12,2) not null default 0,               -- saldo do sistema
  count_1       numeric(12,2),                                  -- 1ª contagem
  count_2       numeric(12,2),                                  -- 2ª contagem
  count_3       numeric(12,2),                                  -- 3ª contagem
  created_at    timestamptz not null default now()
);
create index if not exists idx_inventory_counts_inv on public.inventory_counts (inventory_id);

-- ── Entradas de produtos (NF) — colunas extras em stock_movements ─
alter table public.stock_movements
  add column if not exists invoice_number text,                 -- nº da Nota Fiscal
  add column if not exists supplier_id    uuid references public.suppliers (id) on delete set null,
  add column if not exists total_value    numeric(12,2);        -- valor total da NF (FINANCEIRO)

-- ════════════════════════════════════════════════════════════════
-- RLS — staff (admin/medico/recepcao) gerencia tudo.
-- ════════════════════════════════════════════════════════════════
alter table public.suppliers          enable row level security;
alter table public.dispensations      enable row level security;
alter table public.dispensation_items enable row level security;
alter table public.purchase_requests  enable row level security;
alter table public.quotations         enable row level security;
alter table public.inventories        enable row level security;
alter table public.inventory_counts   enable row level security;

do $$
declare t text;
begin
  foreach t in array array[
    'suppliers','dispensations','dispensation_items','purchase_requests',
    'quotations','inventories','inventory_counts'
  ] loop
    execute format('drop policy if exists %I_staff_all on public.%I;', t, t);
    execute format(
      'create policy %I_staff_all on public.%I for all using (public.is_staff()) with check (public.is_staff());',
      t, t
    );
  end loop;
end $$;

-- ════════════════════════════════════════════════════════════════
-- ROLLBACK (manual):
--   drop table inventory_counts, inventories, quotations, purchase_requests,
--              dispensation_items, dispensations, suppliers;
--   alter table stock_movements drop column invoice_number, drop column supplier_id, drop column total_value;
--   alter table stock_products  drop column cost, drop column price, drop column expiry,
--              drop column location, drop column supplier_id;
--   drop type inventory_status, inventory_kind, purchase_status,
--             dispensation_status, dispensation_kind;
-- ════════════════════════════════════════════════════════════════

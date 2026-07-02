-- ════════════════════════════════════════════════════════════════
-- agicare — migration 0069: Solicitação de Produtos por setor
-- Tela onde cada setor (Farmácia/Recepção/Médico) PEDE produtos, sem ver o
-- saldo do estoque. A solicitação nasce 'pendente'; o Estoque a ATENDE (baixa
-- real segue pela Dispensação existente — aqui só registra o pedido/atendimento).
-- Depende de 0001 (is_staff), 0021 (current_clinic_id), 0002 (stock_products).
-- Multitenant: clinic_id NOT NULL. RLS padrão *_staff_all (0021).
-- Idempotente: create ... if not exists / drop policy if exists.
-- ════════════════════════════════════════════════════════════════

do $$ begin
  create type public.product_request_status as enum ('pendente','atendida','cancelada');
exception when duplicate_object then null; end $$;

-- ── Cabeçalho da solicitação ─────────────────────────────────────
create table if not exists public.product_requests (
  id           uuid primary key default gen_random_uuid(),
  clinic_id    uuid not null references public.clinics (id) on delete cascade,
  code         text not null,                                   -- ex.: SOL-2026-0001
  setor        text not null,                                   -- Farmácia | Recepção | Médico
  status       public.product_request_status not null default 'pendente',
  urgent       boolean not null default false,
  notes        text,
  requested_by uuid references public.profiles (id) on delete set null,
  attended_by  uuid references public.profiles (id) on delete set null,
  attended_at  timestamptz,
  created_at   timestamptz not null default now()
);
create index if not exists idx_product_requests_status
  on public.product_requests (clinic_id, status, created_at);

-- ── Itens da solicitação (desnormaliza nome/unidade p/ histórico estável) ──
create table if not exists public.product_request_items (
  id           uuid primary key default gen_random_uuid(),
  clinic_id    uuid not null references public.clinics (id) on delete cascade,
  request_id   uuid not null references public.product_requests (id) on delete cascade,
  product_id   uuid references public.stock_products (id) on delete set null,
  product_name text not null,                                   -- desnormalizado p/ exibição
  unit         text,
  quantity_num numeric(12,2) not null default 0,
  created_at   timestamptz not null default now()
);
create index if not exists idx_product_request_items_req
  on public.product_request_items (request_id);

-- ── RLS: qualquer staff da clínica ATIVA cria/lê/atende (padrão 0021) ──────
alter table public.product_requests      enable row level security;
alter table public.product_request_items enable row level security;

drop policy if exists product_requests_staff_all on public.product_requests;
create policy product_requests_staff_all on public.product_requests
  for all
  using      (public.is_staff() and clinic_id = public.current_clinic_id())
  with check (public.is_staff() and clinic_id = public.current_clinic_id());

drop policy if exists product_request_items_staff_all on public.product_request_items;
create policy product_request_items_staff_all on public.product_request_items
  for all
  using      (public.is_staff() and clinic_id = public.current_clinic_id())
  with check (public.is_staff() and clinic_id = public.current_clinic_id());

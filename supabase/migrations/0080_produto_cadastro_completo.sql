-- ════════════════════════════════════════════════════════════════
-- agicare — migration 0080: cadastro COMPLETO de produto (grau farmácia)
--
-- (A) Enriquece public.stock_products com blocos de:
--     Classificação, Controle, Prescrição, Outras informações e Solução composta.
-- (B) 7 tabelas-filhas 1:N do produto (unidades, mín/máx, vias de administração,
--     princípios ativos, marcas, locais de requisição e classificação XYZ),
--     TODAS multitenant (clinic_id) com RLS no padrão *_staff_all (0050/0021).
-- (C) SEED de catálogos novos em public.attendance_options por clínica.
--
-- Aditiva e idempotente (add column if not exists / create table if not exists /
--   drop policy if exists / on conflict do nothing).
-- DEPENDE de: 0001 (clinics, helpers is_staff()/current_clinic_id()),
--             0002/0058/0061 (stock_products), 0050 (attendance_options),
--             0078 (índices únicos PARCIAIS de attendance_options — usados no ON CONFLICT).
-- NÃO APLICADA automaticamente — aplicar via scripts/migrate.mjs (porta 6543).
-- ════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────
-- (A) Novas colunas em stock_products
-- ─────────────────────────────────────────────────────────────────
alter table public.stock_products
  -- Classificação
  add column if not exists product_type       text,
  add column if not exists product_group      text,
  add column if not exists classification     text,
  add column if not exists subclassification  text,
  add column if not exists port_344           boolean not null default false,
  add column if not exists cfop               text,
  -- Controle
  add column if not exists ctrl_lote_validade boolean not null default false,
  add column if not exists ctrl_opme          boolean not null default false,
  add column if not exists ctrl_numero_serie  boolean not null default false,
  add column if not exists ctrl_marca         boolean not null default false,
  -- Prescrição
  add column if not exists presc_qualquer_via        boolean not null default false,
  add column if not exists presc_qualquer_frequencia boolean not null default false,
  add column if not exists presc_se_necessario       boolean not null default false,
  add column if not exists solicita_se_necessario    text not null default 'NAO SOLICITA',
  add column if not exists sal_principio_ativo        text not null default 'NAO SUBSTITUI',
  -- Outras informações
  add column if not exists info_alto_custo             boolean not null default false,
  add column if not exists info_alto_risco             boolean not null default false,
  add column if not exists info_urgencia               boolean not null default false,
  add column if not exists info_oncologia              boolean not null default false,
  add column if not exists info_antimicrobiano_restrito boolean not null default false,
  add column if not exists info_dva                    boolean not null default false,
  add column if not exists info_uso_continuo           boolean not null default false,
  add column if not exists info_nao_padrao             boolean not null default false,
  -- Solução composta
  add column if not exists sol_componente_diluido  boolean not null default false,
  add column if not exists sol_componente_diluente boolean not null default false;

-- ─────────────────────────────────────────────────────────────────
-- (B) Tabelas-filhas 1:N do produto. Todas multitenant + RLS staff.
--     Padrão de cada uma: id/clinic_id/product_id(cascade)/active/created_at,
--     índice em (product_id), RLS enable + policy staff (drop if exists antes).
-- ─────────────────────────────────────────────────────────────────

-- (B.1) product_units — unidades/apresentações do produto
create table if not exists public.product_units (
  id               uuid primary key default gen_random_uuid(),
  clinic_id        uuid not null,
  product_id       uuid not null references public.stock_products(id) on delete cascade,
  unit_label       text,
  unit_type        text,
  apresentacao     text,
  ordem            int,
  quantidade       numeric(12,2),
  controla_estoque boolean not null default true,
  active           boolean not null default true,
  created_at       timestamptz not null default now()
);
create index if not exists idx_product_units_product on public.product_units (product_id);
alter table public.product_units enable row level security;
drop policy if exists product_units_staff_all on public.product_units;
create policy product_units_staff_all on public.product_units
  for all
  using      (public.is_staff() and clinic_id = public.current_clinic_id())
  with check (public.is_staff() and clinic_id = public.current_clinic_id());

-- (B.2) product_min_max — estoque mínimo/máximo
create table if not exists public.product_min_max (
  id           uuid primary key default gen_random_uuid(),
  clinic_id    uuid not null,
  product_id   uuid not null references public.stock_products(id) on delete cascade,
  min_quantity numeric(12,2),
  max_quantity numeric(12,2),
  active       boolean not null default true,
  created_at   timestamptz not null default now()
);
create index if not exists idx_product_min_max_product on public.product_min_max (product_id);
alter table public.product_min_max enable row level security;
drop policy if exists product_min_max_staff_all on public.product_min_max;
create policy product_min_max_staff_all on public.product_min_max
  for all
  using      (public.is_staff() and clinic_id = public.current_clinic_id())
  with check (public.is_staff() and clinic_id = public.current_clinic_id());

-- (B.3) product_admin_routes — vias de administração
create table if not exists public.product_admin_routes (
  id          uuid primary key default gen_random_uuid(),
  clinic_id   uuid not null,
  product_id  uuid not null references public.stock_products(id) on delete cascade,
  route_label text not null,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);
create index if not exists idx_product_admin_routes_product on public.product_admin_routes (product_id);
alter table public.product_admin_routes enable row level security;
drop policy if exists product_admin_routes_staff_all on public.product_admin_routes;
create policy product_admin_routes_staff_all on public.product_admin_routes
  for all
  using      (public.is_staff() and clinic_id = public.current_clinic_id())
  with check (public.is_staff() and clinic_id = public.current_clinic_id());

-- (B.4) product_active_ingredients — princípios ativos
create table if not exists public.product_active_ingredients (
  id               uuid primary key default gen_random_uuid(),
  clinic_id        uuid not null,
  product_id       uuid not null references public.stock_products(id) on delete cascade,
  ingredient_label text not null,
  active           boolean not null default true,
  created_at       timestamptz not null default now()
);
create index if not exists idx_product_active_ingredients_product on public.product_active_ingredients (product_id);
alter table public.product_active_ingredients enable row level security;
drop policy if exists product_active_ingredients_staff_all on public.product_active_ingredients;
create policy product_active_ingredients_staff_all on public.product_active_ingredients
  for all
  using      (public.is_staff() and clinic_id = public.current_clinic_id())
  with check (public.is_staff() and clinic_id = public.current_clinic_id());

-- (B.5) product_brands — marcas (com registro ANVISA e validade)
create table if not exists public.product_brands (
  id                  uuid primary key default gen_random_uuid(),
  clinic_id           uuid not null,
  product_id          uuid not null references public.stock_products(id) on delete cascade,
  brand_label         text not null,
  anvisa_registration text,
  registration_expiry date,
  active              boolean not null default true,
  created_at          timestamptz not null default now()
);
create index if not exists idx_product_brands_product on public.product_brands (product_id);
alter table public.product_brands enable row level security;
drop policy if exists product_brands_staff_all on public.product_brands;
create policy product_brands_staff_all on public.product_brands
  for all
  using      (public.is_staff() and clinic_id = public.current_clinic_id())
  with check (public.is_staff() and clinic_id = public.current_clinic_id());

-- (B.6) product_requisition_locations — locais de requisição
create table if not exists public.product_requisition_locations (
  id             uuid primary key default gen_random_uuid(),
  clinic_id      uuid not null,
  product_id     uuid not null references public.stock_products(id) on delete cascade,
  location_label text not null,
  active         boolean not null default true,
  created_at     timestamptz not null default now()
);
create index if not exists idx_product_requisition_locations_product on public.product_requisition_locations (product_id);
alter table public.product_requisition_locations enable row level security;
drop policy if exists product_requisition_locations_staff_all on public.product_requisition_locations;
create policy product_requisition_locations_staff_all on public.product_requisition_locations
  for all
  using      (public.is_staff() and clinic_id = public.current_clinic_id())
  with check (public.is_staff() and clinic_id = public.current_clinic_id());

-- (B.7) product_xyz — classificação XYZ com vigência
create table if not exists public.product_xyz (
  id         uuid primary key default gen_random_uuid(),
  clinic_id  uuid not null,
  product_id uuid not null references public.stock_products(id) on delete cascade,
  xyz_class  text not null check (xyz_class in ('X','Y','Z')),
  start_date date,
  end_date   date,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists idx_product_xyz_product on public.product_xyz (product_id);
alter table public.product_xyz enable row level security;
drop policy if exists product_xyz_staff_all on public.product_xyz;
create policy product_xyz_staff_all on public.product_xyz
  for all
  using      (public.is_staff() and clinic_id = public.current_clinic_id())
  with check (public.is_staff() and clinic_id = public.current_clinic_id());

-- ════════════════════════════════════════════════════════════════
-- (C) SEED — catálogos novos em attendance_options, por clínica.
--   label = value; sort_order incremental. active default true.
--   ON CONFLICT: a 0078 trocou a unique global por índices PARCIAIS. Como
--   todas estas categorias são != 'detalhe_alta', usamos o índice parcial
--   uq_attendance_options_flat: on conflict (clinic_id, category, value)
--   where category <> 'detalhe_alta' do nothing. Idempotente.
-- ════════════════════════════════════════════════════════════════
insert into public.attendance_options (clinic_id, category, label, value, sort_order)
select c.id, s.category, s.value, s.value, s.sort_order
from public.clinics c
cross join (values
  -- tipo_produto
  ('tipo_produto',    'Medicamento',                       0),
  ('tipo_produto',    'Material',                          1),
  ('tipo_produto',    'Solução',                           2),
  ('tipo_produto',    'Insumo',                            3),
  ('tipo_produto',    'EPI',                               4),
  -- grupo_produto
  ('grupo_produto',   '0001 - Drogas e Medicamentos',      0),
  ('grupo_produto',   '0002 - Material Médico Hospitalar', 1),
  ('grupo_produto',   '0003 - Insumos',                    2),
  -- unidade_medida
  ('unidade_medida',  'Ampola (AMP)',                      0),
  ('unidade_medida',  'Comprimido (COMP)',                 1),
  ('unidade_medida',  'Frasco (FR)',                       2),
  ('unidade_medida',  'Caixa (CX)',                        3),
  ('unidade_medida',  'Unidade (UN)',                      4),
  ('unidade_medida',  'Mililitro (ML)',                    5),
  ('unidade_medida',  'Miligrama (MG)',                    6),
  -- via_administracao
  ('via_administracao','Intramuscular (IM)',               0),
  ('via_administracao','Subcutânea (SC)',                  1),
  ('via_administracao','Intravenosa (IV)',                 2),
  ('via_administracao','Oral (VO)',                        3),
  ('via_administracao','Tópica',                           4),
  ('via_administracao','Inalatória',                       5),
  -- principio_ativo
  ('principio_ativo', 'Atropina',                          0),
  ('principio_ativo', 'Dipirona',                          1),
  ('principio_ativo', 'Adrenalina',                        2),
  ('principio_ativo', 'Dexametasona',                      3),
  ('principio_ativo', 'Ondansetrona',                      4)
) as s(category, value, sort_order)
on conflict (clinic_id, category, value) where category <> 'detalhe_alta' do nothing;

-- ════════════════════════════════════════════════════════════════
-- ROLLBACK (manual):
--   -- (C) seed
--   delete from public.attendance_options
--     where category in ('tipo_produto','grupo_produto','unidade_medida',
--                        'via_administracao','principio_ativo');
--   -- (B) tabelas-filhas (policies/índices caem junto)
--   drop table if exists public.product_xyz;
--   drop table if exists public.product_requisition_locations;
--   drop table if exists public.product_brands;
--   drop table if exists public.product_active_ingredients;
--   drop table if exists public.product_admin_routes;
--   drop table if exists public.product_min_max;
--   drop table if exists public.product_units;
--   -- (A) colunas de stock_products
--   alter table public.stock_products
--     drop column if exists product_type, drop column if exists product_group,
--     drop column if exists classification, drop column if exists subclassification,
--     drop column if exists port_344, drop column if exists cfop,
--     drop column if exists ctrl_lote_validade, drop column if exists ctrl_opme,
--     drop column if exists ctrl_numero_serie, drop column if exists ctrl_marca,
--     drop column if exists presc_qualquer_via, drop column if exists presc_qualquer_frequencia,
--     drop column if exists presc_se_necessario, drop column if exists solicita_se_necessario,
--     drop column if exists sal_principio_ativo, drop column if exists info_alto_custo,
--     drop column if exists info_alto_risco, drop column if exists info_urgencia,
--     drop column if exists info_oncologia, drop column if exists info_antimicrobiano_restrito,
--     drop column if exists info_dva, drop column if exists info_uso_continuo,
--     drop column if exists info_nao_padrao, drop column if exists sol_componente_diluido,
--     drop column if exists sol_componente_diluente;
--
-- IMPACTO: 100% aditivo. Colunas novas têm default (booleans false / textos com
--   default) → não quebram inserts existentes. Tabelas-filhas nascem vazias e
--   isoladas por clínica via RLS. O seed só cria linhas novas (idempotente).
-- HANDOFF: backend-dev — CRUD das tabelas-filhas (sempre setando clinic_id =
--   current_clinic_id()) e leitura dos catálogos por (clinic_id, category, active);
--   frontend-dev — abas do cadastro completo de produto consumindo estes dados.
-- ════════════════════════════════════════════════════════════════

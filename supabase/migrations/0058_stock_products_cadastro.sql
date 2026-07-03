-- ════════════════════════════════════════════════════════════════
-- agicare — migration 0058: cadastro de produto completo + código AUTO
--
-- (1) `code_number` — número de produto SEQUENCIAL por clínica (1, 2, 3, …),
--     atribuído pelo sistema (não digitável, só números). É o "Código" exibido.
--     A coluna legada `code` (text unique global) é auto-preenchida (clinic:num)
--     só para manter a unicidade/NOT NULL; não é mais digitada pelo usuário.
-- (2) Campos novos do cadastro-mestre do produto/medicamento (grau farmácia).
--
-- Aditiva e idempotente. DEPENDE de: 0002 (stock_products), 0006 (cost/price/…),
-- 0020 (clinic_id). Splitter do migrate.mjs respeita blocos `$$`.
-- NÃO APLICADA automaticamente — aplicar via scripts/migrate.mjs.
-- ════════════════════════════════════════════════════════════════

-- 1) Colunas: número sequencial + campos do cadastro completo.
alter table public.stock_products
  add column if not exists code_number          integer,
  add column if not exists active_ingredient    text,    -- princípio ativo
  add column if not exists presentation         text,    -- apresentação/concentração
  add column if not exists barcode              text,    -- código de barras (EAN)
  add column if not exists anvisa_registration  text,    -- registro ANVISA
  add column if not exists therapeutic_class    text,    -- classe terapêutica
  add column if not exists controlled_class     text,    -- controlado/tarja (Portaria 344); null = não
  add column if not exists requires_prescription boolean not null default false,
  add column if not exists max_quantity         numeric(12,2) not null default 0,  -- estoque máximo
  add column if not exists manufacturer         text,    -- fabricante/laboratório
  add column if not exists notes                text;    -- observações

-- 2) Backfill: numera os produtos SEM número, sequencial por clínica (ordem de
--    cadastro). Idempotente (só toca nos null).
with numbered as (
  select id,
         row_number() over (partition by clinic_id order by created_at, id) as rn
  from public.stock_products
  where code_number is null
)
update public.stock_products p
set code_number = n.rn
from numbered n
where p.id = n.id;

-- 3) Atribuição automática no INSERT: próximo número da clínica (max + 1) e
--    auto-preenche o `code` legado quando vazio (mantém unicidade global).
create or replace function public.set_stock_product_code_number()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.code_number is null then
    perform pg_advisory_xact_lock(
      hashtext('stock_products_code_number:' || coalesce(new.clinic_id::text, 'null'))
    );
    select coalesce(max(code_number), 0) + 1
      into new.code_number
      from public.stock_products
     where clinic_id is not distinct from new.clinic_id;
  end if;
  if new.code is null or new.code = '' then
    new.code := coalesce(new.clinic_id::text, 'noclinic') || ':' || new.code_number::text;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_set_stock_product_code_number on public.stock_products;
create trigger trg_set_stock_product_code_number
  before insert on public.stock_products
  for each row execute function public.set_stock_product_code_number();

-- 4) Unicidade do número dentro da clínica.
create unique index if not exists uq_stock_products_clinic_code_number
  on public.stock_products (clinic_id, code_number);

-- ════════════════════════════════════════════════════════════════
-- ROLLBACK (manual):
--   drop trigger if exists trg_set_stock_product_code_number on public.stock_products;
--   drop function if exists public.set_stock_product_code_number();
--   drop index if exists public.uq_stock_products_clinic_code_number;
--   alter table public.stock_products
--     drop column if exists code_number, drop column if exists active_ingredient,
--     drop column if exists presentation, drop column if exists barcode,
--     drop column if exists anvisa_registration, drop column if exists therapeutic_class,
--     drop column if exists controlled_class, drop column if exists requires_prescription,
--     drop column if exists max_quantity, drop column if exists manufacturer,
--     drop column if exists notes;
-- ════════════════════════════════════════════════════════════════

-- ════════════════════════════════════════════════════════════════
-- agicare — migration 0038: SALDO de estoque acompanha os MOVIMENTOS (escopo 12)
--
-- Fecha o gap "o saldo do produto não acompanha os movimentos". Hoje só a
-- execução de PROCEDIMENTO (0031) debita o saldo; dispensação, entrada por NF e
-- fechamento de inventário mudavam só status/registro, sem tocar
-- stock_products.quantity. Esta migration liga os três fluxos restantes ao saldo
-- por TRIGGER, na MESMA filosofia de integridade da 0031:
--
--   POR QUE TRIGGER (e não loop read-then-write no Server Action)?
--     • Atomicidade real: a alteração de saldo roda na MESMA transação do fato
--       (conclusão da dispensação / insert do movimento / fechamento do
--       inventário) — tudo-ou-nada. O loop em N round-trips do app sofre
--       corrida/oversell e estado parcial em caso de falha.
--     • Trava de linha: o UPDATE em stock_products bloqueia a linha do produto,
--       serializando operações concorrentes (sem oversell, piso em 0).
--     • Fonte única de verdade: qualquer caminho que dispare o fato ajusta o
--       saldo — a regra vive no banco, não duplicada em cada action.
--   As funções são SECURITY DEFINER mas FILTRAM TUDO por clinic_id (da própria
--   linha), preservando o isolamento multitenant (não vaza entre clínicas).
--
-- DIVISÃO DE RESPONSABILIDADE POR TIPO DE MOVIMENTO (evita DUPLA CONTAGEM):
--   • 'entrada' → incrementa o saldo via trigger GENÉRICO em stock_movements
--                 (fn_stock_entrada_saldo). É o ÚNICO tipo tratado lá.
--   • 'saida'   → debitada pelo SEU fluxo de origem, que insere o movimento E
--                 abate o saldo na mesma função: execução de procedimento (0031)
--                 e dispensação concluída (esta migration). O trigger genérico
--                 IGNORA 'saida' de propósito.
--   • 'ajuste'  → reconciliação de inventário (esta migration) seta o saldo ao
--                 valor contado (absoluto) e grava o movimento da divergência. O
--                 trigger genérico IGNORA 'ajuste' de propósito.
--
-- Depende de 0001 (helpers), 0002 (stock_products/_movements + enum
-- movement_type 'entrada'/'saida'/'ajuste'), 0006 (dispensations/_items,
-- inventories/_counts), 0020-0023 (clinic_id NOT NULL + set_clinic_id_default),
-- 0031 (execution_id + baixa por execução). RLS: nenhuma tabela nova — as
-- colunas adicionadas herdam as policies existentes de stock_movements.
-- Idempotente: add column if not exists / create or replace / drop trigger if
-- exists. NÃO aplicar aqui — runner externo aplica.
-- ════════════════════════════════════════════════════════════════

-- ── 1) Schema: quantidade NUMÉRICA por item + rastreio de ORIGEM ────
-- dispensation_items.quantity é TEXT ("3 ampolas", só exibição). Para debitar o
-- saldo precisamos de um número confiável: quantity_num. Itens legados/mock
-- ficam com 0 e NÃO debitam (fail-safe — nunca abatem o que não sabem medir).
alter table public.dispensation_items
  add column if not exists quantity_num numeric(12,2) not null default 0;

comment on column public.dispensation_items.quantity_num is
  'Quantidade NUMÉRICA do item (base da baixa de estoque). quantity (text) é só rótulo de exibição.';

-- stock_movements: de qual dispensação/inventário a saída/ajuste veio (auditoria
-- + guarda de idempotência), espelhando execution_id da 0031.
alter table public.stock_movements
  add column if not exists dispensation_id uuid references public.dispensations (id) on delete set null,
  add column if not exists inventory_id    uuid references public.inventories   (id) on delete set null;
create index if not exists idx_movements_dispensation on public.stock_movements (dispensation_id);
create index if not exists idx_movements_inventory    on public.stock_movements (inventory_id);

-- ── 2) ENTRADA → incrementa o saldo (trigger genérico em stock_movements) ──
-- Trata SOMENTE 'entrada'. 'saida'/'ajuste' são responsabilidade do fluxo de
-- origem (ver cabeçalho) — aqui no-op, sem dupla contagem.
create or replace function public.fn_stock_entrada_saldo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.type = 'entrada' and new.product_id is not null and new.quantity > 0 then
    update public.stock_products sp
       set quantity = sp.quantity + new.quantity
     where sp.id = new.product_id
       and sp.clinic_id = new.clinic_id;   -- trava a linha; escopo de clínica
  end if;
  return new;
end;
$$;

comment on function public.fn_stock_entrada_saldo() is
  'Incrementa stock_products.quantity ao inserir um movimento de ENTRADA (NF). Ignora saida/ajuste (tratados no fluxo de origem). Escopado por clinic_id.';

drop trigger if exists trg_stock_entrada_saldo on public.stock_movements;
create trigger trg_stock_entrada_saldo
  after insert on public.stock_movements
  for each row execute function public.fn_stock_entrada_saldo();

-- ── 3) DISPENSAÇÃO concluída → baixa (saída) ───────────────────────
-- Dispara só na TRANSIÇÃO de status para 'concluido'. Debita cada item com
-- produto identificado e quantidade > 0 (trava de linha, piso 0) e grava o
-- movimento de saída auditável (quem/quando/origem). Idempotente: se já existe
-- saída desta dispensação, não repete (protege re-conclusões).
create or replace function public.fn_baixa_estoque_dispensacao()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare r record;
begin
  -- só na transição → 'concluido'
  if new.status <> 'concluido' or old.status is not distinct from 'concluido' then
    return new;
  end if;

  -- idempotência: baixa já feita?
  if exists (
    select 1 from public.stock_movements m
     where m.dispensation_id = new.id and m.type = 'saida'
  ) then
    return new;
  end if;

  for r in
    select di.product_id, di.quantity_num
      from public.dispensation_items di
     where di.dispensation_id = new.id
       and di.product_id is not null
       and di.quantity_num > 0
  loop
    update public.stock_products sp
       set quantity = greatest(0, sp.quantity - r.quantity_num)
     where sp.id = r.product_id
       and sp.clinic_id = new.clinic_id;

    insert into public.stock_movements
      (clinic_id, product_id, type, quantity, reason, created_by, dispensation_id)
    values
      (new.clinic_id, r.product_id, 'saida', r.quantity_num,
       'Baixa por dispensação ' || coalesce(new.code, ''),
       auth.uid(), new.id);
  end loop;

  return new;
end;
$$;

comment on function public.fn_baixa_estoque_dispensacao() is
  'Debita os itens da dispensação do saldo ao concluí-la (transição → concluido). Atômica, trava a linha, piso 0, movimento auditável. Idempotente por dispensation_id. Escopada por clinic_id.';

drop trigger if exists trg_baixa_estoque_dispensacao on public.dispensations;
create trigger trg_baixa_estoque_dispensacao
  after update on public.dispensations
  for each row execute function public.fn_baixa_estoque_dispensacao();

-- ── 4) INVENTÁRIO fechado → reconciliação (ajuste) ─────────────────
-- Dispara só na transição de status para 'fechado'. Para cada item com produto
-- e ALGUMA contagem (última preenchida = coalesce(count_3,count_2,count_1)),
-- trava a linha, reconcilia o saldo para a contagem final e grava um movimento
-- de 'ajuste' com a divergência (saldo_anterior → contado). Itens sem contagem
-- são ignorados (nunca zeram o que não foi conferido). Idempotente por
-- inventory_id.
create or replace function public.fn_reconcilia_inventario()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r       record;
  v_atual numeric(12,2);
  v_delta numeric(12,2);
begin
  if new.status <> 'fechado' or old.status is not distinct from 'fechado' then
    return new;
  end if;

  -- idempotência: já reconciliado?
  if exists (
    select 1 from public.stock_movements m
     where m.inventory_id = new.id and m.type = 'ajuste'
  ) then
    return new;
  end if;

  for r in
    select ic.product_id,
           coalesce(ic.count_3, ic.count_2, ic.count_1) as final_count
      from public.inventory_counts ic
     where ic.inventory_id = new.id
       and ic.product_id is not null
       and coalesce(ic.count_3, ic.count_2, ic.count_1) is not null
  loop
    -- trava a linha e lê o saldo atual
    select sp.quantity into v_atual
      from public.stock_products sp
     where sp.id = r.product_id
       and sp.clinic_id = new.clinic_id
     for update;
    if not found then continue; end if;

    v_delta := r.final_count - v_atual;
    if v_delta = 0 then continue; end if;

    update public.stock_products sp
       set quantity = r.final_count
     where sp.id = r.product_id
       and sp.clinic_id = new.clinic_id;

    insert into public.stock_movements
      (clinic_id, product_id, type, quantity, reason, created_by, inventory_id)
    values
      (new.clinic_id, r.product_id, 'ajuste', abs(v_delta),
       'Ajuste por inventário ' || coalesce(new.code, '') ||
         ' (divergência ' || case when v_delta > 0 then '+' else '' end || v_delta::text || ')',
       auth.uid(), new.id);
  end loop;

  return new;
end;
$$;

comment on function public.fn_reconcilia_inventario() is
  'Reconcilia stock_products.quantity para a contagem final ao fechar o inventário (transição → fechado), gravando um movimento de ajuste por divergência. Itens sem contagem são preservados. Idempotente por inventory_id. Escopada por clinic_id.';

drop trigger if exists trg_reconcilia_inventario on public.inventories;
create trigger trg_reconcilia_inventario
  after update on public.inventories
  for each row execute function public.fn_reconcilia_inventario();

-- ════════════════════════════════════════════════════════════════
-- ROLLBACK (manual):
--   drop trigger if exists trg_reconcilia_inventario      on public.inventories;
--   drop trigger if exists trg_baixa_estoque_dispensacao  on public.dispensations;
--   drop trigger if exists trg_stock_entrada_saldo        on public.stock_movements;
--   drop function if exists public.fn_reconcilia_inventario();
--   drop function if exists public.fn_baixa_estoque_dispensacao();
--   drop function if exists public.fn_stock_entrada_saldo();
--   alter table public.stock_movements
--     drop column if exists dispensation_id, drop column if exists inventory_id;
--   alter table public.dispensation_items drop column if exists quantity_num;
--
-- IMPACTO de reverter: o saldo volta a NÃO acompanhar dispensação/entrada/
-- inventário (só a baixa por procedimento da 0031 segue valendo). Movimentos já
-- gravados permanecem (histórico íntegro); apenas para de ajustar o saldo. NÃO
-- destrói dados. Saldos já alterados NÃO são revertidos automaticamente.
-- ════════════════════════════════════════════════════════════════

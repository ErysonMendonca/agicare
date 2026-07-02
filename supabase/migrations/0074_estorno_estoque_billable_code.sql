-- ════════════════════════════════════════════════════════════════
-- agicare — migration 0074: estorno de estoque + código sequencial do
-- faturamento (follow-ups do fechamento do atendimento).
-- 1) Ao REMOVER uma execução de procedimento, DEVOLVE os insumos ao estoque
--    (espelho do trigger de baixa 0031) — atômico, na mesma transação.
-- 2) billable_events.code gerado por SEQUENCE global (EVT-YYYY-NNNNNN) — evita
--    colisão do código aleatório anterior.
-- Depende de 0031 (fn_baixa_estoque_execucao / procedure_materials / stock_*),
-- 0006 (billable_events). Idempotente.
-- ════════════════════════════════════════════════════════════════

-- ── 1) Estorno de estoque ao remover execução de procedimento ────
create or replace function public.fn_estorno_estoque_execucao()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  -- Devolve cada insumo do procedimento ao estoque da clínica da execução.
  for r in
    select pm.product_id, pm.quantity
      from public.procedure_materials pm
     where pm.procedure_id = old.procedure_id
       and pm.quantity > 0
  loop
    update public.stock_products sp
       set quantity = sp.quantity + r.quantity
     where sp.id = r.product_id
       and sp.clinic_id = old.clinic_id;

    -- Movimento de ENTRADA (estorno) auditável. execution_id fica null (a
    -- execução está sendo removida); a origem fica no reason.
    insert into public.stock_movements
      (clinic_id, product_id, type, quantity, reason, created_by, execution_id)
    values
      (old.clinic_id, r.product_id, 'entrada', r.quantity,
       'Estorno automático por remoção de execução de procedimento',
       old.executed_by, null);
  end loop;

  return old;
end;
$$;

comment on function public.fn_estorno_estoque_execucao() is
  'Devolve os insumos (procedure_materials) ao estoque ao REMOVER uma execução de procedimento. Espelho de fn_baixa_estoque_execucao (0031). Atômico, escopado por clinic_id.';

drop trigger if exists trg_estorno_estoque_execucao on public.procedure_executions;
create trigger trg_estorno_estoque_execucao
  before delete on public.procedure_executions
  for each row execute function public.fn_estorno_estoque_execucao();

-- ── 2) Código sequencial global do billable_event ────────────────
create sequence if not exists public.billable_events_code_seq;

create or replace function public.set_billable_event_code()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- Só gera quando não veio um código explícito (preserva chamadas existentes).
  if new.code is null or new.code = '' then
    new.code := 'EVT-' || extract(year from now())::int || '-'
      || lpad(nextval('public.billable_events_code_seq')::text, 6, '0');
  end if;
  return new;
end;
$$;

drop trigger if exists trg_set_billable_event_code on public.billable_events;
create trigger trg_set_billable_event_code
  before insert on public.billable_events
  for each row execute function public.set_billable_event_code();

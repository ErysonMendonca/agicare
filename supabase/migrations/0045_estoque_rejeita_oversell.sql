-- ════════════════════════════════════════════════════════════════
-- agicare — migration 0045: baixa de estoque REJEITA oversell (B2)
--
-- A 0038 (fn_baixa_estoque_dispensacao) debitava com `greatest(0, saldo-qtd)`
-- = PISO 0: ao concluir uma dispensação com qtd > saldo, o estoque zerava
-- SILENCIOSAMENTE. Como a baixa real só acontece na conclusão, N dispensações
-- pendentes passavam individualmente na trava de criação (qtd≤saldo) e, somadas,
-- dispensavam mais do que existe — oversell mascarado.
--
-- Esta migration recria a função para:
--   1) TRAVAR a linha do produto (SELECT ... FOR UPDATE) antes de checar/baixar,
--      serializando conclusões concorrentes do mesmo produto;
--   2) REJEITAR (raise exception) quando quantity_num > saldo atual, abortando a
--      conclusão em vez de zerar — o saldo passa a ser garantido na conclusão.
-- Mantém: idempotência por dispensation_id, escopo por clinic_id, movimento
-- auditável. Aditiva/idempotente (CREATE OR REPLACE). DEPENDE de: 0038.
-- ════════════════════════════════════════════════════════════════

create or replace function public.fn_baixa_estoque_dispensacao()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r       record;
  v_saldo numeric(12,2);
  v_nome  text;
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
    -- Trava a linha do produto e lê o saldo ATUAL (serializa conclusões
    -- concorrentes do mesmo produto: a 2ª espera a 1ª e revê o saldo).
    select sp.quantity, sp.name
      into v_saldo, v_nome
      from public.stock_products sp
     where sp.id = r.product_id
       and sp.clinic_id = new.clinic_id
     for update;

    if not found then
      -- Produto inexistente nesta clínica (item legado): ignora, não baixa.
      continue;
    end if;

    -- REJEITA o oversell: aborta a conclusão (em vez de zerar com piso 0).
    if r.quantity_num > v_saldo then
      raise exception
        'Saldo insuficiente para concluir a dispensação % : "%" pede %, disponível %.',
        coalesce(new.code, ''), coalesce(v_nome, r.product_id::text),
        r.quantity_num, v_saldo
        using errcode = 'check_violation';
    end if;

    update public.stock_products sp
       set quantity = sp.quantity - r.quantity_num
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
  'Debita os itens da dispensação do saldo ao concluí-la (transição → concluido). Trava a linha (FOR UPDATE), REJEITA quando qtd > saldo (sem piso 0), movimento auditável. Idempotente por dispensation_id. Escopada por clinic_id. (0045 endureceu a 0038.)';

-- O trigger já existe (0038) e aponta para esta função; o CREATE OR REPLACE
-- acima basta. Recriado aqui por idempotência defensiva:
drop trigger if exists trg_baixa_estoque_dispensacao on public.dispensations;
create trigger trg_baixa_estoque_dispensacao
  after update on public.dispensations
  for each row execute function public.fn_baixa_estoque_dispensacao();

-- ════════════════════════════════════════════════════════════════
-- ROLLBACK (manual) — volta ao comportamento piso-0 da 0038:
--   (reaplicar a definição original de fn_baixa_estoque_dispensacao da 0038)
-- ════════════════════════════════════════════════════════════════

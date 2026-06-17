-- ════════════════════════════════════════════════════════════════
-- agicare — migration 0031: Integração ESTOQUE ↔ PROCEDIMENTO + gaps Estoque
--
-- 1) BAIXA AUTOMÁTICA de insumos ao EXECUTAR/faturar um procedimento (9.1).
--    Modelo: tabela `procedure_executions` (cada execução é um fato auditável)
--    + TRIGGER que, na inserção, debita os materiais vinculados
--    (procedure_materials) do saldo de `stock_products` e grava o movimento
--    em `stock_movements` (quem/quando/origem).
--
--    POR QUE TRIGGER (e não loop no Server Action)?
--      - Atomicidade real: a baixa roda na MESMA transação do INSERT da
--        execução — tudo-ou-nada. O loop atual em registrarExecucao faz
--        read-then-write em N requisições separadas (corrida/oversell e
--        estado parcial em caso de falha).
--      - Garantia independente da origem: qualquer caminho que crie a
--        execução (Server Action de procedimentos OU o faturamento) dispara
--        a baixa — regra de negócio centralizada no banco, não duplicada.
--      - Trava de linha: o UPDATE em stock_products bloqueia a linha do
--        produto, serializando execuções concorrentes (sem oversell).
--    A função é SECURITY DEFINER mas FILTRA TUDO por new.clinic_id, então a
--    isolação multitenant é preservada (não vaza entre clínicas).
--
-- 2) Upload de PDF de cotação (12.3): bucket privado 'cotacoes' + colunas de
--    anexo em `quotations`. RLS de Storage por convenção de path
--    (cotacoes/<clinic_id>/...), espelhando o bucket 'protetico' (0021).
--
-- Depende de 0001 (is_staff/current_role), 0002 (stock_products/_movements,
-- procedures, billable_events, appointments), 0006 (quotations), 0020/0021
-- (clinic_id NOT NULL + current_clinic_id + RLS multitenant), 0028
-- (procedure_materials). RLS multitenant em toda tabela nova.
-- Idempotente: create ... if not exists / add column if not exists /
-- drop policy|trigger if exists. NÃO aplicar aqui — runner externo aplica.
-- ════════════════════════════════════════════════════════════════

-- ── 1) Execuções de procedimento (origem da baixa de estoque) ──────
create table if not exists public.procedure_executions (
  id                uuid primary key default gen_random_uuid(),
  clinic_id         uuid not null references public.clinics (id) on delete cascade,
  procedure_id      uuid not null references public.procedures (id) on delete cascade,
  appointment_id    uuid references public.appointments (id) on delete set null,     -- origem (agenda), opcional
  patient_id        uuid references public.patients (id) on delete set null,         -- paciente atendido, opcional
  billable_event_id uuid references public.billable_events (id) on delete set null,  -- origem (faturamento), opcional
  executed_by       uuid references public.profiles (id) on delete set null,         -- QUEM executou
  note              text,
  created_at        timestamptz not null default now()                              -- QUANDO
);
create index if not exists idx_proc_exec_clinic    on public.procedure_executions (clinic_id, created_at desc);
create index if not exists idx_proc_exec_procedure on public.procedure_executions (procedure_id);
create index if not exists idx_proc_exec_billable  on public.procedure_executions (billable_event_id);

-- ── stock_movements: rastreio de ORIGEM (qual execução gerou a saída) ─
alter table public.stock_movements
  add column if not exists execution_id uuid references public.procedure_executions (id) on delete set null;
create index if not exists idx_movements_execution on public.stock_movements (execution_id);

-- ── Função de baixa (roda na transação do INSERT da execução) ──────
create or replace function public.fn_baixa_estoque_execucao()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  -- Para cada insumo vinculado ao procedimento, na clínica da execução:
  for r in
    select pm.product_id, pm.quantity
      from public.procedure_materials pm
     where pm.procedure_id = new.procedure_id
       and pm.quantity > 0
  loop
    -- Debita o saldo TRAVANDO a linha do produto (serializa concorrência;
    -- piso em 0 para nunca negativar). Escopo de clínica explícito.
    update public.stock_products sp
       set quantity = greatest(0, sp.quantity - r.quantity)
     where sp.id = r.product_id
       and sp.clinic_id = new.clinic_id;

    -- Movimento de saída AUDITÁVEL: quem (created_by), quando (created_at
    -- default now()), origem (execution_id + reason).
    insert into public.stock_movements
      (clinic_id, product_id, type, quantity, reason, created_by, execution_id)
    values
      (new.clinic_id, r.product_id, 'saida', r.quantity,
       'Baixa automática por execução de procedimento',
       new.executed_by, new.id);
  end loop;

  return new;
end;
$$;

comment on function public.fn_baixa_estoque_execucao() is
  'Debita os insumos (procedure_materials) do estoque ao inserir uma execução de procedimento. Atômica (mesma transação), trava a linha do produto e grava movimento auditável (quem/quando/origem). Escopada por clinic_id.';

drop trigger if exists trg_baixa_estoque_execucao on public.procedure_executions;
create trigger trg_baixa_estoque_execucao
  after insert on public.procedure_executions
  for each row execute function public.fn_baixa_estoque_execucao();

-- ── 2) Cotações: anexo (PDF) ───────────────────────────────────────
-- attachment_url (0006) é reusado como o NOME do arquivo (rótulo de exibição).
alter table public.quotations
  add column if not exists attachment_path text,    -- caminho no bucket 'cotacoes'
  add column if not exists attachment_size bigint;  -- bytes (validação ≤ 5MB)

-- Bucket privado de cotações + RLS por convenção de path
-- (cotacoes/<clinic_id>/<purchase_request_id>/<arquivo>), igual ao 'protetico'.
insert into storage.buckets (id, name, public)
values ('cotacoes', 'cotacoes', false)
on conflict (id) do nothing;

drop policy if exists cotacoes_staff_all on storage.objects;
create policy cotacoes_staff_all on storage.objects
  for all using (
    bucket_id = 'cotacoes'
    and public.is_staff()
    and (storage.foldername(name))[1] = public.current_clinic_id()::text
  ) with check (
    bucket_id = 'cotacoes'
    and public.is_staff()
    and (storage.foldername(name))[1] = public.current_clinic_id()::text
  );

-- ════════════════════════════════════════════════════════════════
-- RLS — procedure_executions: staff da clínica ativa (multitenant 0021).
-- ════════════════════════════════════════════════════════════════
alter table public.procedure_executions enable row level security;
drop policy if exists procedure_executions_staff_all on public.procedure_executions;
create policy procedure_executions_staff_all on public.procedure_executions
  for all using (public.is_staff() and clinic_id = public.current_clinic_id())
  with check (public.is_staff() and clinic_id = public.current_clinic_id());

-- ════════════════════════════════════════════════════════════════
-- ROLLBACK (manual):
--   drop trigger if exists trg_baixa_estoque_execucao on public.procedure_executions;
--   drop function if exists public.fn_baixa_estoque_execucao();
--   alter table public.stock_movements drop column if exists execution_id;
--   drop table if exists public.procedure_executions;
--   alter table public.quotations drop column if exists attachment_path, drop column if exists attachment_size;
--   drop policy if exists cotacoes_staff_all on storage.objects;
--   delete from storage.buckets where id = 'cotacoes';
-- ════════════════════════════════════════════════════════════════

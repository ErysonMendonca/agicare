-- ════════════════════════════════════════════════════════════════
-- agicare — migration 0073: finalização + fechamento do atendimento
-- Fluxo: em_atendimento →(médico finaliza) aguardando_pagamento →(recepção
-- recebe e fecha) finalizado. O médico registra os procedimentos realizados no
-- atendimento (procedure_executions ligado à entrada da fila, com o valor
-- snapshot); a recepção vê o total e recebe o pagamento.
-- Depende de 0001 (queue_status, procedures), 0006 (payments), 0037/…
-- (procedure_executions). Idempotente. NÃO-transacional (ALTER TYPE ADD VALUE).
-- ════════════════════════════════════════════════════════════════

-- 1) Novo status da fila: aguardando pagamento (entre em_atendimento e finalizado).
alter type public.queue_status add value if not exists 'aguardando_pagamento';

-- 2) Procedimentos executados no atendimento: liga à ENTRADA da fila e guarda o
--    valor no momento (snapshot do preço do catálogo — estável a mudanças futuras).
alter table public.procedure_executions
  add column if not exists queue_entry_id uuid
    references public.queue_entries (id) on delete cascade,
  add column if not exists amount numeric(12,2) not null default 0;
create index if not exists idx_proc_exec_queue
  on public.procedure_executions (queue_entry_id);

-- 3) Formas de pagamento aceitas no fechamento: além de pix/cartao/boleto,
--    incluir dinheiro e convênio. Recria o CHECK de payments.method.
do $$ begin
  alter table public.payments drop constraint if exists payments_method_check;
exception when undefined_object then null; end $$;
alter table public.payments
  add constraint payments_method_check
  check (method in ('pix','cartao','boleto','dinheiro','convenio'));

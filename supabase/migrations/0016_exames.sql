-- ════════════════════════════════════════════════════════════════
-- agicare — migration 0016: Pedidos de Exames (prontuário 5.6)
-- Seleção por código TUSS, status e observações por item.
-- Dado clínico sensível (LGPD): RLS admin/medico (espelha 0007).
-- Depende de 0001 (patients/professionals/helpers).
-- ════════════════════════════════════════════════════════════════

create table if not exists public.exam_orders (
  id               uuid primary key default gen_random_uuid(),
  patient_id       uuid not null references public.patients (id) on delete cascade,
  professional_id  uuid references public.professionals (id) on delete set null,
  tuss_code        text,                          -- código oficial p/ faturamento
  exam_name        text not null,
  category         text not null default 'laboratorial', -- 'laboratorial' | 'imagem'
  status           text not null default 'solicitado',   -- 'solicitado' | 'concluido'
  notes            text,                          -- observações contextuais (ex.: jejum)
  created_at       timestamptz not null default now()
);
create index if not exists idx_exam_orders_patient on public.exam_orders (patient_id, created_at desc);

alter table public.exam_orders enable row level security;
drop policy if exists exam_orders_clinical_all on public.exam_orders;
create policy exam_orders_clinical_all on public.exam_orders
  for all using (public.current_role() in ('admin','medico'))
  with check (public.current_role() in ('admin','medico'));

-- ROLLBACK: drop table if exists public.exam_orders;

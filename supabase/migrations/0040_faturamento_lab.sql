-- ════════════════════════════════════════════════════════════════
-- agicare — migration 0040: Faturamento (Empresa/NF) + Laboratório (etapa)
-- Fecha gaps:
--   • Pagador "empresa" no check-out: nº/emissão/vencimento da NF + prazos;
--   • Kanban do laboratório: etapa persistida (transição entre fases).
-- Depende de 0002 (billable_events, lab_cases) e 0009/0024 (check-out).
-- Idempotente: create type if not exists, add column if not exists.
-- SEM clinic_id (segue o padrão das migrations 0024 deste módulo).
-- ════════════════════════════════════════════════════════════════

-- ── Pagador Empresa: dados da Nota Fiscal + prazos em billable_events ──
-- nf_number     = número da NF emitida à empresa conveniada
-- nf_issue_date = data de emissão da NF
-- nf_due_date   = vencimento (prazo) da fatura
-- nf_terms      = condições de prazo em texto livre (ex.: "30/60/90 dias")
alter table public.billable_events
  add column if not exists nf_number     text,
  add column if not exists nf_issue_date date,
  add column if not exists nf_due_date   date,
  add column if not exists nf_terms      text;

-- ── Etapa do Kanban do laboratório (transição persistida) ────────
-- Quando nula, a etapa é derivada do status (compatível com dados antigos).
do $$ begin
  create type public.lab_stage as enum ('entrada','processamento','refinamento','conclusao');
exception when duplicate_object then null; end $$;

alter table public.lab_cases
  add column if not exists stage public.lab_stage;

-- ════════════════════════════════════════════════════════════════
-- RLS: billable_events (0002) e lab_cases (0002) já têm policy de
-- staff. Nenhuma tabela nova → nada a (re)criar aqui.
-- ════════════════════════════════════════════════════════════════

-- ════════════════════════════════════════════════════════════════
-- ROLLBACK (manual):
--   alter table public.lab_cases drop column if exists stage;
--   drop type if exists public.lab_stage;
--   alter table public.billable_events
--     drop column if exists nf_terms, drop column if exists nf_due_date,
--     drop column if exists nf_issue_date, drop column if exists nf_number;
-- ════════════════════════════════════════════════════════════════

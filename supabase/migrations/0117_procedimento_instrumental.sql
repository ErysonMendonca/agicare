-- ════════════════════════════════════════════════════════════════
-- agicare — migration 0117: Instrumental no Procedimento
--
-- Objetivo:
--   (A) nova etapa "Instrumental" no cadastro de procedimento. Diferente de
--       "Materiais" (insumos consumíveis com BAIXA de estoque automática, ver
--       0028/0031), o instrumental é um CATÁLOGO REUTILIZÁVEL selecionável e
--       SEM baixa de estoque. Junção procedimento × instrumental em
--       public.procedure_instruments (espelha public.procedure_materials, mas
--       SEM quantidade e SEM trigger de baixa).
--   (B) reusar public.attendance_options (0050) como catálogo por clínica dos
--       instrumentais (category='instrumental'), lista PLANA (sem parent_id).
--       Semeia alguns instrumentais comuns para cada clínica existente.
--
-- Aditiva e idempotente (create table if not exists / drop policy if exists /
-- on conflict do nothing). O instrumental é OPCIONAL no procedimento.
-- DEPENDE de: 0001 (public.is_staff()), 0002 (procedures), 0050
--             (attendance_options), 0078 (índice parcial
--             uq_attendance_options_flat, que cobre category <> 'detalhe_alta').
-- RLS: staff gerencia tudo (mesmo padrão de procedure_materials — a isolação
-- multitenant é natural via FK procedure_id/option_id, ambas escopadas por
-- clínica por RLS nas tabelas-pai).
-- NÃO APLICADA automaticamente — aplicar manualmente no SQL Editor do Supabase.
-- ════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────
-- 1) Junção procedimento × instrumental (catálogo attendance_options).
--    Espelha procedure_materials (0028), porém SEM quantity/baixa de estoque.
-- ─────────────────────────────────────────────────────────────────
create table if not exists public.procedure_instruments (
  id            uuid primary key default gen_random_uuid(),
  procedure_id  uuid not null references public.procedures (id) on delete cascade,
  option_id     uuid not null references public.attendance_options (id) on delete cascade,
  created_at    timestamptz not null default now(),
  unique (procedure_id, option_id)
);
create index if not exists idx_proc_instr_procedure on public.procedure_instruments (procedure_id);
create index if not exists idx_proc_instr_option    on public.procedure_instruments (option_id);

comment on table public.procedure_instruments is
  'Instrumentais (catálogo attendance_options, category=instrumental) associados a um procedimento. Reutilizáveis, SEM baixa de estoque (diferente de procedure_materials).';

-- ════════════════════════════════════════════════════════════════
-- RLS — staff (admin/medico/recepcao) gerencia tudo (padrão 0028).
-- ════════════════════════════════════════════════════════════════
alter table public.procedure_instruments enable row level security;
drop policy if exists procedure_instruments_staff_all on public.procedure_instruments;
create policy procedure_instruments_staff_all on public.procedure_instruments
  for all using (public.is_staff()) with check (public.is_staff());

-- ════════════════════════════════════════════════════════════════
-- 2) SEED — instrumentais comuns PARA CADA clínica existente.
--    label = value; sort_order incremental; active default true.
--    on conflict alinhado ao índice parcial uq_attendance_options_flat (0078),
--    que cobre category <> 'detalhe_alta' — mesmo padrão da 0116.
-- ════════════════════════════════════════════════════════════════
insert into public.attendance_options (clinic_id, category, label, value, sort_order)
select c.id, 'instrumental', s.value, s.value, s.sort_order
from public.clinics c
cross join (values
  ('Kit cirúrgico básico', 0),
  ('Pinça anatômica',      1),
  ('Tesoura de Mayo',      2),
  ('Cabo de bisturi',      3),
  ('Afastador',            4)
) as s(value, sort_order)
on conflict (clinic_id, category, value) where category <> 'detalhe_alta' do nothing;

-- ════════════════════════════════════════════════════════════════
-- ROLLBACK (manual):
--   -- 2) seed
--   delete from public.attendance_options where category = 'instrumental';
--   -- 1) junção
--   drop table if exists public.procedure_instruments;
--
-- IMPACTO: aditivo. O vínculo é opcional no procedimento e o seed só cria
--   linhas novas (idempotente) — não afeta procedimentos/catálogos existentes.
-- ════════════════════════════════════════════════════════════════

-- ════════════════════════════════════════════════════════════════
-- agicare — migration 0116: Setor Fornecedor na Solicitação de Produtos
--
-- Objetivo:
--   (A) registrar em cada solicitação (public.product_requests) qual é o setor
--       FORNECEDOR responsável por atendê-la (ex.: Farmácia Satélite). Nova
--       coluna supplier_sector (texto desnormalizado — o valor exibido fica
--       estável mesmo que o catálogo mude depois).
--   (B) reusar public.attendance_options (0050) como catálogo por clínica dos
--       setores fornecedores (category='setor_fornecedor'), lista PLANA (sem
--       parent_id). Semeia 3 opções para cada clínica existente.
--
-- Aditiva e idempotente (add column if not exists / on conflict do nothing).
-- DEPENDE de: 0001 (clinics), 0069 (product_requests),
--             0050 (attendance_options), 0078 (índice parcial
--             uq_attendance_options_flat, que cobre category <> 'detalhe_alta').
-- NÃO APLICADA automaticamente — aplicar manualmente no SQL Editor do Supabase.
-- ════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────
-- 1) product_requests.supplier_sector — setor fornecedor da solicitação.
--    Nullable: solicitações antigas ficam sem valor (a UI exibe "—"). Texto
--    desnormalizado do catálogo setor_fornecedor.
-- ─────────────────────────────────────────────────────────────────
alter table public.product_requests
  add column if not exists supplier_sector text;

comment on column public.product_requests.supplier_sector is
  'Setor fornecedor responsável por atender a solicitação (valor catalogado desnormalizado). NULL em solicitações anteriores a esta coluna.';

-- ════════════════════════════════════════════════════════════════
-- 2) SEED — setores fornecedores PARA CADA clínica existente.
--    label = value; sort_order incremental; active default true.
--    on conflict alinhado ao índice parcial uq_attendance_options_flat (0078),
--    que cobre category <> 'detalhe_alta' — mesmo padrão da 0078.
-- ════════════════════════════════════════════════════════════════
insert into public.attendance_options (clinic_id, category, label, value, sort_order)
select c.id, 'setor_fornecedor', s.value, s.value, s.sort_order
from public.clinics c
cross join (values
  ('Farmácia Satélite',  0),
  ('Farmácia Principal', 1),
  ('Almoxarifado',       2)
) as s(value, sort_order)
on conflict (clinic_id, category, value) where category <> 'detalhe_alta' do nothing;

-- ════════════════════════════════════════════════════════════════
-- ROLLBACK (manual):
--   -- 2) seed
--   delete from public.attendance_options where category = 'setor_fornecedor';
--   -- 1) coluna
--   alter table public.product_requests drop column if exists supplier_sector;
--
-- IMPACTO: aditivo. supplier_sector é nullable → não afeta solicitações
--   existentes. O seed só cria linhas novas (idempotente).
-- ════════════════════════════════════════════════════════════════

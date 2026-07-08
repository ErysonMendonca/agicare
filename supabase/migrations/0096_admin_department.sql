-- ════════════════════════════════════════════════════════════════
-- agicare — migration 0096: departamento para equipe administrativa
--
-- Objetivo:
-- 1. Adicionar a coluna `department` na tabela `professionals`.
-- 2. Semear opções de "departamento" na `attendance_options` para uso
--    no formulário da Equipe Administrativa.
--
-- ════════════════════════════════════════════════════════════════

-- 1. Adicionar coluna (caso não exista)
ALTER TABLE public.professionals 
ADD COLUMN IF NOT EXISTS department text;

-- 2. Inserir opções de catálogo (seed genérica)
insert into public.attendance_options (clinic_id, category, label, value, sort_order)
select c.id, 'departamento', t.value, t.value, t.sort_order
from public.clinics c
cross join (values
  ('Recepção e Atendimento', 1),
  ('Faturamento e Guias', 2),
  ('Recursos Humanos', 3),
  ('Financeiro', 4),
  ('Tecnologia da Informação', 5),
  ('Manutenção e Logística', 6),
  ('Diretoria', 7)
) as t(value, sort_order)
on conflict (clinic_id, category, value) where category <> 'detalhe_alta' do nothing;

-- ════════════════════════════════════════════════════════════════
-- ROLLBACK (manual):
--   alter table public.professionals drop column department;
--   delete from public.attendance_options where category = 'departamento';
-- ════════════════════════════════════════════════════════════════

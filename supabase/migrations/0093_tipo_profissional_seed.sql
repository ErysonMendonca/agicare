-- ════════════════════════════════════════════════════════════════
-- agicare — migration 0093: seed de tipos de profissional
--
-- Objetivo: povoar a categoria 'tipo_profissional' na tabela attendance_options
-- para todas as clínicas existentes, garantindo que o catálogo inicial
-- tenha as opções básicas (Médico, Enfermeiro, Nutricionista, etc).
--
-- Aditiva e idempotente. 
-- DEPENDE de: 0050 (attendance_options), 0078 (índices parciais).
-- ════════════════════════════════════════════════════════════════

insert into public.attendance_options (clinic_id, category, label, value, sort_order)
select c.id, 'tipo_profissional', t.value, t.value, t.sort_order
from public.clinics c
cross join (values
  ('Médico',               1),
  ('Enfermeiro',           2),
  ('Técnico de Enfermagem',3),
  ('Fisioterapeuta',       4),
  ('Nutricionista',        5),
  ('Psicólogo',            6),
  ('Fonoaudiólogo',        7),
  ('Odontologista',        8),
  ('Biomédico',            9),
  ('Farmacêutico',         10),
  ('Assistente Social',    11),
  ('Técnico em Radiologia',12)
) as t(value, sort_order)
on conflict (clinic_id, category, value) where category <> 'detalhe_alta' do nothing;

-- ════════════════════════════════════════════════════════════════
-- ROLLBACK (manual):
--   delete from public.attendance_options where category = 'tipo_profissional';
-- ════════════════════════════════════════════════════════════════

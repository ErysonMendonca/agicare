-- ════════════════════════════════════════════════════════════════
-- agicare — migration 0081: seed de especialidades comuns
--
-- Objetivo: ampliar o catálogo de especialidades (attendance_options,
--   category='especialidade') além das 3 do seed inicial (0050), para haver
--   mais opções na criação de ESCALAS e nos testes. Cada clínica recebe o
--   conjunto. Continua editável em Configurações → Especialidades.
--
-- Aditiva e idempotente. value = label (padrão da tela de cadastro).
-- ATENÇÃO: a 0078 trocou a unique de attendance_options por índices PARCIAIS;
--   o ON CONFLICT precisa incluir o predicado `where category <> 'detalhe_alta'`
--   para casar o índice uq_attendance_options_flat.
-- DEPENDE de: 0050 (attendance_options), 0078 (índices parciais).
-- ════════════════════════════════════════════════════════════════

insert into public.attendance_options (clinic_id, category, label, value, sort_order)
select c.id, 'especialidade', e.value, e.value, e.sort_order
from public.clinics c
cross join (values
  ('Clínica Médica',              10),
  ('Pediatria',                   11),
  ('Ginecologia e Obstetrícia',   12),
  ('Dermatologia',                13),
  ('Psiquiatria',                 14),
  ('Neurologia',                  15),
  ('Endocrinologia',              16),
  ('Oftalmologia',                17),
  ('Otorrinolaringologia',        18),
  ('Urologia',                    19),
  ('Gastroenterologia',           20),
  ('Pneumologia',                 21),
  ('Reumatologia',                22),
  ('Nefrologia',                  23),
  ('Anestesiologia',              24),
  ('Cirurgia Geral',              25),
  ('Fisioterapia',                26),
  ('Nutrição',                    27),
  ('Odontologia',                 28),
  ('Psicologia',                  29)
) as e(value, sort_order)
on conflict (clinic_id, category, value) where category <> 'detalhe_alta' do nothing;

-- ════════════════════════════════════════════════════════════════
-- ROLLBACK (manual): remove apenas as especialidades semeadas por esta migration
--   (mantém as 3 do 0050 e as cadastradas manualmente).
--   delete from public.attendance_options where category='especialidade'
--     and value in ('Clínica Médica','Pediatria','Ginecologia e Obstetrícia',
--     'Dermatologia','Psiquiatria','Neurologia','Endocrinologia','Oftalmologia',
--     'Otorrinolaringologia','Urologia','Gastroenterologia','Pneumologia',
--     'Reumatologia','Nefrologia','Anestesiologia','Cirurgia Geral','Fisioterapia',
--     'Nutrição','Odontologia','Psicologia');
-- IMPACTO: aditivo; só cria opções novas. Não afeta escalas/agendamentos.
-- ════════════════════════════════════════════════════════════════

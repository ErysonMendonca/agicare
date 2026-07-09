-- ════════════════════════════════════════════════════════════════
-- agicare — migration 0097: seed das opções de atendimento (ex-demo)
--
-- Objetivo: semear em public.attendance_options as informações que
--   antes ficavam disponíveis no antigo "Modo Demo" do código-fonte,
--   como categorias de 'origem', 'encaminhamento', 'departamento', etc.
--   Isso garante que todas as clínicas (atuais e futuras) tenham 
--   opções preenchidas nessas categorias por padrão.
--
-- Aditiva e idempotente. value = label; sort_order incremental; active default true.
-- ATENÇÃO: a 0078 trocou a unique de attendance_options por índices PARCIAIS;
--   o ON CONFLICT precisa incluir o predicado `where category <> 'detalhe_alta'`
--   para casar o índice uq_attendance_options_flat.
-- ════════════════════════════════════════════════════════════════

insert into public.attendance_options (clinic_id, category, label, value, sort_order, active)
select c.id, s.category, s.value, s.value, s.sort_order, true
from public.clinics c
cross join (values
  -- origem
  ('origem', '1 - RECEPÇÃO', 0),
  ('origem', '2 - PRONTO ATENDIMENTO', 1),
  ('origem', '3 - INTERNAÇÃO', 2),
  
  -- medico
  ('medico', '1 - MÉDICO PADRÃO', 0),
  ('medico', '2 - DRA. MARINA SOUZA', 1),
  ('medico', '3 - DR. CARLOS EDUARDO', 2),

  -- encaminhamento
  ('encaminhamento', '1 - PRIMEIRA CONSULTA', 0),
  ('encaminhamento', '2 - RETORNO', 1),
  ('encaminhamento', '3 - URGÊNCIA', 2),

  -- carater
  ('carater', '1 - URGÊNCIA/EMERGÊNCIA', 0),
  ('carater', '2 - ELETIVO', 1),

  -- procedencia
  ('procedencia', '9 - AMBULATÓRIO-CONS', 0),
  ('procedencia', '1 - DOMICÍLIO', 1),
  ('procedencia', '2 - OUTRA UNIDADE', 2),

  -- centro_custo
  ('centro_custo', '187 - RECEPÇÃO PRINCIPAL', 0),
  ('centro_custo', '190 - PRONTO ATENDIMENTO', 1),

  -- convenio
  ('convenio', 'SUS', 0),
  ('convenio', 'Unimed', 1),
  ('convenio', 'Particular', 2),
  ('convenio', 'Bradesco Saúde', 3),
  ('convenio', 'Amil', 4),

  -- plano
  ('plano', 'Ambulatorial', 0),
  ('plano', 'Hospitalar', 1),
  ('plano', 'Completo', 2),

  -- parentesco
  ('parentesco', 'Pai', 0),
  ('parentesco', 'Mãe', 1),
  ('parentesco', 'Cônjuge', 2),
  ('parentesco', 'Filho(a)', 3),
  ('parentesco', 'Outro', 4),

  -- departamento
  ('departamento', 'Recepção', 0),
  ('departamento', 'Administração', 1)

) as s(category, value, sort_order)
on conflict (clinic_id, category, value) where category <> 'detalhe_alta' do nothing;

-- ════════════════════════════════════════════════════════════════
-- ROLLBACK (manual): remove apenas as opções padronizadas inseridas.
--   delete from public.attendance_options
--     where category in ('origem', 'medico', 'encaminhamento', 'carater', 'procedencia', 'centro_custo', 'convenio', 'plano', 'parentesco', 'departamento')
--     and value in ('1 - RECEPÇÃO', '2 - PRONTO ATENDIMENTO', '3 - INTERNAÇÃO', '1 - MÉDICO PADRÃO', '2 - DRA. MARINA SOUZA', '3 - DR. CARLOS EDUARDO', '1 - PRIMEIRA CONSULTA', '2 - RETORNO', '3 - URGÊNCIA', '1 - URGÊNCIA/EMERGÊNCIA', '2 - ELETIVO', '9 - AMBULATÓRIO-CONS', '1 - DOMICÍLIO', '2 - OUTRA UNIDADE', '187 - RECEPÇÃO PRINCIPAL', '190 - PRONTO ATENDIMENTO', 'SUS', 'Unimed', 'Particular', 'Bradesco Saúde', 'Amil', 'Ambulatorial', 'Hospitalar', 'Completo', 'Pai', 'Mãe', 'Cônjuge', 'Filho(a)', 'Outro', 'Recepção', 'Administração');
-- ════════════════════════════════════════════════════════════════

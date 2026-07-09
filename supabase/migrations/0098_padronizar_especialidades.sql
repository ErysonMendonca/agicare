-- ════════════════════════════════════════════════════════════════
-- agicare — migration 0098: padronizar especialidades
--
-- Objetivo: Remover os prefixos numéricos ("3 - ORTOPEDIA") do seed 
-- antigo, padronizando para Title Case ("Ortopedia"). Isso resolve 
-- o bug onde escalas criadas com "Ortopedia" não eram encontradas 
-- pois o dropdown exibia "3 - ORTOPEDIA".
-- ════════════════════════════════════════════════════════════════

-- 1. Inserir Ortopedia e Cardiologia limpas (Clínica Médica já foi na 0081)
insert into public.attendance_options (clinic_id, category, label, value, sort_order)
select c.id, 'especialidade', 'Ortopedia', 'Ortopedia', 2
from public.clinics c
on conflict (clinic_id, category, value) where category <> 'detalhe_alta' do nothing;

insert into public.attendance_options (clinic_id, category, label, value, sort_order)
select c.id, 'especialidade', 'Cardiologia', 'Cardiologia', 1
from public.clinics c
on conflict (clinic_id, category, value) where category <> 'detalhe_alta' do nothing;

-- 2. Atualizar todas as tabelas filhas para usar os nomes padronizados
update public.schedules set specialty = 'Ortopedia' where specialty = '3 - ORTOPEDIA';
update public.schedules set specialty = 'Cardiologia' where specialty = '2 - CARDIOLOGIA';
update public.schedules set specialty = 'Clínica Médica' where specialty = '1 - MÉDICO CLÍNICO';

update public.professionals set specialty = 'Ortopedia' where specialty = '3 - ORTOPEDIA';
update public.professionals set specialty = 'Cardiologia' where specialty = '2 - CARDIOLOGIA';
update public.professionals set specialty = 'Clínica Médica' where specialty = '1 - MÉDICO CLÍNICO';

update public.appointments set specialty = 'Ortopedia' where specialty = '3 - ORTOPEDIA';
update public.appointments set specialty = 'Cardiologia' where specialty = '2 - CARDIOLOGIA';
update public.appointments set specialty = 'Clínica Médica' where specialty = '1 - MÉDICO CLÍNICO';

-- 3. Deletar os antigos com números do dropdown
delete from public.attendance_options 
where category = 'especialidade' 
and value in ('1 - MÉDICO CLÍNICO', '2 - CARDIOLOGIA', '3 - ORTOPEDIA');

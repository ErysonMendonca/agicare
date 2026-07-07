-- agicare — migration 0088: adicionar service_type no appointments
alter table public.appointments
  add column if not exists service_type text;

comment on column public.appointments.service_type is
  'Tipo do atendimento: Consulta, Retorno, Exame, Procedimento. Usado para organizar exames/procedimentos por setor.';

-- agicare — migration 0089: adicionar professional_type no professionals
alter table public.professionals
  add column if not exists professional_type text;

comment on column public.professionals.professional_type is
  'Tipo do profissional: Médico, Enfermeiro, Técnico de Enfermagem, Fisioterapeuta, Dentista, etc.';

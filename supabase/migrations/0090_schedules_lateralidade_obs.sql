-- agicare — migration 0090: adicionar lateralidade e obs no schedules
alter table public.schedules
  add column if not exists lateralidade text,
  add column if not exists obs text;

comment on column public.schedules.lateralidade is
  'Lateralidade do exame da escala: Direita, Esquerda, Bilateral, Não se aplica.';
comment on column public.schedules.obs is
  'Observações adicionais para a escala de exames.';

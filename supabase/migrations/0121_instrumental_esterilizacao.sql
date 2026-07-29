-- ════════════════════════════════════════════════════════════════
-- Controle de esterilização do Instrumental (attendance_options,
-- category='instrumental'). Campos preenchidos no cadastro pelo admin
-- (Configurações → Instrumental) e exibidos na tela de Procedimento do
-- prontuário junto com o material vinculado ao procedimento selecionado.
--
-- Aplicar manualmente no SQL Editor do Supabase (mesmo padrão da 0116-0120).
-- ════════════════════════════════════════════════════════════════

alter table public.attendance_options
  add column if not exists sterilization_method text,
  add column if not exists validity_date date,
  add column if not exists lot_code text;

comment on column public.attendance_options.sterilization_method is
  'Método de esterilização (ex.: Autoclave, Óxido de Etileno) — usado apenas quando category=''instrumental''.';
comment on column public.attendance_options.validity_date is
  'Validade da esterilização atual do item — usado apenas quando category=''instrumental''.';
comment on column public.attendance_options.lot_code is
  'Ciclo/lote da esterilização atual do item — usado apenas quando category=''instrumental''.';

-- ════════════════════════════════════════════════════════════════
-- agicare — migration 0050: attendance_options (dropdowns geríveis)
--
-- Os selects do modal "Dados de Atendimento" (src/app/(app)/fila/
-- DadosAtendimentoModal.tsx, linhas 14-23) hoje são HARDCODED no front.
-- Esta tabela passa a guardá-los por clínica, para que cada tenant gerencie
-- suas próprias listas (origem, médico, especialidade, encaminhamento,
-- caráter, procedência, centro de custo, convênio, plano, parentesco).
--
-- Modelo genérico (category, label, value): uma linha por opção. O front
-- consulta por (clinic_id, category, active) ordenando por sort_order.
--
-- RLS (decisão): seguimos o PADRÃO MULTITENANT da 0021 → leitura+escrita
-- liberadas para STAFF da clínica ativa (is_staff() AND clinic_id =
-- current_clinic_id()). Não é dado clínico/LGPD (medical_records), é
-- configuração operacional; o gate "só gestor/admin edita" é aplicado na
-- Server Action (isGestor), coerente com as demais tabelas *_staff_all.
-- Uma policy SELECT-staff + ALL-admin seria mais restritiva, mas quebraria
-- a consistência com a 0021 e exigiria duplicar a checagem de papel — opção
-- consciente por manter um único padrão. Se a regra endurecer, trocar a
-- policy de escrita para current_role() in ('admin','gestor').
--
-- Aditiva e idempotente. DEPENDE de: 0001 (clinics), 0020/0021 (clinic_id +
-- multitenant), helpers is_staff()/current_clinic_id() (0001/0020).
-- NÃO APLICADA automaticamente — aplicar via scripts/migrate.mjs.
-- ════════════════════════════════════════════════════════════════

create table if not exists public.attendance_options (
  id          uuid primary key default gen_random_uuid(),
  clinic_id   uuid not null references public.clinics(id) on delete cascade,
  category    text not null,
  label       text not null,
  value       text not null,
  sort_order  int  not null default 0,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (clinic_id, category, value)
);

comment on table public.attendance_options is
  'Opções geríveis por clínica para os dropdowns do modal Dados de Atendimento (substitui listas hardcoded). category: origem|medico|especialidade|encaminhamento|carater|procedencia|centro_custo|convenio|plano|parentesco.';

create index if not exists idx_attendance_options_clinic_cat_active
  on public.attendance_options (clinic_id, category, active);

-- ── RLS (padrão 0021 *_staff_all) ────────────────────────────────
alter table public.attendance_options enable row level security;

drop policy if exists attendance_options_staff_all on public.attendance_options;
create policy attendance_options_staff_all on public.attendance_options
  for all
  using      (public.is_staff() and clinic_id = public.current_clinic_id())
  with check (public.is_staff() and clinic_id = public.current_clinic_id());

-- ════════════════════════════════════════════════════════════════
-- SEED — popula, PARA CADA clínica existente, os valores hardcoded atuais.
--   label = value (mesmo texto); sort_order incremental por categoria.
--   on conflict (clinic_id, category, value) do nothing → idempotente.
-- ════════════════════════════════════════════════════════════════
insert into public.attendance_options (clinic_id, category, label, value, sort_order)
select c.id, s.category, s.value, s.value, s.sort_order
from public.clinics c
cross join (values
  ('origem',        '1 - RECEPÇÃO',           0),
  ('origem',        '2 - PRONTO ATENDIMENTO', 1),
  ('origem',        '3 - INTERNAÇÃO',         2),
  ('medico',        '1 - MÉDICO PADRÃO',      0),
  ('medico',        '2 - DRA. MARINA SOUZA',  1),
  ('medico',        '3 - DR. CARLOS EDUARDO', 2),
  ('especialidade', '1 - MÉDICO CLÍNICO',     0),
  ('especialidade', '2 - CARDIOLOGIA',        1),
  ('especialidade', '3 - ORTOPEDIA',          2),
  ('encaminhamento','1 - PRIMEIRA CONSULTA',  0),
  ('encaminhamento','2 - RETORNO',            1),
  ('encaminhamento','3 - URGÊNCIA',           2),
  ('carater',       '1 - URGÊNCIA/EMERGÊNCIA',0),
  ('carater',       '2 - ELETIVO',            1),
  ('procedencia',   '9 - AMBULATÓRIO-CONS',   0),
  ('procedencia',   '1 - DOMICÍLIO',          1),
  ('procedencia',   '2 - OUTRA UNIDADE',      2),
  ('centro_custo',  '187 - RECEPÇÃO PRINCIPAL',0),
  ('centro_custo',  '190 - PRONTO ATENDIMENTO',1),
  ('convenio',      'SUS',                    0),
  ('convenio',      'Unimed',                 1),
  ('convenio',      'Particular',             2),
  ('convenio',      'Bradesco Saúde',         3),
  ('convenio',      'Amil',                   4),
  ('plano',         'Ambulatorial',           0),
  ('plano',         'Hospitalar',             1),
  ('plano',         'Completo',               2),
  ('parentesco',    'Pai',                    0),
  ('parentesco',    'Mãe',                    1),
  ('parentesco',    'Cônjuge',                2),
  ('parentesco',    'Filho(a)',               3),
  ('parentesco',    'Outro',                  4)
) as s(category, value, sort_order)
on conflict (clinic_id, category, value) do nothing;

-- ════════════════════════════════════════════════════════════════
-- ROLLBACK (manual):
--   drop table if exists public.attendance_options;  -- (policy/index caem junto)
--
-- IMPACTO: aditivo. Dropar a tabela só afeta a feature de dropdowns geríveis;
-- enquanto o front não consumir esta tabela, os selects seguem hardcoded e
-- nada quebra. O seed é idempotente (on conflict do nothing) — reexecutar a
-- migration não duplica linhas.
-- HANDOFF: backend-dev — expor leitura por (clinic_id, category, active) e a
--   action de escrita gateada por isGestor; frontend-dev — trocar as constantes
--   das linhas 14-23 do DadosAtendimentoModal.tsx por dados desta tabela.
-- ════════════════════════════════════════════════════════════════

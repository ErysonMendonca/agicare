-- ════════════════════════════════════════════════════════════════
-- agicare — migration 0078: catálogos de ALTA (motivo → detalhe em cascata)
--   + campos de alta no documento (public.certificates).
--
-- Objetivo:
--   (A) reusar public.attendance_options (0050) como catálogo por clínica dos
--       "motivos de alta" (category='motivo_alta') e "detalhes de alta"
--       (category='detalhe_alta'). O DETALHE filtra pelo MOTIVO (cascata) →
--       precisamos de um vínculo pai→filho: nova coluna parent_id (self-FK).
--   (B) enriquecer public.certificates com data/hora da alta (discharge_at) e o
--       detalhe catalogado DESNORMALIZADO como texto (discharge_detail), para o
--       documento de alta manter o valor mesmo que o catálogo mude depois.
--
-- Aditiva e idempotente (add column if not exists / on conflict do nothing).
-- DEPENDE de: 0001 (clinics, helpers), 0007 (certificates),
--             0050 (attendance_options + unique(clinic_id,category,value)).
-- NÃO APLICADA automaticamente — aplicar via scripts/migrate.mjs (porta 6543).
-- ════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────
-- 1) attendance_options.parent_id — vínculo pai→filho (self-FK).
--    Nullable: só linhas de category='detalhe_alta' o usam, apontando para a
--    linha 'motivo_alta' pai DA MESMA CLÍNICA. ON DELETE CASCADE: apagar um
--    motivo remove seus detalhes filhos automaticamente.
-- ─────────────────────────────────────────────────────────────────
alter table public.attendance_options
  add column if not exists parent_id uuid
    references public.attendance_options(id) on delete cascade;

comment on column public.attendance_options.parent_id is
  'Auto-referência para catálogos em cascata: um detalhe_alta aponta para o motivo_alta pai (mesma clínica). NULL para categorias planas.';

create index if not exists idx_attendance_options_parent
  on public.attendance_options (parent_id);

-- ─────────────────────────────────────────────────────────────────
-- 1b) Unicidade adequada à cascata. A constraint da 0050,
--     unique(clinic_id, category, value), impediria o MESMO rótulo de detalhe
--     (ex.: "Outros", "Retorno se piora") em dois motivos diferentes — o que
--     contradiz a cascata por motivo. Substituímos por dois índices únicos
--     PARCIAIS: categorias planas seguem únicas por (clinic_id, category, value);
--     detalhe_alta passa a ser único por (clinic_id, parent_id, value), ou seja,
--     por motivo pai. O 23505 continua sendo lançado (tratado nas actions).
--     drop if exists pelo nome default do Postgres; se o nome divergir, é no-op
--     e a unicidade antiga (mais restritiva) permanece — degradação segura.
-- ─────────────────────────────────────────────────────────────────
alter table public.attendance_options
  drop constraint if exists attendance_options_clinic_id_category_value_key;

create unique index if not exists uq_attendance_options_flat
  on public.attendance_options (clinic_id, category, value)
  where category <> 'detalhe_alta';

create unique index if not exists uq_attendance_options_detalhe
  on public.attendance_options (clinic_id, parent_id, value)
  where category = 'detalhe_alta';

-- ─────────────────────────────────────────────────────────────────
-- 2) Novos campos de alta em public.certificates.
--    discharge_detail é desnormalizado (texto) de propósito: preserva o valor
--    exibido no documento mesmo se o catálogo for editado/removido depois.
-- ─────────────────────────────────────────────────────────────────
alter table public.certificates add column if not exists discharge_at     timestamptz;
alter table public.certificates add column if not exists discharge_detail text;

comment on column public.certificates.discharge_at     is 'Data e hora da alta.';
comment on column public.certificates.discharge_detail is 'Detalhe da alta (valor catalogado desnormalizado para o documento).';

-- ════════════════════════════════════════════════════════════════
-- 3) SEED — motivos e detalhes de alta PARA CADA clínica existente.
--
--    Estratégia da cascata (o ponto crítico):
--      (a) primeiro insere TODOS os 'motivo_alta' (parent_id NULL) para cada
--          clínica, com ON CONFLICT (clinic_id, category, value) DO NOTHING;
--      (b) depois insere os 'detalhe_alta', e o parent_id de cada detalhe é
--          resolvido por SUBQUERY que casa o motivo pai PELA MESMA CLÍNICA
--          (clinic_id = c.id AND category='motivo_alta' AND value=<motivo>).
--      Assim o vínculo nunca cruza clínicas: cada detalhe referencia o id do
--      seu motivo no tenant correto. Idempotente em ambas as etapas.
--    label = value; sort_order incremental. active default true.
-- ════════════════════════════════════════════════════════════════

-- (a) motivos de alta
insert into public.attendance_options (clinic_id, category, label, value, sort_order)
select c.id, 'motivo_alta', m.value, m.value, m.sort_order
from public.clinics c
cross join (values
  ('Alta melhorada',          0),
  ('Alta curada',             1),
  ('Alta a pedido',           2),
  ('Alta administrativa',     3),
  ('Alta por transferência',  4),
  ('Alta por evasão',         5)
) as m(value, sort_order)
on conflict (clinic_id, category, value) do nothing;

-- (b) detalhes de alta — parent_id resolvido por clínica+motivo (subquery)
insert into public.attendance_options (clinic_id, category, label, value, sort_order, parent_id)
select
  c.id, 'detalhe_alta', d.value, d.value, d.sort_order,
  (select p.id from public.attendance_options p
    where p.clinic_id = c.id
      and p.category  = 'motivo_alta'
      and p.value     = d.motivo)
from public.clinics c
cross join (values
  ('Alta melhorada',         'Sintomas controlados',            0),
  ('Alta melhorada',         'Retorno se piora',                1),
  ('Alta melhorada',         'Manter medicação em casa',        2),
  ('Alta curada',            'Resolução completa do quadro',    0),
  ('Alta curada',            'Sem necessidade de retorno',      1),
  ('Alta a pedido',          'Paciente solicitou liberação',    0),
  ('Alta a pedido',          'Termo de responsabilidade assinado', 1),
  ('Alta administrativa',    'Encerramento por rotina',         0),
  ('Alta administrativa',    'Não comparecimento a reavaliação',1),
  ('Alta por transferência', 'Para hospital',                   0),
  ('Alta por transferência', 'Para especialista',               1),
  ('Alta por transferência', 'Para outra unidade',              2),
  ('Alta por evasão',        'Abandono sem comunicação',        0),
  ('Alta por evasão',        'Saída sem autorização médica',    1)
) as d(motivo, value, sort_order)
on conflict (clinic_id, category, value) do nothing;

-- ════════════════════════════════════════════════════════════════
-- ROLLBACK (manual):
--   -- 3) seed (remove detalhes antes dos motivos; cascade também limparia)
--   delete from public.attendance_options where category in ('detalhe_alta','motivo_alta');
--   -- 2) campos do documento
--   alter table public.certificates drop column if exists discharge_detail;
--   alter table public.certificates drop column if exists discharge_at;
--   -- 1) coluna de vínculo (index cai junto)
--   drop index if exists public.idx_attendance_options_parent;
--   alter table public.attendance_options drop column if exists parent_id;
--
-- IMPACTO: aditivo. parent_id é nullable → não afeta as demais categorias já
--   existentes na 0050. O seed só cria linhas novas (idempotente). Dropar as
--   colunas de certificates perde apenas os dados de alta dessas colunas.
-- HANDOFF: backend-dev — ler motivos por (clinic_id,'motivo_alta',active) e os
--   detalhes filtrando parent_id = <motivo escolhido>; gravar discharge_at e
--   discharge_detail no documento de alta.
-- ════════════════════════════════════════════════════════════════

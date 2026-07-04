-- ════════════════════════════════════════════════════════════════
-- agicare — migration 0083: seed dos catálogos de produto restantes
--
-- Objetivo: semear em public.attendance_options, por clínica (cross join
--   public.clinics), as categorias de catálogo de produto que ainda faltam:
--     • 'localizacao'      — locais físicos de armazenamento do produto.
--     • 'classificacao_xyz'— classe de criticidade XYZ.
--   As categorias unidade_medida/via_administracao/principio_ativo/marca
--   (tipo_produto/grupo_produto etc.) já foram semeadas na 0080 — NÃO repetir.
--
-- Aditiva e idempotente. value = label; sort_order incremental; active default true.
-- ATENÇÃO: a 0078 trocou a unique de attendance_options por índices PARCIAIS;
--   o ON CONFLICT precisa incluir o predicado `where category <> 'detalhe_alta'`
--   para casar o índice uq_attendance_options_flat.
-- DEPENDE de: 0050 (attendance_options), 0078 (índices parciais), 0080 (catálogos de produto).
-- NÃO APLICADA automaticamente — aplicar via scripts/migrate.mjs (porta 6543).
-- ════════════════════════════════════════════════════════════════

insert into public.attendance_options (clinic_id, category, label, value, sort_order, active)
select c.id, s.category, s.value, s.value, s.sort_order, true
from public.clinics c
cross join (values
  -- localizacao — locais físicos de armazenamento
  ('localizacao',       'Farmácia Central',   0),
  ('localizacao',       'Almoxarifado',       1),
  ('localizacao',       'Geladeira 1',        2),
  ('localizacao',       'Sala de Medicação',  3),
  ('localizacao',       'Estoque Cirúrgico',  4),
  -- classificacao_xyz — criticidade
  ('classificacao_xyz', 'X',                  0),
  ('classificacao_xyz', 'Y',                  1),
  ('classificacao_xyz', 'Z',                  2),
  -- marca — fabricantes comuns (idempotente: se a 0080 já semeou, ON CONFLICT ignora)
  ('marca',             'Genérico',           0),
  ('marca',             'EMS',                1),
  ('marca',             'Eurofarma',          2),
  ('marca',             'Cristália',          3),
  ('marca',             'Medley',             4)
) as s(category, value, sort_order)
on conflict (clinic_id, category, value) where category <> 'detalhe_alta' do nothing;

-- ════════════════════════════════════════════════════════════════
-- ROLLBACK (manual): remove apenas os catálogos semeados por esta migration.
--   delete from public.attendance_options
--     where category in ('localizacao','classificacao_xyz');
-- IMPACTO: 100% aditivo; só cria opções novas por clínica (idempotente).
--   Não afeta produtos, estoque ou tabelas-filhas existentes.
-- HANDOFF: backend-dev/frontend-dev — abas de Localização e Classificação XYZ
--   do cadastro de produto leem estes catálogos por (clinic_id, category, active).
-- ════════════════════════════════════════════════════════════════

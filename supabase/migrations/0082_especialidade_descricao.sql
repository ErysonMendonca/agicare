-- ════════════════════════════════════════════════════════════════
-- agicare — migration 0082: descrição das especialidades
--
-- Objetivo: adicionar a coluna genérica `description` em attendance_options
--   e preencher as descrições das especialidades já semeadas (0050/0081),
--   exibidas na tela Configurações → Especialidades.
--
-- A coluna é genérica (serve a qualquer category), mas por ora só as
--   especialidades recebem texto. UPDATE casa por (category,value) e SÓ
--   escreve onde description IS NULL — assim reexecutar não sobrescreve
--   edições feitas pelo usuário. Vale para TODAS as clínicas (não filtra
--   clinic_id; casa pelo value semeado igual em todo tenant).
--
-- Aditiva e idempotente. DEPENDE de: 0050 (attendance_options), 0081 (seed
--   das especialidades). NÃO APLICADA automaticamente — via scripts/migrate.mjs.
-- ════════════════════════════════════════════════════════════════

alter table public.attendance_options
  add column if not exists description text;

comment on column public.attendance_options.description is
  'Descrição opcional da opção (usada, por ex., na tela de Especialidades). Genérica: aplicável a qualquer category.';

-- ── Preenche descrições das especialidades conhecidas (só onde NULL) ──
update public.attendance_options ao
set    description = d.description
from (values
  ('Clínica Médica',            'Especialidade focada na prevenção, diagnóstico e tratamento de doenças.'),
  ('Pediatria',                 'Assistência médica para crianças e adolescentes.'),
  ('Ginecologia e Obstetrícia', 'Saúde da mulher, abrangendo ginecologia e acompanhamento da gestação.'),
  ('Dermatologia',              'Diagnóstico e tratamento de doenças da pele, cabelos e unhas.'),
  ('Psiquiatria',               'Avaliação, diagnóstico e tratamento de transtornos mentais.'),
  ('Neurologia',                'Doenças do sistema nervoso central e periférico.'),
  ('Endocrinologia',            'Distúrbios hormonais e metabólicos.'),
  ('Oftalmologia',              'Cuidados com a saúde dos olhos e da visão.'),
  ('Otorrinolaringologia',      'Doenças do ouvido, nariz, garganta e estruturas relacionadas.'),
  ('Cardiologia',               'Diagnóstico e tratamento de doenças do coração e do sistema circulatório.'),
  ('Ortopedia',                 'Cuidados com ossos, articulações, músculos e ligamentos.'),
  ('Urologia',                  'Sistema urinário e saúde do sistema reprodutor masculino.'),
  ('Gastroenterologia',         'Doenças do aparelho digestivo.'),
  ('Pneumologia',               'Doenças do sistema respiratório e dos pulmões.'),
  ('Reumatologia',              'Doenças das articulações, músculos e tecido conjuntivo.'),
  ('Nefrologia',                'Doenças dos rins e distúrbios relacionados.'),
  ('Anestesiologia',            'Anestesia e cuidados peri-operatórios do paciente.'),
  ('Cirurgia Geral',            'Procedimentos cirúrgicos de diversas áreas.'),
  ('Fisioterapia',              'Reabilitação física e recuperação funcional do paciente.'),
  ('Nutrição',                  'Orientação alimentar e acompanhamento nutricional.'),
  ('Odontologia',               'Saúde bucal, dentes e estruturas relacionadas.'),
  ('Psicologia',                'Acompanhamento e cuidado da saúde mental e emocional.')
) as d(value, description)
where ao.category = 'especialidade'
  and ao.value    = d.value
  and ao.description is null;

-- ════════════════════════════════════════════════════════════════
-- ROLLBACK (manual):
--   alter table public.attendance_options drop column if exists description;
--   -- (remove a coluna e, com ela, todas as descrições preenchidas)
--
-- IMPACTO: aditivo. Coluna nova e opcional (nullable) em attendance_options —
--   nada existente quebra. As descrições só afetam a exibição na tela de
--   Especialidades (Configurações). UPDATE é idempotente: só grava onde
--   description IS NULL, preservando qualquer texto editado manualmente.
-- HANDOFF: frontend/backend-dev — passar a ler/expor a coluna `description`
--   na tela de Especialidades.
-- ════════════════════════════════════════════════════════════════

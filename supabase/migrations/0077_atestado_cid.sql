-- ════════════════════════════════════════════════════════════════
-- agicare — migration 0077: atestado (novos campos) + catálogo CID-10 global
--
-- Objetivo:
--   (A) enriquecer public.certificates (0007) para emissão de atestado:
--       data de emissão, observação e flag de exibir/ocultar o CID no PDF.
--   (B) criar o catálogo GLOBAL de códigos CID-10 (public.cid_codes) — é um
--       catálogo UNIVERSAL (não pertence a nenhuma clínica), portanto SEM
--       clinic_id. Serve de fonte para o autocomplete do CID no atestado.
--
-- Aditiva e idempotente (add column if not exists / create table if not exists /
--   drop policy if exists / on conflict no seed).
-- DEPENDE de: 0001 (helpers current_role()/is_staff(), enum user_role),
--             0007 (public.certificates).
-- NÃO APLICADA automaticamente — aplicar via scripts/migrate.mjs (porta 6543).
-- ════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────
-- 1) Novos campos em public.certificates (atestado).
--    show_cid controla a exibição do CID no documento impresso — por LGPD o
--    diagnóstico só deve constar no atestado com anuência do paciente; default
--    true mantém o comportamento atual (CID visível) sem quebrar dados.
-- ─────────────────────────────────────────────────────────────────
alter table public.certificates add column if not exists issue_date  date;
alter table public.certificates add column if not exists observation text;
alter table public.certificates add column if not exists show_cid    boolean not null default true;

comment on column public.certificates.issue_date  is 'Data de emissão do atestado.';
comment on column public.certificates.observation is 'Observação livre exibida no atestado.';
comment on column public.certificates.show_cid    is 'Se true, o CID-10 aparece no atestado impresso (LGPD: ocultável a pedido do paciente).';

-- ─────────────────────────────────────────────────────────────────
-- 2) public.cid_codes — catálogo GLOBAL do CID-10 (sem clinic_id).
--    code UNIQUE permite o seed idempotente via ON CONFLICT (code).
-- ─────────────────────────────────────────────────────────────────
create table if not exists public.cid_codes (
  id           uuid primary key default gen_random_uuid(),
  code         text not null unique,
  description  text not null,
  active       boolean not null default true,
  created_at   timestamptz not null default now()
);

comment on table public.cid_codes is
  'Catálogo GLOBAL (cross-tenant) de códigos CID-10. Não possui clinic_id: é referência universal usada no autocomplete do atestado.';

-- Busca por prefixo de código e por texto da descrição (autocomplete).
create index if not exists idx_cid_codes_code   on public.cid_codes (code);
create index if not exists idx_cid_codes_active on public.cid_codes (active) where active;

-- ════════════════════════════════════════════════════════════════
-- RLS cid_codes: catálogo de referência.
--   - SELECT: qualquer STAFF autenticado (is_staff()) — necessário para o
--     autocomplete do CID em atestado/prontuário.
--   - INSERT/UPDATE/DELETE: SOMENTE admin (curadoria do catálogo). O projeto
--     NÃO tem papel 'gestor' (enum user_role = admin|medico|recepcao|paciente),
--     então a manutenção fica restrita ao admin.
-- ════════════════════════════════════════════════════════════════
alter table public.cid_codes enable row level security;

drop policy if exists cid_codes_select_staff on public.cid_codes;
drop policy if exists cid_codes_write_admin  on public.cid_codes;

create policy cid_codes_select_staff on public.cid_codes
  for select using (public.is_staff());

create policy cid_codes_write_admin on public.cid_codes
  for all
  using      (public.current_role() = 'admin')
  with check (public.current_role() = 'admin');

-- ════════════════════════════════════════════════════════════════
-- 3) Seed de CIDs comuns (idempotente por code).
-- ════════════════════════════════════════════════════════════════
insert into public.cid_codes (code, description) values
  ('A09',   'Diarreia e gastroenterite de origem infecciosa presumível'),
  ('A90',   'Dengue clássica'),
  ('B34.9', 'Infecção viral não especificada'),
  ('E11',   'Diabetes mellitus tipo 2'),
  ('E78.5', 'Hiperlipidemia não especificada'),
  ('F32.9', 'Episódio depressivo não especificado'),
  ('F41.1', 'Ansiedade generalizada'),
  ('G43',   'Enxaqueca'),
  ('H10',   'Conjuntivite'),
  ('H66.9', 'Otite média não especificada'),
  ('I10',   'Hipertensão essencial (primária)'),
  ('J00',   'Nasofaringite aguda (resfriado comum)'),
  ('J01',   'Sinusite aguda'),
  ('J02.9', 'Faringite aguda não especificada'),
  ('J03.9', 'Amigdalite aguda não especificada'),
  ('J06.9', 'Infecção aguda das vias aéreas superiores não especificada'),
  ('J11',   'Influenza (gripe) devida a vírus não identificado'),
  ('J20',   'Bronquite aguda'),
  ('J45',   'Asma'),
  ('K21',   'Doença de refluxo gastroesofágico'),
  ('K29',   'Gastrite e duodenite'),
  ('K30',   'Dispepsia funcional'),
  ('K52.9', 'Gastroenterite e colite não infecciosa não especificada'),
  ('K59.0', 'Constipação'),
  ('L20',   'Dermatite atópica'),
  ('L23',   'Dermatite alérgica de contato'),
  ('L30.9', 'Dermatite não especificada'),
  ('M25.5', 'Dor articular'),
  ('M54.2', 'Cervicalgia'),
  ('M54.4', 'Lumbago com ciática'),
  ('M54.5', 'Dor lombar baixa'),
  ('M79.1', 'Mialgia'),
  ('N30',   'Cistite'),
  ('N39.0', 'Infecção do trato urinário de localização não especificada'),
  ('R05',   'Tosse'),
  ('R07.4', 'Dor torácica não especificada'),
  ('R10.4', 'Dor abdominal não especificada'),
  ('R11',   'Náusea e vômito'),
  ('R42',   'Tontura e instabilidade'),
  ('R50.9', 'Febre não especificada'),
  ('R51',   'Cefaleia'),
  ('R53',   'Mal-estar e fadiga'),
  ('R55',   'Síncope e colapso'),
  ('R60',   'Edema não classificado em outra parte'),
  ('S93.4', 'Entorse e distensão do tornozelo'),
  ('T14.0', 'Traumatismo superficial de região não especificada do corpo'),
  ('U07.1', 'COVID-19, vírus identificado'),
  ('Z00.0', 'Exame médico geral'),
  ('Z23',   'Necessidade de imunização contra doença bacteriana isolada'),
  ('Z76.3', 'Pessoa em bom estado acompanhando pessoa doente')
on conflict (code) do nothing;

-- ════════════════════════════════════════════════════════════════
-- ROLLBACK (manual):
--   -- 2/3) tabela do catálogo (drop remove policies/índices/seed juntos)
--   drop policy if exists cid_codes_select_staff on public.cid_codes;
--   drop policy if exists cid_codes_write_admin  on public.cid_codes;
--   drop table  if exists public.cid_codes;
--   -- 1) campos do atestado
--   alter table public.certificates drop column if exists show_cid;
--   alter table public.certificates drop column if exists observation;
--   alter table public.certificates drop column if exists issue_date;
--
-- IMPACTO: reverter apaga o catálogo CID-10 (perde-se o seed) e os novos campos
--   do atestado (dados dessas 3 colunas). Nenhuma outra tabela é tocada;
--   certificates existentes permanecem íntegros nas colunas originais.
-- ════════════════════════════════════════════════════════════════

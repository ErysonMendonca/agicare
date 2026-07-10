-- ════════════════════════════════════════════════════════════════
-- agicare — migration 0104: unicidade no cadastro de profissionais
--
-- Bloqueia dois profissionais com o MESMO documento (CPF/CNPJ), o mesmo
-- registro de conselho (órgão + UF + número) ou o mesmo e-mail dentro da
-- MESMA clínica. O banco é a última barreira: a aplicação também checa antes
-- de inserir, mas duas requisições simultâneas passariam pela checagem e só o
-- índice único as separa.
--
-- Decisões (do dono):
--   • Escopo por CLÍNICA. O mesmo médico pode atender em duas clínicas — o
--     sistema é multitenant, e um CPF global impediria isso.
--   • Profissional INATIVO continua bloqueando: recadastrar quem foi desligado
--     partiria o histórico dele em dois. O certo é reativar o cadastro.
--
-- Índices PARCIAIS: só valem quando o campo está preenchido. Dos 17
-- profissionais existentes, 12 não têm documento e 14 não têm conselho — um
-- índice comum trataria todos esses vazios como iguais e a migration falharia.
-- (`null` já não colide num unique, mas string vazia colidiria.)
--
-- Índices NORMALIZADOS: '123.456.789-00' e '12345678900' são o mesmo CPF, e
-- 'cro' e 'CRO' o mesmo conselho. Guardamos o valor como o usuário digitou e
-- comparamos só os dígitos / o texto em minúsculas. `regexp_replace` e `lower`
-- são IMMUTABLE, requisito para índice em expressão.
--
-- Não há duplicatas hoje (verificado no banco antes de escrever esta migration),
-- então a criação dos índices não falha por dado pré-existente.
--
-- Aditiva e idempotente. Não apaga nem altera nenhuma linha.
-- ════════════════════════════════════════════════════════════════

-- ── 1) Documento (CPF/CNPJ) único por clínica ────────────────────
create unique index if not exists uq_professionals_clinic_document
  on public.professionals (
    clinic_id,
    regexp_replace(document, '\D', '', 'g')
  )
  where document is not null and btrim(document) <> '';

-- ── 2) Registro de conselho único por clínica ────────────────────
-- A identidade é (órgão, UF, número): "CRO-BA 12345" ≠ "CRM-BA 12345".
create unique index if not exists uq_professionals_clinic_conselho
  on public.professionals (
    clinic_id,
    lower(btrim(coalesce(council_name, ''))),
    lower(btrim(coalesce(council_uf, ''))),
    regexp_replace(council_number, '\D', '', 'g')
  )
  where council_number is not null and btrim(council_number) <> '';

-- ── 3) E-mail único por clínica ──────────────────────────────────
create unique index if not exists uq_professionals_clinic_email
  on public.professionals (
    clinic_id,
    lower(btrim(email))
  )
  where email is not null and btrim(email) <> '';

-- ════════════════════════════════════════════════════════════════
-- ROLLBACK (manual):
--   drop index if exists public.uq_professionals_clinic_email;
--   drop index if exists public.uq_professionals_clinic_conselho;
--   drop index if exists public.uq_professionals_clinic_document;
--
-- IMPACTO: reverter apenas volta a permitir cadastros duplicados. Nenhum dado
-- é afetado — os índices não alteram linhas.
-- ════════════════════════════════════════════════════════════════

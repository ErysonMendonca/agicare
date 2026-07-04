-- ════════════════════════════════════════════════════════════════
-- agicare — migration 0085: e-mail de contato do profissional
--
-- Objetivo: adicionar a coluna `email` (contato) em public.professionals.
--   É um e-mail de CONTATO/comunicação do profissional — NÃO é credencial
--   de login. O login continua sendo profiles.username (0084) e o Supabase
--   Auth usa um e-mail sintético internamente. Portanto esta coluna não
--   participa de autenticação e é puramente informativa/cadastral.
--
-- Aditiva e idempotente. RLS herdada: professionals já tem RLS e políticas
--   próprias — a coluna nova é coberta por elas, NÃO criamos policy nova.
--   NÃO APLICADA automaticamente — via scripts/migrate.mjs.
-- ════════════════════════════════════════════════════════════════

alter table public.professionals
  add column if not exists email text;

comment on column public.professionals.email is
  'E-mail de contato do profissional. NÃO é login: o login é profiles.username e o Auth usa e-mail sintético. Campo puramente cadastral/informativo.';

-- ════════════════════════════════════════════════════════════════
-- ROLLBACK (manual):
--   alter table public.professionals drop column if exists email;
--   -- (remove a coluna e o e-mail de contato de todos os profissionais)
--
-- IMPACTO: aditivo. Coluna nova, opcional (nullable), sem constraint nem
--   índice — nada existente quebra. Herda as políticas RLS já vigentes em
--   professionals; nenhuma policy nova foi criada.
-- HANDOFF: frontend/backend-dev — expor/ler `email` no cadastro do
--   profissional (contato), sem confundir com credencial de acesso.
-- ════════════════════════════════════════════════════════════════

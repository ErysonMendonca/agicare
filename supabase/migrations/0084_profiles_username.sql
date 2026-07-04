-- ════════════════════════════════════════════════════════════════
-- agicare — migration 0084: login por usuário (username) em profiles
--
-- Objetivo: permitir que o profissional seja cadastrado/autenticado por um
--   `username` em vez do e-mail. A tela de cadastro de profissional passa a
--   usar o username como credencial de acesso. O Auth do Supabase continua
--   exigindo e-mail internamente, então o backend usa um e-mail sintético
--   `${username}@agicare.local` ao criar o auth.user — transparente ao usuário.
--
-- Coluna é NULLABLE: perfis existentes (criados por e-mail real) ficam com
--   username NULL e seguem funcionando. Índice único PARCIAL (where username
--   is not null) garante unicidade sem colidir múltiplos NULLs.
--
-- Tipo citext (case-insensitive): "Joao" e "joao" são o mesmo login.
--
-- Aditiva e idempotente. NÃO altera o trigger handle_new_user. NÃO aplicada
--   automaticamente — via scripts/migrate.mjs.
-- ════════════════════════════════════════════════════════════════

create extension if not exists citext;

alter table public.profiles
  add column if not exists username citext;

create unique index if not exists profiles_username_key
  on public.profiles (username)
  where username is not null;

comment on column public.profiles.username is
  'Login de acesso do usuário (substitui o e-mail como credencial na tela de cadastro de profissional). Case-insensitive (citext). O Auth do Supabase continua usando um e-mail sintético ${username}@agicare.local internamente. NULL para perfis antigos criados por e-mail real.';

-- ════════════════════════════════════════════════════════════════
-- ROLLBACK (manual):
--   drop index if exists public.profiles_username_key;
--   alter table public.profiles drop column if exists username;
--   -- (a extensão citext pode ser mantida; drop só se nada mais a usar)
--
-- IMPACTO: aditivo. Coluna nova e opcional (nullable) em profiles — nada
--   existente quebra. RLS de profiles inalterada (a nova coluna herda as
--   políticas da tabela). Índice único parcial não afeta linhas com NULL.
-- HANDOFF: backend-dev — ao cadastrar profissional, gerar auth.user com e-mail
--   sintético `${username}@agicare.local` e gravar `username` no profile; no
--   login, resolver username → e-mail sintético antes do signInWithPassword.
--   frontend-dev — trocar o campo "e-mail" por "usuário" na tela de cadastro.
-- ════════════════════════════════════════════════════════════════

-- ════════════════════════════════════════════════════════════════
-- agicare — migration 0044: updated_at em public.patients (+ trigger)
-- A tabela patients (0001) só tinha created_at. Adicionamos updated_at
-- para habilitar OPTIMISTIC LOCK na edição do cadastro (updatePaciente):
-- o form embarca o updated_at carregado e o UPDATE casa por ele; se
-- outro usuário gravou no meio, o match falha e a action devolve
-- "Cadastro alterado por outro usuário".
--
-- Cria a função genérica public.set_updated_at() (SECURITY INVOKER,
-- search_path=public) e um trigger BEFORE UPDATE que carimba now() a
-- cada gravação — assim o lock não depende do cliente enviar o campo.
-- Aditiva e idempotente. NÃO mexe em RLS.
-- NÃO APLICADA automaticamente — aplicar via scripts/migrate.mjs.
-- ════════════════════════════════════════════════════════════════

-- 1) Coluna updated_at (backfill com created_at p/ linhas existentes;
--    default now() cobre o restante). Idempotente.
alter table public.patients
  add column if not exists updated_at timestamptz not null default now();

-- Linhas pré-existentes: alinha updated_at ao created_at (em vez do now()
-- da adição da coluna), refletindo a última gravação real conhecida.
update public.patients
  set updated_at = created_at
  where updated_at is distinct from created_at
    and created_at is not null;

-- 2) Função genérica de touch. SECURITY INVOKER (roda com os privilégios
--    de quem dispara o UPDATE — sem escalonamento) e search_path fixo.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- 3) Trigger BEFORE UPDATE em patients. Recriado de forma idempotente.
drop trigger if exists patients_set_updated_at on public.patients;
create trigger patients_set_updated_at
  before update on public.patients
  for each row
  execute function public.set_updated_at();

-- ────────────────────────────────────────────────────────────────
-- Rollback (manual):
--   drop trigger if exists patients_set_updated_at on public.patients;
--   drop function if exists public.set_updated_at();
--   alter table public.patients drop column if exists updated_at;
-- ────────────────────────────────────────────────────────────────

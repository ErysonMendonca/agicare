-- ════════════════════════════════════════════════════════════════
-- agicare — migration 0028: Procedimentos (abas de coleta) + Profissionais
-- Persiste as abas do cadastro de procedimento que antes só coletavam:
--   B) Profissionais Habilitados → public.procedure_professionals (junção)
--   C) Materiais                 → public.procedure_materials (junção)
--   D) Sessões                   → colunas em public.procedures
--   E) Orientações/Documentos    → public.procedure_instructions
-- Depende de 0001 (public.is_staff()), 0002 (procedures), 0004 (professionals),
-- 0002/0006 (stock_products). RLS: staff gerencia tudo.
-- Idempotente: create table/add column if not exists / drop policy if exists.
-- NOTA: SEM clinic_id (multitenant 0020 NÃO aplicado) — segue 0004-0019.
-- ════════════════════════════════════════════════════════════════

-- ── Procedimentos: aba D (Sessões) — colunas extras ─────────────────
alter table public.procedures
  add column if not exists session_validity_days int,                 -- validade do pacote (dias)
  add column if not exists min_age                int,                 -- idade mínima permitida
  add column if not exists audience               text not null default 'todos'; -- público (todos/adulto/infantil/idoso)

-- ── Aba B — Profissionais habilitados (junção procedimento × profissional) ─
create table if not exists public.procedure_professionals (
  id               uuid primary key default gen_random_uuid(),
  procedure_id     uuid not null references public.procedures (id) on delete cascade,
  professional_id  uuid not null references public.professionals (id) on delete cascade,
  created_at       timestamptz not null default now(),
  unique (procedure_id, professional_id)
);
create index if not exists idx_proc_prof_procedure on public.procedure_professionals (procedure_id);
create index if not exists idx_proc_prof_professional on public.procedure_professionals (professional_id);

-- ── Aba C — Materiais/insumos consumidos (junção procedimento × produto) ──
create table if not exists public.procedure_materials (
  id               uuid primary key default gen_random_uuid(),
  procedure_id     uuid not null references public.procedures (id) on delete cascade,
  product_id       uuid not null references public.stock_products (id) on delete cascade,
  quantity         numeric(12,2) not null default 1,   -- qtd. consumida por execução (baixa de estoque)
  created_at       timestamptz not null default now(),
  unique (procedure_id, product_id)
);
create index if not exists idx_proc_mat_procedure on public.procedure_materials (procedure_id);
create index if not exists idx_proc_mat_product on public.procedure_materials (product_id);

-- ── Aba E — Orientações e documentos (1:1 com procedimento) ─────────
create table if not exists public.procedure_instructions (
  id                uuid primary key default gen_random_uuid(),
  procedure_id      uuid not null unique references public.procedures (id) on delete cascade,
  pre_instructions  text,                               -- orientações pré-procedimento
  post_instructions text,                               -- orientações pós-procedimento
  require_consent   boolean not null default false,     -- exigir termo de consentimento
  require_anamnese  boolean not null default false,     -- exigir anamnese prévia
  updated_at        timestamptz not null default now(),
  created_at        timestamptz not null default now()
);

-- ════════════════════════════════════════════════════════════════
-- RLS — staff (admin/medico/recepcao) gerencia tudo.
-- ════════════════════════════════════════════════════════════════
alter table public.procedure_professionals enable row level security;
alter table public.procedure_materials     enable row level security;
alter table public.procedure_instructions  enable row level security;

do $$
declare t text;
begin
  foreach t in array array[
    'procedure_professionals','procedure_materials','procedure_instructions'
  ] loop
    execute format('drop policy if exists %I_staff_all on public.%I;', t, t);
    execute format(
      'create policy %I_staff_all on public.%I for all using (public.is_staff()) with check (public.is_staff());',
      t, t
    );
  end loop;
end $$;

-- ════════════════════════════════════════════════════════════════
-- ROLLBACK (manual):
--   drop table procedure_instructions, procedure_materials, procedure_professionals;
--   alter table procedures drop column session_validity_days, drop column min_age, drop column audience;
-- ════════════════════════════════════════════════════════════════

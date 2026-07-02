-- ════════════════════════════════════════════════════════════════
-- agicare — migration 0072: cargos personalizados + vínculo ao usuário
-- Um "cargo" é um rótulo livre (ex.: Fisioterapeuta) que HERDA o acesso de um
-- cargo-base do enum user_role (admin|medico|recepcao). A seguranca (RLS) segue
-- usando clinic_members.role (= base_role do cargo); o cargo_id só guarda o
-- rótulo exibido. Depende de 0001 (user_role, clinic_members), 0020/0021
-- (current_role/current_clinic_id). Idempotente.
-- ════════════════════════════════════════════════════════════════

-- ── Cargos (por clínica) ─────────────────────────────────────────
create table if not exists public.cargos (
  id         uuid primary key default gen_random_uuid(),
  clinic_id  uuid not null references public.clinics (id) on delete cascade,
  name       text not null,
  -- Cargo-base do enum que define o acesso REAL (nunca 'paciente').
  base_role  public.user_role not null,
  created_at timestamptz not null default now(),
  constraint chk_cargos_base_role check (base_role in ('admin','medico','recepcao'))
);
create index if not exists idx_cargos_clinic on public.cargos (clinic_id);
-- Nome do cargo único por clínica (evita duplicatas).
create unique index if not exists uq_cargos_clinic_name
  on public.cargos (clinic_id, lower(name));

-- Vínculo do cargo (rótulo) ao membro da clínica. O acesso continua vindo de
-- clinic_members.role (= base_role); cargo_id é só apresentação.
alter table public.clinic_members
  add column if not exists cargo_id uuid references public.cargos (id) on delete set null;

-- ── RLS: cargos são geridos SOMENTE por admin da clínica ativa ────
alter table public.cargos enable row level security;

drop policy if exists cargos_admin_all on public.cargos;
create policy cargos_admin_all on public.cargos
  for all
  using      (public.current_role() = 'admin' and clinic_id = public.current_clinic_id())
  with check (public.current_role() = 'admin' and clinic_id = public.current_clinic_id());

-- Leitura por staff (para exibir o rótulo do cargo em listas). Escrita só admin
-- (policy acima; ambas coexistem — RLS é OR entre policies permissivas).
drop policy if exists cargos_read_staff on public.cargos;
create policy cargos_read_staff on public.cargos
  for select
  using (public.is_staff() and clinic_id = public.current_clinic_id());

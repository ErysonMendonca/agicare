-- ════════════════════════════════════════════════════════════════
-- agicare — migration 0014: Auditoria / GRC (LGPD, Lei 13.709)
-- Log de acessos a prontuários (rastreabilidade de dados sensíveis) +
-- auditoria de consentimentos. Depende de 0001 (patients/profiles, helpers)
-- e 0007 (consents). Aplicar DEPOIS do consolidado 0004–0010.
-- ════════════════════════════════════════════════════════════════

-- ── Log de acessos a prontuários / dados sensíveis ──────────────
create table if not exists public.access_logs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references public.profiles (id) on delete set null,
  user_name   text,                       -- desnormalizado (auditoria mantém histórico)
  user_role   public.user_role,
  patient_id  uuid references public.patients (id) on delete set null,
  patient_name text,                      -- desnormalizado p/ sobreviver à exclusão do paciente
  module      text not null,              -- ex.: 'prontuario','prescricao','anamnese','evolucao'
  action      text not null default 'view', -- 'view' | 'create' | 'update' | 'delete' | 'print' | 'export'
  created_at  timestamptz not null default now()
);
create index if not exists idx_access_logs_patient on public.access_logs (patient_id, created_at desc);
create index if not exists idx_access_logs_user    on public.access_logs (user_id, created_at desc);

-- ── Auditoria de consentimentos (quem registrou) ────────────────
alter table public.consents
  add column if not exists created_by uuid references public.profiles (id);

-- ════════════════════════════════════════════════════════════════
-- RLS: staff registra (insert); SOMENTE admin lê (auditoria/conformidade).
-- ════════════════════════════════════════════════════════════════
alter table public.access_logs enable row level security;

drop policy if exists access_logs_insert_staff on public.access_logs;
create policy access_logs_insert_staff on public.access_logs
  for insert with check (public.is_staff());

drop policy if exists access_logs_read_admin on public.access_logs;
create policy access_logs_read_admin on public.access_logs
  for select using (public.current_role() = 'admin');

-- ════════════════════════════════════════════════════════════════
-- ROLLBACK (manual):
--   drop table if exists public.access_logs;
--   alter table public.consents drop column if exists created_by;
-- ════════════════════════════════════════════════════════════════

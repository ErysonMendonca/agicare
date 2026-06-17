-- ════════════════════════════════════════════════════════════════
-- agicare — migration 0036: correção de isolamento de tenant
--
-- Achado da auditoria pós-Onda 4: tabelas CRIADAS após a 0020 (em 0027/0028)
-- nunca receberam clinic_id nem RLS por tenant — a 0020/0021 só isolaram as
-- tabelas que existiam ATÉ ELAS. Com multitenant ativo, isso permite leitura/
-- escrita CROSS-CLÍNICA. Mesma classe do CRÍTICO já corrigido na 0033.
--
--   • appointment_notifications (0027) — ALTO: guarda patient_id + recipient
--     (telefone/e-mail EM CLARO) → vazamento de PII entre clínicas (LGPD).
--   • procedure_professionals / procedure_materials / procedure_instructions
--     (0028) — MÉDIO: catálogo cross-clínica; procedure_materials alimenta o
--     trigger de baixa de estoque (0031), então escrita cross-tenant
--     enfraquece a integridade do consumo.
--
-- Depende de 0020 (clinics, current_clinic_id(), is_staff(),
-- set_clinic_id_default()), 0021 (procedures já isolada por tenant).
-- Idempotente. APLICAR MANUALMENTE (runner scripts/migrate.mjs).
-- ════════════════════════════════════════════════════════════════

-- ════════════════════════════════════════════════════════════════
-- 1) appointment_notifications — add clinic_id + backfill + RLS por tenant
-- ════════════════════════════════════════════════════════════════
alter table public.appointment_notifications
  add column if not exists clinic_id uuid references public.clinics (id) on delete cascade;

-- Backfill pela clínica do paciente vinculado.
update public.appointment_notifications n
   set clinic_id = p.clinic_id
  from public.patients p
 where n.patient_id = p.id
   and n.clinic_id is null;

-- Órfãos (sem patient_id resolvível) → clínica padrão (DEMO_CLINIC_ID).
update public.appointment_notifications
   set clinic_id = '00000000-0000-0000-0000-000000000001'
 where clinic_id is null;

alter table public.appointment_notifications
  alter column clinic_id set not null;

create index if not exists idx_appointment_notifications_clinic
  on public.appointment_notifications (clinic_id);

-- Rede de segurança: default de clinic_id em inserts futuros (0023).
drop trigger if exists trg_set_clinic_id_appointment_notifications
  on public.appointment_notifications;
create trigger trg_set_clinic_id_appointment_notifications
  before insert on public.appointment_notifications
  for each row execute function public.set_clinic_id_default();

-- RLS por tenant (substitui a policy só-is_staff() da 0027).
drop policy if exists appointment_notifications_staff_all
  on public.appointment_notifications;
create policy appointment_notifications_staff_all
  on public.appointment_notifications for all
  using (public.is_staff() and clinic_id = public.current_clinic_id())
  with check (public.is_staff() and clinic_id = public.current_clinic_id());

-- ════════════════════════════════════════════════════════════════
-- 2) procedure_professionals / _materials / _instructions —
--    RLS escopada pela clínica do PROCEDIMENTO-pai (procedures já é
--    tenant-isolada pela 0021). Sem coluna nova, sem backfill: o vínculo
--    só é visível/gravável se o procedure_id pertencer à clínica ativa.
-- ════════════════════════════════════════════════════════════════
do $$
declare t text;
begin
  foreach t in array array[
    'procedure_professionals','procedure_materials','procedure_instructions'
  ] loop
    execute format('drop policy if exists %I_staff_all on public.%I;', t, t);
    execute format(
      'create policy %I_staff_all on public.%I for all '
      'using (public.is_staff() and exists ('
        'select 1 from public.procedures p '
        'where p.id = procedure_id and p.clinic_id = public.current_clinic_id())) '
      'with check (public.is_staff() and exists ('
        'select 1 from public.procedures p '
        'where p.id = procedure_id and p.clinic_id = public.current_clinic_id()));',
      t, t
    );
  end loop;
end $$;

-- ════════════════════════════════════════════════════════════════
-- ROLLBACK (manual) — volta às policies só-is_staff() da 0027/0028 e
-- remove o isolamento (NÃO recomendado; reabre o vazamento):
--   drop trigger if exists trg_set_clinic_id_appointment_notifications on public.appointment_notifications;
--   drop policy if exists appointment_notifications_staff_all on public.appointment_notifications;
--   alter table public.appointment_notifications drop column if exists clinic_id;
--   (recriar as policies _staff_all só com is_staff() nas 4 tabelas)
-- ════════════════════════════════════════════════════════════════

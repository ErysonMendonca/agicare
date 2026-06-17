-- ════════════════════════════════════════════════════════════════
-- agicare — migration 0021: RLS multitenant (amarra TODAS as policies ao tenant)
--
-- Reescreve as policies de domínio (0001–0019) para exigir, ALÉM do papel,
-- que a linha pertença à clínica ativa:  clinic_id = current_clinic_id().
-- Como clinic_id é NOT NULL (0020) e current_clinic_id() é fail-closed (NULL
-- quando o claim falta), o isolamento é estrito por construção.
--
-- DEPENDÊNCIA CRÍTICA: aplicar DEPOIS da 0020 e DEPOIS de registrar o
-- Custom Access Token Hook (0022) + reduzir o TTL no Dashboard. Se rodar
-- esta migration ANTES do hook popular o claim, current_clinic_id() = NULL
-- para todo mundo → staff fica SEM ACESSO (fail-closed). Ver relatório.
--
-- Padrão (em do-block por grupo p/ não repetir ~40 policies):
--   *_staff_all     → using/check: is_staff() AND clinic_id = current_clinic_id()
--   *_clinical_all  → using/check: current_role() in ('admin','medico') AND clinic_id = ...
--   admin/read/write → adiciona AND clinic_id = current_clinic_id() no using E no with check
--
-- profiles_* (0001) NÃO são tocadas: profile é GLOBAL (1:1 com auth.users).
--
-- Idempotente: drop policy if exists antes de recriar.
-- ════════════════════════════════════════════════════════════════

-- ════════════════════════════════════════════════════════════════
-- CHECKLIST DE COBERTURA (policy reescrita ← migration de origem):
--   0001  professionals_read_staff, professionals_write_admin,
--         patients_staff_all, patients_self_read,
--         appointments_staff_all, appointments_self_read,
--         records_clinical_all (medical_records)
--   0002  procedures_*(ver 0013), queue_entries_staff_all,
--         stock_products_staff_all, stock_movements_staff_all,
--         billable_events_staff_all, lab_cases_staff_all
--   0004  vital_signs_staff_all
--   0005  schedules_staff_all, schedule_blocks_staff_all
--   0006  suppliers/dispensations/dispensation_items/purchase_requests/
--         quotations/inventories/inventory_counts _staff_all
--   0007  anamneses/prescriptions/prescription_items/care_orders/
--         prescription_checks/certificates/consents _clinical_all
--   0008  nursing_notes/sae_records/care_checks/fluid_balance/
--         fluid_balance_entries/nursing_evolutions/assessment_scales/
--         nursing_procedures _staff_all
--   0009  tiss_batches/tiss_guides/billing_items _staff_all
--   0010  (clinic_settings — ver 0013)
--   0013  procedures_read_staff, procedures_write_admin,
--         clinic_settings_read_staff, clinic_settings_write_admin
--   0014  access_logs_insert_staff, access_logs_read_admin
--   0016  exam_orders_clinical_all
--   0017  prosthetic_orders_clinical_all, prosthetic_files_clinical_all,
--         protetico_staff_all (storage.objects)
--   0019  role_permissions_read_staff, role_permissions_write_admin
-- ════════════════════════════════════════════════════════════════

-- ── GRUPO 1: *_staff_all (operacionais) ──────────────────────────
-- staff gerencia tudo NA SUA clínica.
do $$
declare t text;
begin
  foreach t in array array[
    'queue_entries','stock_products','stock_movements','billable_events','lab_cases',
    'vital_signs','schedules','schedule_blocks',
    'suppliers','dispensations','dispensation_items','purchase_requests',
    'quotations','inventories','inventory_counts',
    'nursing_notes','sae_records','care_checks','fluid_balance',
    'fluid_balance_entries','nursing_evolutions','assessment_scales','nursing_procedures',
    'tiss_batches','tiss_guides','billing_items'
  ] loop
    execute format('drop policy if exists %I_staff_all on public.%I;', t, t);
    execute format(
      'create policy %I_staff_all on public.%I for all '
      'using (public.is_staff() and clinic_id = public.current_clinic_id()) '
      'with check (public.is_staff() and clinic_id = public.current_clinic_id());',
      t, t
    );
  end loop;
end $$;

-- ── GRUPO 2: *_clinical_all (dado clínico sensível — admin/medico) ──
do $$
declare t text;
begin
  foreach t in array array[
    'medical_records',
    'anamneses','prescriptions','prescription_items','care_orders',
    'prescription_checks','certificates','consents',
    'exam_orders','prosthetic_orders','prosthetic_files'
  ] loop
    -- nome da policy varia: medical_records usa records_clinical_all (0001);
    -- as demais usam <t>_clinical_all. Tratamos ambos os nomes.
    execute format('drop policy if exists %I_clinical_all on public.%I;', t, t);
    if t = 'medical_records' then
      execute 'drop policy if exists records_clinical_all on public.medical_records;';
    end if;
    execute format(
      'create policy %I_clinical_all on public.%I for all '
      'using (public.current_role() in (''admin'',''medico'') and clinic_id = public.current_clinic_id()) '
      'with check (public.current_role() in (''admin'',''medico'') and clinic_id = public.current_clinic_id());',
      t, t
    );
  end loop;
end $$;

-- ── GRUPO 3: professionals (read staff / write admin) — 0001 ──────
drop policy if exists professionals_read_staff on public.professionals;
create policy professionals_read_staff on public.professionals
  for select using (public.is_staff() and clinic_id = public.current_clinic_id());

drop policy if exists professionals_write_admin on public.professionals;
create policy professionals_write_admin on public.professionals
  for all
  using  (public.current_role() = 'admin' and clinic_id = public.current_clinic_id())
  with check (public.current_role() = 'admin' and clinic_id = public.current_clinic_id());

-- ── GRUPO 4: patients (staff_all + self_read paciente) — 0001 ─────
drop policy if exists patients_staff_all on public.patients;
create policy patients_staff_all on public.patients
  for all
  using  (public.is_staff() and clinic_id = public.current_clinic_id())
  with check (public.is_staff() and clinic_id = public.current_clinic_id());

-- paciente vê o próprio registro, MAS só dentro da clínica ativa.
drop policy if exists patients_self_read on public.patients;
create policy patients_self_read on public.patients
  for select using (
    profile_id = auth.uid() and clinic_id = public.current_clinic_id()
  );

-- ── GRUPO 5: appointments (staff_all + self_read paciente) — 0001 ─
drop policy if exists appointments_staff_all on public.appointments;
create policy appointments_staff_all on public.appointments
  for all
  using  (public.is_staff() and clinic_id = public.current_clinic_id())
  with check (public.is_staff() and clinic_id = public.current_clinic_id());

drop policy if exists appointments_self_read on public.appointments;
create policy appointments_self_read on public.appointments
  for select using (
    clinic_id = public.current_clinic_id()
    and patient_id in (
      select id from public.patients
       where profile_id = auth.uid()
         and clinic_id = public.current_clinic_id()
    )
  );

-- ── GRUPO 6: procedures (read staff / write admin) — 0013 ─────────
drop policy if exists procedures_read_staff on public.procedures;
create policy procedures_read_staff on public.procedures
  for select using (public.is_staff() and clinic_id = public.current_clinic_id());

drop policy if exists procedures_write_admin on public.procedures;
create policy procedures_write_admin on public.procedures
  for all
  using  (public.current_role() = 'admin' and clinic_id = public.current_clinic_id())
  with check (public.current_role() = 'admin' and clinic_id = public.current_clinic_id());

-- ── GRUPO 7: clinic_settings (read staff / write admin) — 0013 ────
drop policy if exists clinic_settings_read_staff on public.clinic_settings;
create policy clinic_settings_read_staff on public.clinic_settings
  for select using (public.is_staff() and clinic_id = public.current_clinic_id());

drop policy if exists clinic_settings_write_admin on public.clinic_settings;
create policy clinic_settings_write_admin on public.clinic_settings
  for all
  using  (public.current_role() = 'admin' and clinic_id = public.current_clinic_id())
  with check (public.current_role() = 'admin' and clinic_id = public.current_clinic_id());

-- ── GRUPO 8: access_logs (insert staff / read admin) — 0014 ──────
-- with check no INSERT impede gravar log carimbado p/ outra clínica.
drop policy if exists access_logs_insert_staff on public.access_logs;
create policy access_logs_insert_staff on public.access_logs
  for insert with check (public.is_staff() and clinic_id = public.current_clinic_id());

drop policy if exists access_logs_read_admin on public.access_logs;
create policy access_logs_read_admin on public.access_logs
  for select using (public.current_role() = 'admin' and clinic_id = public.current_clinic_id());

-- ── GRUPO 9: role_permissions (read staff / write admin) — 0019 ──
drop policy if exists role_permissions_read_staff on public.role_permissions;
create policy role_permissions_read_staff on public.role_permissions
  for select using (public.is_staff() and clinic_id = public.current_clinic_id());

drop policy if exists role_permissions_write_admin on public.role_permissions;
create policy role_permissions_write_admin on public.role_permissions
  for all
  using  (public.current_role() = 'admin' and clinic_id = public.current_clinic_id())
  with check (public.current_role() = 'admin' and clinic_id = public.current_clinic_id());

-- ════════════════════════════════════════════════════════════════
-- GRUPO 10: Storage 'protetico' — isolamento por convenção de PATH.
--   Convenção nova:  protetico/<clinic_id>/<order_id>/<arquivo>
--   A 1ª pasta do path TEM que ser a clínica ativa.
-- HANDOFF (backend-dev): o upload precisa migrar para esse layout de path
--   (hoje grava em protetico/... sem o prefixo da clínica). Arquivos antigos
--   ficam invisíveis até serem movidos/migrados — planejar script de migração
--   de objetos no Storage.
-- ════════════════════════════════════════════════════════════════
drop policy if exists protetico_staff_all on storage.objects;
create policy protetico_staff_all on storage.objects
  for all
  using (
    bucket_id = 'protetico'
    and public.is_staff()
    and (storage.foldername(name))[1] = public.current_clinic_id()::text
  )
  with check (
    bucket_id = 'protetico'
    and public.is_staff()
    and (storage.foldername(name))[1] = public.current_clinic_id()::text
  );

-- ════════════════════════════════════════════════════════════════
-- FORCE ROW LEVEL SECURITY nas tabelas sensíveis.
-- Garante que NEM O DONO da tabela (postgres) burle a RLS — defesa em
-- profundidade p/ dado clínico/LGPD e auditoria. (service-role usa um role
-- que ignora RLS por bypass, não por ownership; este FORCE não o afeta.)
-- ════════════════════════════════════════════════════════════════
do $$
declare t text;
begin
  foreach t in array array[
    'medical_records','vital_signs','patients','anamneses','prescriptions',
    'prescription_items','consents','access_logs','exam_orders',
    'prosthetic_orders','prosthetic_files',
    'nursing_notes','sae_records','care_checks','fluid_balance',
    'fluid_balance_entries','nursing_evolutions','assessment_scales','nursing_procedures'
  ] loop
    execute format('alter table public.%I force row level security;', t);
  end loop;
end $$;

-- ════════════════════════════════════════════════════════════════
-- ROLLBACK (manual) — REMOVE o amarre de tenant das policies.
-- ATENÇÃO: recriar EXATAMENTE as policies originais (sem clinic_id) exige
-- reaplicar os trechos de RLS das migrations 0001/0002/0004–0019. Aqui
-- listamos o ESSENCIAL para destravar; para fidelidade total, reexecutar
-- os blocos RLS das migrations de origem.
--
--   -- desligar FORCE RLS
--   do $$ declare t text; begin
--     foreach t in array array['medical_records','vital_signs','patients',
--       'anamneses','prescriptions','prescription_items','consents','access_logs',
--       'exam_orders','prosthetic_orders','prosthetic_files','nursing_notes',
--       'sae_records','care_checks','fluid_balance','fluid_balance_entries',
--       'nursing_evolutions','assessment_scales','nursing_procedures'] loop
--       execute format('alter table public.%I no force row level security;', t);
--     end loop; end $$;
--
--   -- *_staff_all sem tenant (reexecutar o do-block do GRUPO 1 sem o
--   --  'and clinic_id = current_clinic_id()')
--   -- *_clinical_all sem tenant (idem GRUPO 2)
--   -- professionals/patients/appointments/procedures/clinic_settings/
--   --  access_logs/role_permissions: recriar conforme 0001/0013/0014/0019
--   -- storage: voltar a protetico_staff_all da 0017
--   drop policy if exists protetico_staff_all on storage.objects;
--   create policy protetico_staff_all on storage.objects
--     for all using (bucket_id='protetico' and public.is_staff())
--     with check (bucket_id='protetico' and public.is_staff());
--
-- IMPACTO: reverter REABRE o vazamento entre clínicas. Só fazer em ambiente
-- mono-clínica (clínica default apenas).
-- ════════════════════════════════════════════════════════════════

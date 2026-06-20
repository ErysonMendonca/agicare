-- ════════════════════════════════════════════════════════════════
-- agicare — migration 0052: anexos da LOUSA da anamnese (imagem/desenho)
--
-- A "lousa" do builder de anamnese permite anexar uma imagem (foto, exame)
-- e/ou salvar um desenho/marcação feito sobre ela como arquivo, vinculado ao
-- prontuário do paciente. Os bytes vão para um bucket PRIVADO de Storage
-- ('anamnese'); esta tabela guarda apenas os metadados/ponteiro.
--
-- Dado CLÍNICO sensível (LGPD): a RLS espelha o padrão de prosthetic_files
-- (0017) — acesso restrito a admin/medico via public.current_role(). Como esta
-- tabela já carrega clinic_id (multitenant, 0020/0021), ADICIONAMOS o escopo de
-- clínica (clinic_id = public.current_clinic_id()) ao filtro clínico, fechando o
-- isolamento por tenant que a 0017 não tinha (prosthetic_files herda o tenant
-- pela order). Decisão: clínico (admin/medico) + tenant — mais restritivo que
-- staff puro, coerente com LGPD.
--
-- Storage: igual à 0017, o bucket é criado via SQL (insert em storage.buckets,
--   on conflict do nothing) e a policy em storage.objects usa public.is_staff()
--   + bucket_id. Recomenda-se que o caminho (storage_path) embuta o
--   clinic_id/patient_id (ex.: '<clinic_id>/<patient_id>/<uuid>.png') para
--   escopo lógico — responsabilidade do BACKEND ao gerar o path.
--
-- Aditiva e idempotente. DEPENDE de: clinics (0020), patients (0001),
--   profiles (0001), helpers current_role()/is_staff()/current_clinic_id()
--   (0021). NÃO APLICADA automaticamente — aplicar via scripts/migrate.mjs.
-- ════════════════════════════════════════════════════════════════

create table if not exists public.anamnese_files (
  id            uuid primary key default gen_random_uuid(),
  clinic_id     uuid not null references public.clinics (id) on delete cascade,
  patient_id    uuid not null references public.patients (id) on delete cascade,
  storage_path  text not null,                         -- caminho dentro do bucket 'anamnese'
  kind          text,                                  -- ex.: 'lousa'
  note          text,                                  -- legenda opcional
  created_by    uuid references public.profiles (id),
  created_at    timestamptz not null default now()
);

comment on table public.anamnese_files is
  'Anexos da lousa da anamnese (imagem + desenho salvo) vinculados ao prontuário do paciente. Bytes no bucket privado de Storage ''anamnese''; aqui só metadados. Dado clínico sensível (LGPD): RLS admin/medico + tenant.';
comment on column public.anamnese_files.storage_path is
  'Caminho no bucket ''anamnese''. Backend deve embutir clinic_id/patient_id no path para escopo lógico (ex.: <clinic_id>/<patient_id>/<uuid>.png).';

-- índice para a query quente: anexos por clínica + paciente.
create index if not exists idx_anamnese_files_clinic_patient
  on public.anamnese_files (clinic_id, patient_id);

-- ── RLS: clínico (admin/medico) + tenant — espelha 0017 + escopo de clínica ──
alter table public.anamnese_files enable row level security;

drop policy if exists anamnese_files_clinical_all on public.anamnese_files;
create policy anamnese_files_clinical_all on public.anamnese_files
  for all
  using      (public.current_role() in ('admin','medico') and clinic_id = public.current_clinic_id())
  with check (public.current_role() in ('admin','medico') and clinic_id = public.current_clinic_id());

-- ── Storage: bucket privado 'anamnese' + policy de staff (espelha 0017) ──────
insert into storage.buckets (id, name, public)
values ('anamnese', 'anamnese', false)
on conflict (id) do nothing;

drop policy if exists anamnese_staff_all on storage.objects;
create policy anamnese_staff_all on storage.objects
  for all using (bucket_id = 'anamnese' and public.is_staff())
  with check (bucket_id = 'anamnese' and public.is_staff());

-- ════════════════════════════════════════════════════════════════
-- ROLLBACK (manual):
--   drop policy if exists anamnese_staff_all on storage.objects;
--   delete from storage.buckets where id = 'anamnese';
--   drop table if exists public.anamnese_files;
--   (drop table remove em cascata a policy e o índice da tabela.)
--
-- IMPACTO: aditivo. Tabela e bucket novos, nascem vazios — nada existente é
--   afetado. Reverter apenas descarta os anexos da lousa (e os objetos no
--   bucket, que devem ser limpos no Storage antes do delete do bucket).
-- HANDOFF: backend-dev — Server Action de upload (gerar storage_path com
--   clinic_id/patient_id, gravar metadados) e download via signed URL; gate
--   por papel clínico. frontend-dev — captura da lousa (canvas → PNG/blob).
-- ════════════════════════════════════════════════════════════════

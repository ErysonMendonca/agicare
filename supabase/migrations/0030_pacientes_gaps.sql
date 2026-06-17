-- ════════════════════════════════════════════════════════════════
-- agicare — migration 0030: Pacientes (módulo 6) — fechamento de gaps
--
-- Complementa o cadastro de pacientes com o ANEXO de prontuário manual:
-- além do texto livre (`manual_record`, já existente desde a 0004/0010),
-- passamos a guardar a referência de um ARQUIVO digitalizado no Storage.
--
--   - `manual_record_path` : caminho do arquivo no bucket privado 'prontuarios'
--                            (layout `<clinic_id>/<patient_id>/<arquivo>`);
--   - `manual_record_name` : nome original do arquivo (exibição/download).
--
-- Também cria o bucket privado 'prontuarios' e a policy de Storage isolada por
-- clínica — MESMA convenção de PATH do bucket 'protetico' (0021): a 1ª pasta do
-- caminho TEM que ser a clínica ativa (current_clinic_id()).
--
-- Idempotente (add column if not exists / on conflict do nothing / drop policy
-- if exists). NÃO altera RLS das tabelas (patients já é staff-only por clínica).
-- ════════════════════════════════════════════════════════════════

alter table public.patients
  add column if not exists manual_record_path text,  -- arquivo no bucket 'prontuarios'
  add column if not exists manual_record_name text;  -- nome original do arquivo

-- ── Storage: bucket privado 'prontuarios' ────────────────────────
insert into storage.buckets (id, name, public)
values ('prontuarios', 'prontuarios', false)
on conflict (id) do nothing;

-- Isolamento por convenção de PATH: prontuarios/<clinic_id>/<patient_id>/<arquivo>.
-- A 1ª pasta do path TEM que ser a clínica ativa (mesma regra da 0021/protetico).
-- Acesso restrito a staff da clínica; o reforço por papel clínico (admin/medico)
-- fica nas Server Actions (anexar/getProntuarioManualUrl via requireClinico).
drop policy if exists prontuarios_staff_all on storage.objects;
create policy prontuarios_staff_all on storage.objects
  for all
  using (
    bucket_id = 'prontuarios'
    and public.is_staff()
    and (storage.foldername(name))[1] = public.current_clinic_id()::text
  )
  with check (
    bucket_id = 'prontuarios'
    and public.is_staff()
    and (storage.foldername(name))[1] = public.current_clinic_id()::text
  );

-- ROLLBACK (manual):
--   drop policy if exists prontuarios_staff_all on storage.objects;
--   delete from storage.buckets where id = 'prontuarios';
--   alter table public.patients
--     drop column if exists manual_record_path,
--     drop column if exists manual_record_name;
--
-- NOTA: em ambiente MONO-CLÍNICA (multitenant 0020/0021 não aplicado), a policy
-- acima depende de public.current_clinic_id()/is_staff(); se essas funções não
-- existirem neste banco, ajuste a policy para `bucket_id='prontuarios' and
-- public.is_staff()` (sem o prefixo de clínica), como na 0017 original.

-- ════════════════════════════════════════════════════════════════
-- agicare — migration 0065: isolamento por clínica no Storage 'anamnese'
--
-- A policy `anamnese_staff_all` (0052) só exigia is_staff() + bucket_id, SEM
-- checar a pasta da clínica. Como is_staff() = admin|medico|recepcao, qualquer
-- staff de QUALQUER clínica podia ler/gravar/sobrescrever/apagar QUALQUER objeto
-- do bucket via API de Storage — incluindo os DESENHOS DE LOUSA de pacientes
-- (dado clínico sensível, LGPD) e as imagens de fundo de templates de outras
-- clínicas. Aqui fechamos o furo espelhando `protetico_staff_all` (0021):
-- exige que a 1ª pasta do path seja o clinic_id ativo.
--
-- Convenção de path (já usada no código):
--   <clinic_id>/<patient_id>/<ts>.png        (lousa do paciente — salvarLousa)
--   <clinic_id>/templates/lousa-<esp>-<ts>.*  (imagem de fundo — gestor)
-- Ambos têm o clinic_id como 1ª pasta → cobertos pela checagem.
--
-- Idempotente. DEPENDE de: 0052 (bucket 'anamnese'), 0020/0021
-- (current_clinic_id/is_staff). NÃO APLICADA automaticamente — migrate.mjs.
-- Obs.: objetos legados eventualmente gravados fora de <clinic_id>/ deixam de
-- ser acessíveis por RLS (revisar antes de aplicar se houver bucket populado).
-- ════════════════════════════════════════════════════════════════

drop policy if exists anamnese_staff_all on storage.objects;
create policy anamnese_staff_all on storage.objects
  for all
  using (
    bucket_id = 'anamnese'
    and public.is_staff()
    and (storage.foldername(name))[1] = public.current_clinic_id()::text
  )
  with check (
    bucket_id = 'anamnese'
    and public.is_staff()
    and (storage.foldername(name))[1] = public.current_clinic_id()::text
  );

-- ════════════════════════════════════════════════════════════════
-- Rollback (manual) — volta à policy permissiva da 0052:
--   drop policy if exists anamnese_staff_all on storage.objects;
--   create policy anamnese_staff_all on storage.objects
--     for all using (bucket_id='anamnese' and public.is_staff())
--     with check (bucket_id='anamnese' and public.is_staff());
-- ════════════════════════════════════════════════════════════════

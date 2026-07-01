-- ════════════════════════════════════════════════════════════════
-- agicare — migration 0064: imagem de fundo da lousa por especialidade
--
-- O gestor/admin pode PRÉ-FIXAR uma imagem de fundo (ex.: arcada dentária,
-- diagrama corporal) no template de anamnese de uma especialidade. No prontuário
-- o médico vê essa imagem como fundo da lousa e anota por cima (desenho, formas,
-- texto). A imagem em si fica no bucket privado `anamnese` (Storage, 0052);
-- aqui guardamos só o PONTEIRO (caminho no bucket).
--
--   lousa_image_path text NULL — storage_path da imagem no bucket 'anamnese'
--     (ex.: "<clinic_id>/templates/lousa-<especialidade>-<ts>.png"). NULL = sem
--     imagem de fundo (comportamento atual: lousa em branco / upload manual).
--
-- Aditiva e idempotente. DEPENDE de: 0051 (anamnese_templates), 0052 (bucket
-- 'anamnese' + policy is_staff). RLS herdada de public.anamnese_templates.
-- NÃO APLICADA automaticamente — aplicar via scripts/migrate.mjs.
-- ════════════════════════════════════════════════════════════════

alter table public.anamnese_templates
  add column if not exists lousa_image_path text;

comment on column public.anamnese_templates.lousa_image_path is
  'Caminho no bucket privado ''anamnese'' da imagem de fundo pré-fixada da lousa desta especialidade. NULL = sem imagem. O médico anota por cima no prontuário.';

-- ════════════════════════════════════════════════════════════════
-- Rollback (manual):
--   alter table public.anamnese_templates drop column if exists lousa_image_path;
-- ════════════════════════════════════════════════════════════════

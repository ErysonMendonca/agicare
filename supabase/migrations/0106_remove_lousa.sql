-- ════════════════════════════════════════════════════════════════
-- agicare — migration 0106: REMOÇÃO da feature "Lousa" da anamnese
--
-- 🔴 MIGRATION DESTRUTIVA — autorizada pelo dono (remover a lousa por completo,
--    incluindo limpeza de banco). Descarta anexos clínicos do paciente. LER
--    INTEIRA e conferir a contagem abaixo ANTES de aplicar.
--
-- A feature de canvas/desenho ("lousa") foi removida do código nesta mesma
-- branch. Esta migration desfaz o schema que só existia para ela:
--   (A) coluna public.anamnese_templates.lousa_image_path        (criada na 0064)
--   (B) tabela public.anamnese_files + índice + policy             (criada na 0052)
--   (C) policy e bucket privado 'anamnese' no Storage              (criados na 0052/0065)
--
-- Por que dropar tabela+bucket (e não só as linhas kind='lousa'):
--   public.anamnese_files nasceu EXCLUSIVA da lousa (ver cabeçalho da 0052: a
--   tabela, o índice, o bucket e a policy foram criados só para o canvas). O
--   grep no código não achou nenhum OUTRO consumidor do bucket 'anamnese' nem
--   da tabela. A coluna `kind` é nullable e o único valor documentado/gravado é
--   'lousa' — logo o conteúdo inteiro da tabela é da lousa (um delete por
--   kind='lousa' deixaria linhas de kind NULL órfãs). Dropar é mais correto que
--   filtrar. attendance_options e anamnese_templates (fora a coluna) ficam intactos.
--
-- ⚠️ CONFERIR ANTES (read-only, rode separado — NÃO faz parte desta migration):
--     select kind, count(*) from public.anamnese_files group by kind;
--   Se aparecer algum `kind` inesperado (≠ 'lousa'/NULL), PARE e reavalie: pode
--   haver anexo de outra natureza que não deveria ser descartado.
--
-- ⚠️ STORAGE (passo MANUAL, fora do SQL): os OBJETOS (PNGs) do bucket 'anamnese'
--   precisam ser apagados no Storage ANTES do delete do bucket (o Postgres não
--   remove os binários). Ex. via Supabase Studio → Storage → bucket 'anamnese'
--   → excluir todos os arquivos; ou pela API de storage. Só então rode o bloco C.
--
-- DEPENDE de: 0052 (anamnese_files + bucket), 0064 (coluna), 0065 (policy tenant).
-- NÃO APLICADA automaticamente — aplicar via scripts/migrate.mjs (porta 6543).
-- NÃO apagar os arquivos 0052/0064/0065 (histórico do runner).
-- ════════════════════════════════════════════════════════════════

-- ─── (A) coluna da imagem de fundo (0064) ────────────────────────
alter table public.anamnese_templates
  drop column if exists lousa_image_path;

-- ─── (B) tabela de anexos da lousa (0052) ────────────────────────
--   O drop table remove em cascata o índice idx_anamnese_files_clinic_patient
--   e a policy anamnese_files_clinical_all. Descarta TODAS as linhas (metadados
--   dos desenhos). Os binários no bucket são tratados no passo manual de Storage.
drop table if exists public.anamnese_files;

-- ─── (C) Storage: policy + bucket privado 'anamnese' (0052/0065) ──
--   Só remove o bucket se ele estiver VAZIO (passo manual de Storage acima).
--   delete em storage.buckets falha se ainda houver objetos → é a trava natural.
drop policy if exists anamnese_staff_all on storage.objects;
-- A 0065 endureceu a policy do bucket; derrubamos qualquer variante remanescente.
drop policy if exists anamnese_tenant_all on storage.objects;
delete from storage.buckets where id = 'anamnese';

-- ════════════════════════════════════════════════════════════════
-- ROLLBACK (manual) — recria o schema vazio (NÃO restaura dados/binários):
--   -- coluna:
--   alter table public.anamnese_templates add column if not exists lousa_image_path text;
--   -- tabela + índice + policy: reaplicar o corpo da 0052.
--   -- bucket + policy: reaplicar o insert em storage.buckets e a policy da 0052/0065.
--
-- IMPACTO: destrutivo e IRREVERSÍVEL quanto aos dados — apaga os anexos/desenhos
--   da lousa (metadados + binários) e a config de imagem de fundo por
--   especialidade. Nada mais é afetado: produtos, prontuário, templates de
--   anamnese (campos), attendance_options e demais buckets permanecem íntegros.
-- ════════════════════════════════════════════════════════════════

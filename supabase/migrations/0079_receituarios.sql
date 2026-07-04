-- ════════════════════════════════════════════════════════════════
-- agicare — migration 0079: RECEITUÁRIOS (simples e especial)
-- Reusa a tabela public.certificates (0007), que já guarda documentos
-- clínicos por `kind` (text livre). Novos valores de kind:
--   'receituario_simples' e 'receituario_especial'.
-- NOTA: `certificates.kind` é `text not null` SEM check constraint
--       (confirmado em 0007_clinico.sql, linha 86) → nenhum enum/CHECK
--       precisa ser alterado para aceitar os novos valores.
-- Falta apenas a coluna do texto livre da prescrição do receituário.
-- RLS: herdada de 0007 (admin/médico) — dado clínico sensível (LGPD).
-- Aditiva e idempotente: add column if not exists.
-- Aplicar no SQL Editor do Supabase.
-- ════════════════════════════════════════════════════════════════

alter table public.certificates
  add column if not exists prescription_text text;

comment on column public.certificates.prescription_text is
  'Texto livre da prescrição do receituário (kind = receituario_simples | receituario_especial). Nulo para atestado/alta.';

-- ════════════════════════════════════════════════════════════════
-- ROLLBACK (manual):
--   alter table public.certificates drop column if exists prescription_text;
--
-- IMPACTO: mudança puramente aditiva. Não altera dados existentes nem
-- afeta atestado/alta (a coluna fica nula para esses registros).
-- ════════════════════════════════════════════════════════════════

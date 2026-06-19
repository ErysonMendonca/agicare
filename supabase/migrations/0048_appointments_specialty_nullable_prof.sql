-- ════════════════════════════════════════════════════════════════
-- agicare — migration 0048: agendamento por ESPECIALIDADE (sem profissional)
--
-- Hoje appointments.professional_id é NOT NULL (0001): todo agendamento exige
-- um profissional definido na criação. O novo fluxo permite agendar por
-- ESPECIALIDADE (ex.: "Cardiologia") deixando a escolha/atribuição do
-- profissional para um passo posterior (na recepção/triagem ou no check-in).
--
--   1) professional_id passa a ser NULLABLE — NULL = agendamento ainda sem
--      profissional atribuído. A FK (professionals.id, on delete restrict) e o
--      índice idx_appointments_professional_start (professional_id, starts_at)
--      seguem válidos: btree indexa NULL e a FK só valida valores não-nulos.
--   2) specialty (text, NULL) guarda a especialidade pretendida quando o
--      agendamento é criado sem profissional. Quando professional_id é
--      atribuído depois, specialty pode ser preenchida a partir de
--      professionals.specialty (responsabilidade do backend — ver HANDOFF).
--
-- A atribuição do profissional ocorre DEPOIS (update de professional_id),
-- não nesta migration — aqui só relaxamos o schema p/ permitir o NULL.
--
-- NÃO mexe em RLS: appointments já tem políticas staff-based amarradas a
-- clinic_id (0001 + 0021). RLS no Postgres é por LINHA, não por coluna —
-- colunas novas/relaxadas herdam as policies, nada a ajustar.
-- Aditiva e idempotente. DEPENDE de: 0001 (appointments).
-- NÃO APLICADA automaticamente — aplicar via scripts/migrate.mjs.
-- ════════════════════════════════════════════════════════════════

-- 1) professional_id deixa de ser obrigatório (agendamento por especialidade).
alter table public.appointments
  alter column professional_id drop not null;

comment on column public.appointments.professional_id is
  'Profissional do agendamento. NULL = agendado por ESPECIALIDADE, sem profissional atribuído ainda (atribuição ocorre depois, na recepção/triagem). FK professionals(id) segue valendo p/ valores não-nulos.';

-- 2) Especialidade pretendida quando o agendamento é criado sem profissional.
alter table public.appointments
  add column if not exists specialty text;

comment on column public.appointments.specialty is
  'Especialidade do agendamento quando criado SEM profissional (professional_id NULL). Texto livre alinhado a professionals.specialty. Ao atribuir um profissional, o backend deve manter coerência entre specialty e professionals.specialty.';

-- ════════════════════════════════════════════════════════════════
-- ROLLBACK (manual):
--   alter table public.appointments drop column if exists specialty;
--   -- Reverter o NOT NULL SÓ é possível se NÃO houver linhas com
--   -- professional_id NULL (senão a alteração falha). Limpar/atribuir antes:
--   --   select count(*) from public.appointments where professional_id is null;
--   alter table public.appointments alter column professional_id set not null;
--
-- IMPACTO: relaxa uma constraint (aditivo) — não há perda de dados ao aplicar.
-- HANDOFF: backend-dev — ao criar agendamento avulso por especialidade, gravar
--   specialty e deixar professional_id NULL; ao atribuir profissional, setar
--   professional_id (e, se desejado, sincronizar specialty). Validar no app
--   que todo agendamento tenha professional_id OU specialty preenchido.
-- ════════════════════════════════════════════════════════════════

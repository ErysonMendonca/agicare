-- ════════════════════════════════════════════════════════════════
-- agicare — migration 0111: CANCELAMENTO dos DOCUMENTOS do prontuário
--
-- Todo documento clínico passa a poder ser CANCELADO de forma NÃO
-- destrutiva: nada é apagado; o registro apenas ganha o carimbo de
-- cancelamento (quando, por quem e por quê) e passa a ser exibido
-- marcado/bloqueado na Linha do Tempo — nunca filtrado para fora.
--
-- Padrão CANÔNICO de cancelamento (uniforme para todas as tabelas de
-- documento, já que a maioria não possui enum de status próprio):
--   `cancelled_at  timestamptz`             — quando foi cancelado (null = ativo)
--   `cancelled_by  uuid references profiles(id)` — quem cancelou (autor da ação)
--   `cancel_reason text`                    — motivo do cancelamento
--
-- 100% ADITIVA e IDEMPOTENTE (add column if not exists / create index if
-- not exists). NÃO toca em RLS (políticas por tabela permanecem herdadas).
-- SEM backfill. SEM limpeza de dados.
-- DEPENDE de: 0001 (medical_records, profiles), 0007 (anamneses,
--   prescriptions, certificates), 0016 (exam_orders), 0008/0017 (tabelas
--   de enfermagem), 0103 (dental_charts), prosthetic_orders + profiles.
-- NÃO APLICADA automaticamente — aplicar via scripts/migrate.mjs (porta 6543).
-- ════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────
-- Colunas de cancelamento — 12 tabelas de documento.
--   cancelled_by NULLABLE, sem ON DELETE (preserva o histórico se o
--   profile sumir). Índice PARCIAL só nas linhas canceladas (barato:
--   ajuda a filtrar/contar cancelados sem inchar o índice geral).
-- ────────────────────────────────────────────────────────────────

alter table public.certificates
  add column if not exists cancelled_at  timestamptz,
  add column if not exists cancelled_by  uuid references public.profiles (id),
  add column if not exists cancel_reason text;
create index if not exists idx_certificates_cancelled
  on public.certificates (cancelled_at) where cancelled_at is not null;

alter table public.prescriptions
  add column if not exists cancelled_at  timestamptz,
  add column if not exists cancelled_by  uuid references public.profiles (id),
  add column if not exists cancel_reason text;
create index if not exists idx_prescriptions_cancelled
  on public.prescriptions (cancelled_at) where cancelled_at is not null;

alter table public.anamneses
  add column if not exists cancelled_at  timestamptz,
  add column if not exists cancelled_by  uuid references public.profiles (id),
  add column if not exists cancel_reason text;
create index if not exists idx_anamneses_cancelled
  on public.anamneses (cancelled_at) where cancelled_at is not null;

alter table public.medical_records
  add column if not exists cancelled_at  timestamptz,
  add column if not exists cancelled_by  uuid references public.profiles (id),
  add column if not exists cancel_reason text;
create index if not exists idx_medical_records_cancelled
  on public.medical_records (cancelled_at) where cancelled_at is not null;

alter table public.exam_orders
  add column if not exists cancelled_at  timestamptz,
  add column if not exists cancelled_by  uuid references public.profiles (id),
  add column if not exists cancel_reason text;
create index if not exists idx_exam_orders_cancelled
  on public.exam_orders (cancelled_at) where cancelled_at is not null;

alter table public.nursing_evolutions
  add column if not exists cancelled_at  timestamptz,
  add column if not exists cancelled_by  uuid references public.profiles (id),
  add column if not exists cancel_reason text;
create index if not exists idx_nursing_evolutions_cancelled
  on public.nursing_evolutions (cancelled_at) where cancelled_at is not null;

alter table public.nursing_notes
  add column if not exists cancelled_at  timestamptz,
  add column if not exists cancelled_by  uuid references public.profiles (id),
  add column if not exists cancel_reason text;
create index if not exists idx_nursing_notes_cancelled
  on public.nursing_notes (cancelled_at) where cancelled_at is not null;

alter table public.nursing_procedures
  add column if not exists cancelled_at  timestamptz,
  add column if not exists cancelled_by  uuid references public.profiles (id),
  add column if not exists cancel_reason text;
create index if not exists idx_nursing_procedures_cancelled
  on public.nursing_procedures (cancelled_at) where cancelled_at is not null;

alter table public.care_checks
  add column if not exists cancelled_at  timestamptz,
  add column if not exists cancelled_by  uuid references public.profiles (id),
  add column if not exists cancel_reason text;
create index if not exists idx_care_checks_cancelled
  on public.care_checks (cancelled_at) where cancelled_at is not null;

alter table public.sae_records
  add column if not exists cancelled_at  timestamptz,
  add column if not exists cancelled_by  uuid references public.profiles (id),
  add column if not exists cancel_reason text;
create index if not exists idx_sae_records_cancelled
  on public.sae_records (cancelled_at) where cancelled_at is not null;

alter table public.prosthetic_orders
  add column if not exists cancelled_at  timestamptz,
  add column if not exists cancelled_by  uuid references public.profiles (id),
  add column if not exists cancel_reason text;
create index if not exists idx_prosthetic_orders_cancelled
  on public.prosthetic_orders (cancelled_at) where cancelled_at is not null;

alter table public.dental_charts
  add column if not exists cancelled_at  timestamptz,
  add column if not exists cancelled_by  uuid references public.profiles (id),
  add column if not exists cancel_reason text;
create index if not exists idx_dental_charts_cancelled
  on public.dental_charts (cancelled_at) where cancelled_at is not null;

-- ════════════════════════════════════════════════════════════════
-- ROLLBACK (manual): dropar as 3 colunas + índice parcial em cada tabela.
--   (dropar a coluna já remove FK; o índice parcial some junto, mas é
--    listado por clareza.)
--   alter table public.certificates       drop column if exists cancelled_at,  drop column if exists cancelled_by, drop column if exists cancel_reason;
--   alter table public.prescriptions      drop column if exists cancelled_at,  drop column if exists cancelled_by, drop column if exists cancel_reason;
--   alter table public.anamneses          drop column if exists cancelled_at,  drop column if exists cancelled_by, drop column if exists cancel_reason;
--   alter table public.medical_records    drop column if exists cancelled_at,  drop column if exists cancelled_by, drop column if exists cancel_reason;
--   alter table public.exam_orders        drop column if exists cancelled_at,  drop column if exists cancelled_by, drop column if exists cancel_reason;
--   alter table public.nursing_evolutions drop column if exists cancelled_at,  drop column if exists cancelled_by, drop column if exists cancel_reason;
--   alter table public.nursing_notes      drop column if exists cancelled_at,  drop column if exists cancelled_by, drop column if exists cancel_reason;
--   alter table public.nursing_procedures drop column if exists cancelled_at,  drop column if exists cancelled_by, drop column if exists cancel_reason;
--   alter table public.care_checks        drop column if exists cancelled_at,  drop column if exists cancelled_by, drop column if exists cancel_reason;
--   alter table public.sae_records        drop column if exists cancelled_at,  drop column if exists cancelled_by, drop column if exists cancel_reason;
--   alter table public.prosthetic_orders  drop column if exists cancelled_at,  drop column if exists cancelled_by, drop column if exists cancel_reason;
--   alter table public.dental_charts      drop column if exists cancelled_at,  drop column if exists cancelled_by, drop column if exists cancel_reason;
--   -- (opcional) drop index if exists idx_<t>_cancelled;  -- some junto com a coluna
--
-- IMPACTO: 100% aditivo. Nenhuma coluna existente muda; nenhum dado é
--   migrado. Documentos existentes ficam com cancelled_at null = ATIVOS.
--   RLS inalterada. Índices apenas parciais (só linhas canceladas).
-- DEPENDE DE: profiles (0001), tabelas de documento (0001/0007/0016/0008/
--   0017/0103 + prosthetic_orders).
-- HANDOFF: backend-dev — criar a Server Action de cancelamento que grava
--   cancelled_at=now(), cancelled_by=getCurrentUser().userId, cancel_reason
--   (motivo do modal). frontend-dev — exibir o documento cancelado marcado
--   (badge "Cancelado" + motivo) e bloquear ações de edição/impressão
--   conforme regra; NÃO remover da lista.
-- ════════════════════════════════════════════════════════════════

-- ════════════════════════════════════════════════════════════════
-- agicare — migration 0053: fluxo de triagem (status + sinais/risco + ordem do ciclo)
--
-- Acrescenta a etapa de TRIAGEM ao ciclo de atendimento:
--   1) novo valor 'triagem' no enum public.queue_status (0002; += 'desistencia' na 0003);
--   2) tabela public.triage_records — sinais vitais aferidos na triagem + classificação
--      de risco (escala de cor tipo Manchester);
--   3) coluna public.clinic_settings.attendance_flow (jsonb) — ordem CONFIGURÁVEL das
--      etapas do ciclo por clínica.
--
-- Aditiva e idempotente (IF NOT EXISTS / add value if not exists / drop policy if exists).
-- DEPENDE de: 0002 (queue_status, queue_entries), 0001 (patients/profiles),
--             0010 (clinic_settings), 0020 (clinic_id), 0021 (RLS multitenant + is_staff/current_clinic_id).
-- NÃO APLICADA automaticamente — aplicar via scripts/migrate.mjs (porta 6543).
--
-- ⚠️ NUMERAÇÃO: 0050/0051/0052 já existem no banco (PRs abertos); esta é 0053
--    para não colidir.
-- ════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────
-- 1) Enum queue_status += 'triagem'
--
-- ⚠️ ALTER TYPE ... ADD VALUE NÃO é transacional: não pode rodar dentro de um
--    bloco de transação (erro 25001 "ALTER TYPE ... ADD cannot run inside a
--    transaction block"). O runner (scripts/migrate.mjs) executa cada statement
--    isolado em autocommit, então este comando funciona. NÃO envolver em do$$/BEGIN.
--    'if not exists' torna o re-run seguro (idempotente).
-- ─────────────────────────────────────────────────────────────────
alter type public.queue_status add value if not exists 'triagem';

-- ─────────────────────────────────────────────────────────────────
-- 2) Tabela triage_records — sinais vitais da triagem + classificação de risco.
--    Espelha as colunas clínicas de vital_signs (0004), porém amarrada à
--    ENTRADA NA FILA (queue_entry_id) e com risk_level (cor Manchester).
--    Multitenant: clinic_id NOT NULL (cascade na clínica).
-- ─────────────────────────────────────────────────────────────────
create table if not exists public.triage_records (
  id             uuid primary key default gen_random_uuid(),
  clinic_id      uuid not null references public.clinics (id) on delete cascade,
  queue_entry_id uuid references public.queue_entries (id) on delete set null,
  patient_id     uuid references public.patients (id) on delete set null,
  systolic       integer,        -- PA sistólica (mmHg)
  diastolic      integer,        -- PA diastólica (mmHg)
  heart_rate     integer,        -- FC (bpm)
  resp_rate      integer,        -- FR (irpm)
  temperature    numeric(4,1),   -- Tax (°C)
  weight         numeric(5,2),   -- Peso (kg)
  height         numeric(4,2),   -- Altura (m)
  spo2           integer,        -- SpO2 (%)
  glucose        integer,        -- HGT (mg/dL)
  notes          text,
  risk_level     text check (risk_level in ('azul','verde','amarelo','laranja','vermelho')),
  recorded_by    uuid references public.profiles (id),
  created_at     timestamptz not null default now()
);

comment on table public.triage_records is
  'Sinais vitais aferidos na triagem + classificação de risco (escala de cor tipo Manchester). Vinculado à entrada na fila (queue_entry_id).';
comment on column public.triage_records.risk_level is
  'Classificação de risco Manchester: azul<verde<amarelo<laranja<vermelho (prioridade crescente).';

-- Índice para a query quente: triagens da clínica por entrada na fila.
create index if not exists idx_triage_records_clinic_queue
  on public.triage_records (clinic_id, queue_entry_id);

-- RLS: triagem é feita por QUALQUER staff (decisão do dono) — padrão *_staff_all
-- multitenant (0021): is_staff() AND clinic_id = current_clinic_id() no using E no
-- with check (impede ler/gravar fora da clínica ativa; fail-closed se claim ausente).
alter table public.triage_records enable row level security;

drop policy if exists triage_records_staff_all on public.triage_records;
create policy triage_records_staff_all on public.triage_records
  for all
  using      (public.is_staff() and clinic_id = public.current_clinic_id())
  with check (public.is_staff() and clinic_id = public.current_clinic_id());

-- ─────────────────────────────────────────────────────────────────
-- 3) clinic_settings.attendance_flow — ordem configurável das etapas do ciclo.
--    Formato:  { "stages": string[] }
--      - chaves válidas: 'recepcao' | 'triagem' | 'atendimento'
--      - a ORDEM do array = ordem do ciclo de atendimento;
--      - AUSÊNCIA de 'triagem' = clínica SEM etapa de triagem.
--    Default: recepção → triagem → atendimento.
--    RLS: herda as policies de clinic_settings (0021 read_staff/write_admin) —
--         RLS no Postgres é por LINHA, não por coluna; nada a ajustar.
-- ─────────────────────────────────────────────────────────────────
alter table public.clinic_settings
  add column if not exists attendance_flow jsonb not null
  default '{"stages":["recepcao","triagem","atendimento"]}'::jsonb;

comment on column public.clinic_settings.attendance_flow is
  'Ordem configurável das etapas do ciclo de atendimento. Formato { stages: string[] } com chaves em [recepcao,triagem,atendimento]. Ordem do array = ordem do ciclo; ausência de "triagem" = clínica sem triagem.';

-- ════════════════════════════════════════════════════════════════
-- ROLLBACK (manual):
--   -- 3) coluna attendance_flow
--   alter table public.clinic_settings drop column if exists attendance_flow;
--   -- 2) tabela triage_records (drop policy + index implícitos no drop table)
--   drop table if exists public.triage_records;
--   -- 1) valor de enum 'triagem': NÃO há DROP VALUE no Postgres. Para remover
--   --    é preciso recriar o enum sem o valor (criar tipo novo, migrar colunas,
--   --    dropar o antigo) — só fazer se nenhuma linha usar 'triagem'. Em geral,
--   --    deixar o valor órfão é inócuo.
--
-- IMPACTO: reverter remove a etapa de triagem do ciclo. Dados de triage_records
--   são perdidos no drop table; o valor de enum permanece (ver acima).
-- ════════════════════════════════════════════════════════════════

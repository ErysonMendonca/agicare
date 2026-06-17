-- ════════════════════════════════════════════════════════════════
-- agicare — migration 0037: Dados de Atendimento (persistência da Fila)
--
-- Fecha o gap do escopo 4.2: o modal "Dados de Atendimento" da Fila tinha
-- form completo mas o botão Salvar NÃO persistia (só toast + print). Esta
-- tabela guarda o REGISTRO ADMINISTRATIVO do atendimento (cabeçalho, convênio
-- e responsável) emitido na recepção — NÃO é dado clínico (medical_records);
-- é o "boletim/ficha de atendimento" que alimenta a impressão e o histórico.
--
-- MULTITENANT: segue o padrão das 0035/0036 — clinic_id NOT NULL + trigger de
-- default (set_clinic_id_default → current_clinic_id) como rede de segurança +
-- RLS amarrada ao tenant (is_staff() and clinic_id = current_clinic_id()).
--
-- DEPENDE de: 0020 (clinics, current_clinic_id(), is_staff(),
--             set_clinic_id_default()), 0001 (patients, professionals),
--             0002 (queue_entries). Idempotente. APLICAR MANUALMENTE
--             (runner scripts/migrate.mjs). NÃO É dado clínico sensível, mas
--             pode conter PII (responsável/documento) → acesso só a staff.
-- ════════════════════════════════════════════════════════════════

-- ════════════════════════════════════════════════════════════════
-- 1) attendance_records — ficha administrativa de atendimento
-- ════════════════════════════════════════════════════════════════
create table if not exists public.attendance_records (
  id                uuid primary key default gen_random_uuid(),
  clinic_id         uuid not null references public.clinics (id) on delete cascade,

  -- Vínculos (todos opcionais: o registro sobrevive à remoção da origem).
  queue_entry_id    uuid references public.queue_entries (id) on delete set null,
  patient_id        uuid references public.patients (id) on delete set null,
  professional_id   uuid references public.professionals (id) on delete set null,
  patient_name      text,                         -- desnormalizado p/ impressão

  -- Cabeçalho do atendimento (opções fixas do form → texto).
  medico            text,                         -- rótulo do médico selecionado
  especialidade     text,
  encaminhamento    text,
  carater           text check (carater in ('urgencia','eletivo')),
  procedencia       text,
  centro_custo      text,
  origem            text,
  data_entrada      date,
  privado_liberdade boolean not null default false,
  gestante          boolean not null default false,

  -- Dados do convênio.
  convenio          text,
  plano             text,
  carteira          text,
  validade          date,
  validador         text,

  -- Responsável (toggle "o mesmo" copia o paciente, senão preenche manual).
  resp_o_mesmo      boolean not null default false,
  resp_nome         text,
  resp_documento    text,
  resp_parentesco   text,

  observacoes       text,
  created_by        uuid references auth.users (id) on delete set null,
  created_at        timestamptz not null default now()
);
create index if not exists idx_attendance_records_clinic
  on public.attendance_records (clinic_id);
create index if not exists idx_attendance_records_patient
  on public.attendance_records (patient_id);
create index if not exists idx_attendance_records_queue
  on public.attendance_records (queue_entry_id);
create index if not exists idx_attendance_records_created
  on public.attendance_records (created_at);

-- ════════════════════════════════════════════════════════════════
-- 2) Rede de segurança: default de clinic_id (BEFORE INSERT) — 0023.
--    A app seta clinic_id explicitamente; o trigger é fallback.
-- ════════════════════════════════════════════════════════════════
drop trigger if exists trg_set_clinic_id_attendance_records
  on public.attendance_records;
create trigger trg_set_clinic_id_attendance_records
  before insert on public.attendance_records
  for each row execute function public.set_clinic_id_default();

-- ════════════════════════════════════════════════════════════════
-- 3) RLS — staff gerencia tudo NA SUA clínica (padrão 0021/0035).
-- ════════════════════════════════════════════════════════════════
alter table public.attendance_records enable row level security;

drop policy if exists attendance_records_staff_all on public.attendance_records;
create policy attendance_records_staff_all
  on public.attendance_records for all
  using (public.is_staff() and clinic_id = public.current_clinic_id())
  with check (public.is_staff() and clinic_id = public.current_clinic_id());

-- ════════════════════════════════════════════════════════════════
-- ROLLBACK (manual):
--   drop trigger if exists trg_set_clinic_id_attendance_records on public.attendance_records;
--   drop policy if exists attendance_records_staff_all on public.attendance_records;
--   drop table if exists public.attendance_records;
-- ════════════════════════════════════════════════════════════════

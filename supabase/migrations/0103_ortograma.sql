-- ════════════════════════════════════════════════════════════════
-- agicare — migration 0103: Ortograma (odontograma) no prontuário
--
-- Tela nova onde o dentista marca legendas sobre os 32 dentes (notação
-- FDI) de um atendimento. Um dente pode ter VÁRIAS marcações simultâneas
-- (ex.: tratamento de canal + coroa no mesmo dente).
--
-- Modelo:
--   dental_charts       — 1 ortograma por atendimento/registro do paciente.
--   dental_chart_marks  — N marcações por dente dentro de um ortograma
--                          (1 linha por combinação dente+marcação).
--
-- IMPORTANTE: não existe marcação 'higido'. Hígido = AUSÊNCIA de qualquer
-- marcação naquele dente — é inferido no client/relatório, nunca gravado.
--
-- Dado clínico sensível (LGPD): RLS restrita a admin/medico da clínica
-- ativa, seguindo o padrão *_clinical_all consolidado na 0021 (mesmo
-- grupo de medical_records/anamneses/prescriptions/prosthetic_orders).
-- dental_chart_marks NÃO tem clinic_id próprio: herda a clínica via join com
-- dental_charts. Isto DIVERGE do padrão do repo — as demais tabelas-filhas
-- (prosthetic_files, prescription_items, fluid_balance_entries) ganharam
-- clinic_id na 0020/0023. A escolha é deliberada: o mark só existe dentro de um
-- chart, e sem a coluna não há como as duas clínicas divergirem. Se um dia uma
-- migration iterar a lista de tabelas com clinic_id, lembre que esta ficou fora.
--
-- Depende de 0001 (patients, professionals), 0020 (clinic_id/multitenant),
-- 0037 (queue_entries) e 0044 (helper public.set_updated_at()).
-- Aditiva e idempotente.
-- ════════════════════════════════════════════════════════════════

-- ── 1) dental_charts — cabeçalho do ortograma ─────────────────────
create table if not exists public.dental_charts (
  id               uuid primary key default gen_random_uuid(),
  clinic_id        uuid not null references public.clinics (id) on delete cascade,
  patient_id       uuid not null references public.patients (id) on delete cascade,
  professional_id  uuid references public.professionals (id) on delete set null,
  -- set null (NUNCA cascade): o ortograma é registro clínico permanente do
  -- paciente; não pode ser apagado só porque a entrada da fila foi removida.
  queue_entry_id   uuid references public.queue_entries (id) on delete set null,
  notes            text,        -- observação livre do dentista (não confundir
                                 -- com as observações auto-geradas por marcação,
                                 -- que são DERIVADAS na UI/relatório, não gravadas aqui)
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists idx_dental_charts_patient
  on public.dental_charts (clinic_id, patient_id, created_at desc);

-- Reaproveita o helper genérico de touch criado na 0044.
drop trigger if exists dental_charts_set_updated_at on public.dental_charts;
create trigger dental_charts_set_updated_at
  before update on public.dental_charts
  for each row
  execute function public.set_updated_at();

-- ── 2) dental_chart_marks — marcações por dente (FDI permanente) ─
create table if not exists public.dental_chart_marks (
  id         uuid primary key default gen_random_uuid(),
  chart_id   uuid not null references public.dental_charts (id) on delete cascade,
  tooth      smallint not null,
  marking    text not null,
  note       text,        -- observação livre por dente/marcação (opcional)
  created_at timestamptz not null default now(),

  -- FDI permanente: quadrantes 1–4, dentes 1–8 (11-18, 21-28, 31-38, 41-48).
  constraint dental_chart_marks_tooth_fdi_check check (
    tooth in (11,12,13,14,15,16,17,18,
              21,22,23,24,25,26,27,28,
              31,32,33,34,35,36,37,38,
              41,42,43,44,45,46,47,48)
  ),

  -- Domínio fechado de marcações. 'higido' NÃO existe aqui de propósito:
  -- hígido = ausência de qualquer marcação para o dente, nunca uma linha.
  -- 'ausente' (dente que não existe: extraído há tempos, agenesia) É uma
  -- marcação, e é EXCLUSIVA: a aplicação garante que um dente ausente não
  -- carregue cárie/coroa/etc. Sem ela, dente ausente ficaria indistinguível
  -- de dente hígido — erro de leitura clínica.
  constraint dental_chart_marks_marking_check check (
    marking in (
      'ausente','extracao_indicada','restauracao','carie','tratamento_canal',
      'coroa','protese_fixa','implante','protese_removivel','selante','outros'
    )
  ),

  -- Mesma marcação não se repete no mesmo dente do mesmo ortograma.
  constraint dental_chart_marks_chart_tooth_marking_key
    unique (chart_id, tooth, marking)
);

create index if not exists idx_dental_chart_marks_chart
  on public.dental_chart_marks (chart_id);

-- ── 3) RLS — dado clínico: leitura/escrita só admin+medico da clínica ──
alter table public.dental_charts      enable row level security;
alter table public.dental_chart_marks enable row level security;

-- Padrão *_clinical_all copiado da 0021 (mesmo grupo de medical_records,
-- anamneses, prescriptions, prosthetic_orders): current_role() in
-- ('admin','medico') AND clinic_id = current_clinic_id().
drop policy if exists dental_charts_clinical_all on public.dental_charts;
create policy dental_charts_clinical_all on public.dental_charts
  for all
  using (
    public.current_role() in ('admin','medico')
    and clinic_id = public.current_clinic_id()
  )
  with check (
    public.current_role() in ('admin','medico')
    and clinic_id = public.current_clinic_id()
  );

-- Sem clinic_id próprio (ver nota do cabeçalho): a clínica vem do chart. O
-- EXISTS abaixo é avaliado COM a RLS de dental_charts ativa, então um usuário
-- de outra clínica não enxerga o chart e, por consequência, nem as marcas.
drop policy if exists dental_chart_marks_clinical_all on public.dental_chart_marks;
create policy dental_chart_marks_clinical_all on public.dental_chart_marks
  for all
  using (
    public.current_role() in ('admin','medico')
    and exists (
      select 1 from public.dental_charts dc
       where dc.id = dental_chart_marks.chart_id
         and dc.clinic_id = public.current_clinic_id()
    )
  )
  with check (
    public.current_role() in ('admin','medico')
    and exists (
      select 1 from public.dental_charts dc
       where dc.id = dental_chart_marks.chart_id
         and dc.clinic_id = public.current_clinic_id()
    )
  );

-- FORCE RLS — mesma defesa em profundidade aplicada às tabelas clínicas
-- na 0021 (nem o dono da tabela burla; service-role continua ignorando
-- via bypass, não por ownership).
alter table public.dental_charts      force row level security;
alter table public.dental_chart_marks force row level security;

-- ════════════════════════════════════════════════════════════════
-- ROLLBACK (manual):
--   alter table public.dental_charts      no force row level security;
--   alter table public.dental_chart_marks no force row level security;
--   drop policy if exists dental_chart_marks_clinical_all on public.dental_chart_marks;
--   drop policy if exists dental_charts_clinical_all       on public.dental_charts;
--   drop trigger if exists dental_charts_set_updated_at on public.dental_charts;
--   drop table if exists public.dental_chart_marks;
--   drop table if exists public.dental_charts;
--   -- public.set_updated_at() NÃO é removida (reutilizada por patients, 0044).
--
-- IMPACTO: reverter apaga TODOS os ortogramas já registrados (cascade).
-- Só fazer com confirmação explícita — dado clínico, não recriável.
-- Nenhuma outra tabela é afetada (queue_entry_id é set null, nunca cascade
-- para dental_charts; apagar uma entrada de fila não perde o ortograma).
-- ════════════════════════════════════════════════════════════════

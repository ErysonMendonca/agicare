-- ════════════════════════════════════════════════════════════════
-- agicare — migration 0005: Agenda (escala de horários + bloqueios)
-- Fase 5 — Módulo Agenda. Reaproveita public.appointments (0001).
-- Depende de 0001 (helper public.is_staff(), professionals).
-- RLS: staff (admin/medico/recepcao) gerencia. Idempotente.
-- ════════════════════════════════════════════════════════════════

-- ── Escala de horários (configuração de grade por profissional) ──
create table if not exists public.schedules (
  id              uuid primary key default gen_random_uuid(),
  code            text unique not null,             -- código auto (ex.: ESC-0001)
  description     text,
  professional_id uuid references public.professionals (id) on delete set null,
  specialty       text,
  service_type    text,                             -- tipo de atendimento
  slot_minutes    int  not null default 30,         -- tempo de atendimento (min)
  overbook_limit  int  not null default 0,          -- limite de encaixe
  weekdays        int[] not null default '{}',      -- dias: 0=Dom .. 6=Sáb
  start_time      time not null default '08:00',    -- horário inicial
  end_time        time not null default '18:00',    -- horário final
  active          boolean not null default true,
  created_at      timestamptz not null default now()
);
create index if not exists idx_schedules_professional
  on public.schedules (professional_id);

-- ── Bloqueios de horário (datas/faixas indisponíveis) ────────────
create table if not exists public.schedule_blocks (
  id              uuid primary key default gen_random_uuid(),
  schedule_id     uuid references public.schedules (id) on delete cascade,
  professional_id uuid references public.professionals (id) on delete set null,
  block_date      date not null,
  start_time      time not null,
  end_time        time,
  reason          text,
  created_at      timestamptz not null default now()
);
create index if not exists idx_schedule_blocks_lookup
  on public.schedule_blocks (professional_id, block_date);

-- ── Coluna extra em appointments p/ rastrear a escala usada ──────
alter table public.appointments
  add column if not exists schedule_id uuid references public.schedules (id) on delete set null;

-- ════════════════════════════════════════════════════════════════
-- RLS — staff gerencia tudo (mesmo padrão da 0002).
-- ════════════════════════════════════════════════════════════════
alter table public.schedules       enable row level security;
alter table public.schedule_blocks enable row level security;

do $$
declare t text;
begin
  foreach t in array array['schedules','schedule_blocks'] loop
    execute format('drop policy if exists %I_staff_all on public.%I;', t, t);
    execute format(
      'create policy %I_staff_all on public.%I for all using (public.is_staff()) with check (public.is_staff());',
      t, t
    );
  end loop;
end $$;

-- ════════════════════════════════════════════════════════════════
-- ROLLBACK (manual):
--   alter table public.appointments drop column if exists schedule_id;
--   drop table public.schedule_blocks, public.schedules;
-- ════════════════════════════════════════════════════════════════

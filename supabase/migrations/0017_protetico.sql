-- ════════════════════════════════════════════════════════════════
-- agicare — migration 0017: Fluxo Protético no prontuário (5.5)
-- Pedido de trabalho protético (dentes, tipo, material/cor, prazo) +
-- anexos (STL/Scan, fotos, radiografias, guia de mordida) em Storage.
-- Dado clínico sensível (LGPD): RLS admin/medico.
-- Depende de 0001. Cria o bucket de Storage 'protetico' (privado).
-- ════════════════════════════════════════════════════════════════

create table if not exists public.prosthetic_orders (
  id               uuid primary key default gen_random_uuid(),
  patient_id       uuid not null references public.patients (id) on delete cascade,
  professional_id  uuid references public.professionals (id) on delete set null,
  teeth            text,                          -- ex.: '11, 12, 21'
  work_type        text,                          -- Coroa | Faceta | Ponte | Protocolo | Inlay/Onlay | Provisório
  urgent           boolean not null default false,
  due_date         date,                          -- prazo (urgente = 5 dias, padrão 10)
  material         text,
  color            text,                          -- escala de cor (ex.: A2, B1)
  clinical_notes   text,                          -- linha de término, oclusão, observações
  status           text not null default 'aberto',
  created_at       timestamptz not null default now()
);
create index if not exists idx_prosthetic_patient on public.prosthetic_orders (patient_id, created_at desc);

create table if not exists public.prosthetic_files (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid not null references public.prosthetic_orders (id) on delete cascade,
  file_name     text not null,
  storage_path  text not null,                    -- caminho dentro do bucket 'protetico'
  kind          text not null default 'scan',     -- 'scan' (STL) | 'foto' | 'radiografia' | 'mordida'
  size_bytes    bigint,
  created_at    timestamptz not null default now()
);
create index if not exists idx_prosthetic_files_order on public.prosthetic_files (order_id);

alter table public.prosthetic_orders enable row level security;
alter table public.prosthetic_files  enable row level security;
do $$
declare t text;
begin
  foreach t in array array['prosthetic_orders','prosthetic_files'] loop
    execute format('drop policy if exists %I_clinical_all on public.%I;', t, t);
    execute format(
      'create policy %I_clinical_all on public.%I for all using (public.current_role() in (''admin'',''medico'')) with check (public.current_role() in (''admin'',''medico''));',
      t, t
    );
  end loop;
end $$;

-- ── Storage: bucket privado 'protetico' + policy de staff ────────
insert into storage.buckets (id, name, public)
values ('protetico', 'protetico', false)
on conflict (id) do nothing;

drop policy if exists protetico_staff_all on storage.objects;
create policy protetico_staff_all on storage.objects
  for all using (bucket_id = 'protetico' and public.is_staff())
  with check (bucket_id = 'protetico' and public.is_staff());

-- ROLLBACK (manual):
--   drop policy if exists protetico_staff_all on storage.objects;
--   delete from storage.buckets where id = 'protetico';
--   drop table if exists public.prosthetic_files, public.prosthetic_orders;

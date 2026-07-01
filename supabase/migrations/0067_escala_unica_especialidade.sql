-- ════════════════════════════════════════════════════════════════
-- agicare — migration 0067: escala única por especialidade (backstop no banco)
--
-- Regra: numa clínica, não pode haver DUAS escalas ATIVAS da MESMA especialidade
-- com vigência (start_date..end_date) sobreposta. A action já avisa/bloqueia no
-- app (createSchedule/updateSchedule), mas isso é check-then-insert (não atômico)
-- → duas criações simultâneas escapariam. Esta constraint de EXCLUSÃO é o backstop
-- atômico no banco.
--
-- Só participam da restrição as linhas ATIVAS com especialidade e período
-- completos (escalas legadas sem vigência ficam de fora — coerente com o app).
-- Requer btree_gist (operador `=` em gist para uuid/text).
--
-- GUARDA: se já existirem sobreposições ativas no banco, a constraint NÃO é
-- aplicada (apenas emite NOTICE) — para a migration não falhar. Resolva os
-- conflitos e reaplique (a migration é idempotente). Idempotente / não aplicada
-- automaticamente.
-- ════════════════════════════════════════════════════════════════

create extension if not exists btree_gist;

do $$
begin
  if exists (
    select 1 from pg_constraint where conname = 'schedules_no_overlap'
  ) then
    return; -- já aplicada
  end if;

  if exists (
    select 1
    from public.schedules a
    join public.schedules b
      on a.clinic_id = b.clinic_id
     and a.specialty = b.specialty
     and a.id <> b.id
    where a.active and b.active
      and a.specialty is not null and b.specialty is not null
      and a.start_date is not null and a.end_date is not null
      and b.start_date is not null and b.end_date is not null
      and daterange(a.start_date, a.end_date, '[]')
       && daterange(b.start_date, b.end_date, '[]')
  ) then
    raise notice 'schedules: já existem escalas ativas sobrepostas na mesma especialidade; constraint schedules_no_overlap NÃO aplicada. Ajuste os conflitos e reaplique a 0067.';
  else
    alter table public.schedules
      add constraint schedules_no_overlap
      exclude using gist (
        clinic_id with =,
        specialty with =,
        daterange(start_date, end_date, '[]') with &&
      )
      where (
        active
        and specialty is not null
        and start_date is not null
        and end_date is not null
      );
  end if;
end $$;

-- ════════════════════════════════════════════════════════════════
-- Rollback (manual):
--   alter table public.schedules drop constraint if exists schedules_no_overlap;
-- ════════════════════════════════════════════════════════════════

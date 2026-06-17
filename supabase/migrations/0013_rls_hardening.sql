-- ════════════════════════════════════════════════════════════════
-- agicare — migration 0013: endurecimento de RLS (defesa em profundidade)
-- Alinha a RLS às regras de negócio "catálogo/configuração = só gestor"
-- e ao que as Server Actions já passaram a exigir (isGestor) em 15/06.
--
-- Escopo CONSERVADOR (não quebra fluxos operacionais):
--   • procedures      → LEITURA: staff (agenda/faturamento usam) | ESCRITA: só admin
--   • clinic_settings → LEITURA: staff | ESCRITA: só admin (dados fiscais)
--
-- NÃO altera SELECT de billable_events/tiss_*/billing_items: a recepção
-- precisa das CONTAGENS operacionais. O vazamento de VALORES financeiros
-- foi fechado na camada de aplicação (gate server-side em Relatórios/
-- Faturamento). Se o negócio exigir esconder valores também no banco,
-- isso vira um item separado (ex.: view agregada só-admin).
-- Idempotente. RLS já habilitada nessas tabelas em 0002/0010.
-- ════════════════════════════════════════════════════════════════

-- ── procedures: leitura staff, escrita admin ────────────────────
drop policy if exists procedures_staff_all  on public.procedures;
drop policy if exists procedures_read_staff on public.procedures;
drop policy if exists procedures_write_admin on public.procedures;

create policy procedures_read_staff on public.procedures
  for select using (public.is_staff());

create policy procedures_write_admin on public.procedures
  for all using (public.current_role() = 'admin')
  with check (public.current_role() = 'admin');

-- ── clinic_settings: leitura staff, escrita admin ───────────────
drop policy if exists clinic_settings_staff_all   on public.clinic_settings;
drop policy if exists clinic_settings_read_staff  on public.clinic_settings;
drop policy if exists clinic_settings_write_admin on public.clinic_settings;

create policy clinic_settings_read_staff on public.clinic_settings
  for select using (public.is_staff());

create policy clinic_settings_write_admin on public.clinic_settings
  for all using (public.current_role() = 'admin')
  with check (public.current_role() = 'admin');

-- ════════════════════════════════════════════════════════════════
-- ROLLBACK (manual) — volta ao comportamento staff-all anterior:
--   drop policy if exists procedures_read_staff       on public.procedures;
--   drop policy if exists procedures_write_admin      on public.procedures;
--   create policy procedures_staff_all on public.procedures
--     for all using (public.is_staff()) with check (public.is_staff());
--   drop policy if exists clinic_settings_read_staff  on public.clinic_settings;
--   drop policy if exists clinic_settings_write_admin on public.clinic_settings;
--   create policy clinic_settings_staff_all on public.clinic_settings
--     for all using (public.is_staff()) with check (public.is_staff());
-- ════════════════════════════════════════════════════════════════

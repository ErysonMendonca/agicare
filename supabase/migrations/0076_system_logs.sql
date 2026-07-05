-- ════════════════════════════════════════════════════════════════
-- agicare — migration 0076: trilha de auditoria GENÉRICA de ações ("quem fez o quê")
--
-- Objetivo: registrar de forma padronizada as ações de usuário em todos os
-- módulos (create/update/delete/login/logout/export/print/other), com uma
-- frase legível em PT-BR, para o módulo administrativo "Logs".
--
-- ⚠️ Diferente de access_logs (0014), que é a trilha LGPD focada em ACESSO A
--    PRONTUÁRIO. Esta é uma trilha GERAL de operação do sistema. NÃO reutiliza
--    access_logs — tabela nova.
--
-- ⚠️ VISÃO GLOBAL (decisão do dono): o admin enxerga eventos de TODAS as
--    clínicas (leitura cross-tenant intencional). clinic_id é NULLABLE porque
--    login/logout podem ocorrer antes de haver clínica ativa no contexto.
--
-- Aditiva e idempotente (create table if not exists / drop policy if exists /
-- create index if not exists / on conflict no seed).
-- DEPENDE de: 0001 (profiles), 0019 (role_permissions), 0020/0021 (clinics +
--             helpers current_role()/is_staff()/current_clinic_id()).
-- NÃO APLICADA automaticamente — aplicar via scripts/migrate.mjs (porta 6543).
-- ════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────
-- 1) Tabela public.system_logs — evento de auditoria genérico.
--    Campos de ator DESNORMALIZADOS (actor_name/actor_role) para o log
--    sobreviver à exclusão do profile (mesma estratégia de access_logs).
--    clinic_id NULLABLE + on delete set null: não perder o histórico se a
--    clínica for removida, e permitir eventos sem clínica (auth).
-- ─────────────────────────────────────────────────────────────────
create table if not exists public.system_logs (
  id             uuid primary key default gen_random_uuid(),
  clinic_id      uuid references public.clinics (id)  on delete set null, -- NULLABLE (login/logout pré-clínica)
  actor_user_id  uuid references public.profiles (id) on delete set null,
  actor_name     text,                              -- desnormalizado (sobrevive à exclusão do profile)
  actor_role     text,                              -- desnormalizado (texto livre: admin/medico/recepcao/paciente)
  action         text not null,                     -- 'create'|'update'|'delete'|'login'|'logout'|'export'|'print'|'other'
  module         text not null,                     -- 'pacientes'|'estoque'|'agenda'|'fila'|'profissionais'|'configuracoes'|'permissoes'|'auth'...
  summary        text not null,                     -- frase legível PT-BR: "Cadastrou o paciente João Pedro"
  entity         text,                              -- recurso/tabela alvo, ex.: 'patient' (nullable)
  entity_id      text,                              -- id do recurso alvo (nullable)
  metadata       jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now()
);

comment on table public.system_logs is
  'Trilha de auditoria GENÉRICA de ações de usuário ("quem fez o quê"), incluindo login/logout. Visão GLOBAL para admin (cross-tenant, decisão do dono). Distinta de access_logs (LGPD/prontuário).';
comment on column public.system_logs.clinic_id is
  'Clínica em que a ação ocorreu. NULLABLE: eventos de auth (login/logout) podem preceder a clínica ativa.';
comment on column public.system_logs.summary is
  'Frase legível em PT-BR descrevendo a ação, exibida na tela de Logs.';

-- ─────────────────────────────────────────────────────────────────
-- Índices para as queries quentes:
--   - leitura global mais recente primeiro;
--   - por clínica (quando filtrar por tenant);
--   - por ator (histórico de um usuário);
--   - por módulo (filtro por área do sistema).
-- ─────────────────────────────────────────────────────────────────
create index if not exists idx_system_logs_created      on public.system_logs (created_at desc);
create index if not exists idx_system_logs_clinic        on public.system_logs (clinic_id, created_at desc);
create index if not exists idx_system_logs_actor         on public.system_logs (actor_user_id, created_at desc);
create index if not exists idx_system_logs_module        on public.system_logs (module, created_at desc);

-- ════════════════════════════════════════════════════════════════
-- RLS: staff grava o próprio evento (insert); SOMENTE admin lê — e lê
-- GLOBALMENTE (sem filtro de clinic_id).
-- ════════════════════════════════════════════════════════════════
alter table public.system_logs enable row level security;

drop policy if exists system_logs_insert_staff on public.system_logs;
drop policy if exists system_logs_read_admin   on public.system_logs;

-- INSERT: qualquer staff logado registra seu evento. NÃO checamos clinic_id no
-- with check porque clinic_id pode ser null (auth) e o app é quem o preenche.
create policy system_logs_insert_staff on public.system_logs
  for insert with check (public.is_staff());

-- SELECT: admin lê TODAS as clínicas (GLOBAL). ⚠️ Leitura CROSS-TENANT
-- INTENCIONAL (decisão do dono) — difere do padrão multitenant por-clínica
-- (0021), que restringe com clinic_id = current_clinic_id(). Aqui NÃO há
-- filtro de clinic_id de propósito: a tela de Logs é uma visão global do dono.
-- (A tela usa service-role de qualquer forma; esta policy é defesa reforçada.)
create policy system_logs_read_admin on public.system_logs
  for select using (public.current_role() = 'admin');

-- ════════════════════════════════════════════════════════════════
-- 2) Permissão do módulo novo 'logs' — modelo POR-CLÍNICA (0020).
--    A matriz virou por-clínica: permission_templates (catálogo global,
--    clonado em novas clínicas) + role_permissions com PK
--    (clinic_id, role, module). Semeamos 'logs' NOS DOIS lugares.
--    Apenas admin com can_view = true; demais papéis explicitamente false.
--    Log é READ-ONLY e visão global → scope 'all'.
-- ════════════════════════════════════════════════════════════════

-- 2a) Template 'default' → novas clínicas já nascem com o módulo 'logs'.
insert into public.permission_templates (template, role, module, can_view, scope)
values
  ('default', 'admin'::public.user_role,    'logs', true,  'all'::public.permission_scope),
  ('default', 'medico'::public.user_role,   'logs', false, 'all'::public.permission_scope),
  ('default', 'recepcao'::public.user_role, 'logs', false, 'all'::public.permission_scope),
  ('default', 'paciente'::public.user_role, 'logs', false, 'all'::public.permission_scope)
on conflict (template, role, module) do update
  set can_view = excluded.can_view,
      scope    = excluded.scope;

-- 2b) Clínicas já existentes → 1 linha por (clínica × papel) para 'logs'.
insert into public.role_permissions (clinic_id, role, module, can_view, scope)
select c.id, v.role, 'logs', v.can_view, 'all'::public.permission_scope
from public.clinics c
cross join (values
  ('admin'::public.user_role,    true),
  ('medico'::public.user_role,   false),
  ('recepcao'::public.user_role, false),
  ('paciente'::public.user_role, false)
) as v(role, can_view)
on conflict (clinic_id, role, module) do update
  set can_view   = excluded.can_view,
      scope      = excluded.scope,
      updated_at = now();

-- ════════════════════════════════════════════════════════════════
-- ROLLBACK (manual):
--   -- 2) permissão do módulo 'logs'
--   delete from public.role_permissions where module = 'logs';
--   -- 1) tabela + policies + índices (drop table remove policies/índices juntos)
--   drop policy if exists system_logs_insert_staff on public.system_logs;
--   drop policy if exists system_logs_read_admin   on public.system_logs;
--   drop table  if exists public.system_logs;
--
-- IMPACTO: reverter apaga a trilha de auditoria (dados de system_logs perdidos
--   no drop table) e remove o módulo 'logs' do menu do admin. Nenhuma tabela de
--   domínio é tocada; access_logs (0014) permanece intacta.
-- ════════════════════════════════════════════════════════════════

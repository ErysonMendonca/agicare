-- ════════════════════════════════════════════════════════════════
-- agicare — migration 0102: ações granulares em role_permissions
--            (can_create / can_edit / can_delete) + módulos novos
--
-- Até aqui a matriz papel×módulo só tinha `can_view` (gate de rota/menu).
-- O contrato TS (src/lib/permissions.shared.ts) já define `Action =
-- "view"|"create"|"edit"|"delete"` e `ModulePermission` com 4 booleans —
-- esta migration alinha o banco a esse contrato.
--
-- O QUE FAZ:
--   1) Acrescenta can_create/can_edit/can_delete em role_permissions.
--   2) Backfill das linhas existentes preservando o comportamento vigente
--      (quem via, podia agir), com as 2 exceções já hardcoded no TS:
--        • recepcao × faturamento → cria=false, edita=true, exclui=false
--        • admin → tudo true / paciente → tudo false (sempre, mesmo que
--          can_view estivesse "errado" para essas linhas).
--   3) Semeia os módulos novos do catálogo TS que ainda não existem na
--      matriz: 'usuarios', 'logs', 'solicitacoes' — para TODAS as
--      clínicas × papéis (via cross join em public.clinics). 'permissoes'
--      já existe desde a 0019, então só é re-sincronizado (idempotente).
--      Regra: usuarios/logs/permissoes são RESTRITOS (só admin, igual ao
--      RESTRITOS do TS); solicitacoes segue a regra geral (mesmo padrão de
--      'fila': recepcao true, medico true, só cai fora em procedimentos/fila).
--      NOTA: o módulo órfão 'enfermagem' (seed da 0019, não existe no
--      catálogo TS) é preservado — ganha as 3 colunas novas no backfill do
--      passo 2, mas não é usado como referência para os módulos novos.
--   4) Mesmo tratamento em permission_templates (catálogo global clonado
--      por clínica na criação — ver provision_clinic() da 0020).
--   5) Adiciona o helper can_action(modulo, ação) SECURITY DEFINER,
--      fail-closed, mesmo padrão de can_view()/view_scope() (0019/0020).
--
-- RLS de role_permissions (leitura staff / escrita admin, 0021) não muda —
-- as novas colunas são regidas pelas MESMAS policies (for all / for select).
--
-- Idempotente: add column if not exists, updates condicionais, insert com
-- on conflict, create or replace function.
-- ════════════════════════════════════════════════════════════════

-- ════════════════════════════════════════════════════════════════
-- 1) Novas colunas em role_permissions e permission_templates
-- ════════════════════════════════════════════════════════════════
alter table public.role_permissions
  add column if not exists can_create boolean not null default false,
  add column if not exists can_edit   boolean not null default false,
  add column if not exists can_delete boolean not null default false;

alter table public.permission_templates
  add column if not exists can_create boolean not null default false,
  add column if not exists can_edit   boolean not null default false,
  add column if not exists can_delete boolean not null default false;

-- ════════════════════════════════════════════════════════════════
-- 2) Backfill das linhas EXISTENTES — preserva o comportamento vigente.
--    Regra geral: quem via, podia agir (can_create=can_edit=can_delete=can_view).
--    Exceções (mesma ordem de precedência do TS defaultPermission()):
--      a) admin        → tudo true, sempre;
--      b) paciente     → tudo false, sempre;
--      c) recepcao × faturamento → create=false, edit=true, delete=false;
--      d) demais       → espelha can_view.
-- ════════════════════════════════════════════════════════════════
update public.role_permissions
   set can_create = case
                       when role = 'admin'    then true
                       when role = 'paciente' then false
                       when role = 'recepcao' and module = 'faturamento' then false
                       else can_view
                     end,
       can_edit   = case
                       when role = 'admin'    then true
                       when role = 'paciente' then false
                       when role = 'recepcao' and module = 'faturamento' then true
                       else can_view
                     end,
       can_delete = case
                       when role = 'admin'    then true
                       when role = 'paciente' then false
                       when role = 'recepcao' and module = 'faturamento' then false
                       else can_view
                     end,
       updated_at = now();

-- Mesmo backfill no template global (não tem updated_at).
update public.permission_templates
   set can_create = case
                       when role = 'admin'    then true
                       when role = 'paciente' then false
                       when role = 'recepcao' and module = 'faturamento' then false
                       else can_view
                     end,
       can_edit   = case
                       when role = 'admin'    then true
                       when role = 'paciente' then false
                       when role = 'recepcao' and module = 'faturamento' then true
                       else can_view
                     end,
       can_delete = case
                       when role = 'admin'    then true
                       when role = 'paciente' then false
                       when role = 'recepcao' and module = 'faturamento' then false
                       else can_view
                     end;

-- ════════════════════════════════════════════════════════════════
-- 3) Semeia os módulos NOVOS do catálogo TS ainda ausentes na matriz:
--    'usuarios', 'logs' (restritos), 'solicitacoes' (regra geral) — para
--    TODAS as clínicas × papéis. 'permissoes' já existe (0019); a query é
--    idempotente e também o re-sincroniza caso falte em alguma clínica.
-- ════════════════════════════════════════════════════════════════
insert into public.role_permissions
  (clinic_id, role, module, can_view, scope, can_create, can_edit, can_delete)
select c.id, r.role, m.module, v.can_view, 'all'::public.permission_scope,
       v.can_view, v.can_view, v.can_view
from public.clinics c
cross join (values
    ('usuarios'),
    ('logs'),
    ('permissoes'),
    ('solicitacoes')
  ) as m(module)
cross join (values
    ('admin'::public.user_role),
    ('medico'::public.user_role),
    ('recepcao'::public.user_role),
    ('paciente'::public.user_role)
  ) as r(role)
cross join lateral (
  select case
    -- admin enxerga e age em tudo
    when r.role = 'admin' then true
    -- paciente não usa o painel interno
    when r.role = 'paciente' then false
    -- usuarios/logs/permissoes são restritos: só admin por default
    when m.module in ('usuarios', 'logs', 'permissoes') then false
    -- solicitacoes segue a regra geral (mesma de outros módulos não-restritos)
    else true
  end as can_view
) as v
-- `do nothing`: as linhas que JÁ existem (ex.: 'permissoes', desde a 0019) podem
-- ter sido customizadas pelo admin na tela de Perfis, e o passo 2 já lhes deu as
-- colunas novas. Sobrescrevê-las aqui apagaria essa customização.
on conflict (clinic_id, role, module) do nothing;

-- Mesmo seed no template global 'default' (clonado nas próximas clínicas).
insert into public.permission_templates
  (template, role, module, can_view, scope, can_create, can_edit, can_delete)
select 'default', r.role, m.module, v.can_view, 'all'::public.permission_scope,
       v.can_view, v.can_view, v.can_view
from (values
    ('usuarios'),
    ('logs'),
    ('permissoes'),
    ('solicitacoes')
  ) as m(module)
cross join (values
    ('admin'::public.user_role),
    ('medico'::public.user_role),
    ('recepcao'::public.user_role),
    ('paciente'::public.user_role)
  ) as r(role)
cross join lateral (
  select case
    when r.role = 'admin' then true
    when r.role = 'paciente' then false
    when m.module in ('usuarios', 'logs', 'permissoes') then false
    else true
  end as can_view
) as v
on conflict (template, role, module) do nothing;

-- ════════════════════════════════════════════════════════════════
-- 4) Helper can_action(modulo, ação) — mesmo padrão de can_view()/
--    view_scope() (0019/0020): SECURITY DEFINER, search_path fixo,
--    fail-closed (linha ausente ou ação inválida → false).
--    admin sempre true (mesma regra do backfill do passo 2). Para os
--    demais papéis, exige can_view=true E a coluna da ação = true.
-- ════════════════════════════════════════════════════════════════
create or replace function public.can_action(p_module text, p_action text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when public.current_role() = 'admin' then true
    when p_action = 'view' then coalesce(
      (select rp.can_view
         from public.role_permissions rp
        where rp.role      = public.current_role()
          and rp.module    = p_module
          and rp.clinic_id = public.current_clinic_id()),
      false
    )
    when p_action = 'create' then coalesce(
      (select rp.can_view and rp.can_create
         from public.role_permissions rp
        where rp.role      = public.current_role()
          and rp.module    = p_module
          and rp.clinic_id = public.current_clinic_id()),
      false
    )
    when p_action = 'edit' then coalesce(
      (select rp.can_view and rp.can_edit
         from public.role_permissions rp
        where rp.role      = public.current_role()
          and rp.module    = p_module
          and rp.clinic_id = public.current_clinic_id()),
      false
    )
    when p_action = 'delete' then coalesce(
      (select rp.can_view and rp.can_delete
         from public.role_permissions rp
        where rp.role      = public.current_role()
          and rp.module    = p_module
          and rp.clinic_id = public.current_clinic_id()),
      false
    )
    else false
  end;
$$;

comment on function public.can_action(text, text) is
  'Fail-closed: o papel logado, na clínica ativa, pode executar p_action (view|create|edit|delete) em p_module? Espelha permissionAllows() de src/lib/permissions.shared.ts.';

-- ════════════════════════════════════════════════════════════════
-- ROLLBACK (manual):
--   drop function if exists public.can_action(text, text);
--   delete from public.permission_templates where module in ('usuarios','logs','solicitacoes');
--   delete from public.role_permissions      where module in ('usuarios','logs','solicitacoes');
--   -- 'permissoes' não é removido (pré-existente desde a 0019).
--   alter table public.role_permissions      drop column if exists can_create, drop column if exists can_edit, drop column if exists can_delete;
--   alter table public.permission_templates  drop column if exists can_create, drop column if exists can_edit, drop column if exists can_delete;
--
-- IMPACTO: reverter faz can_action() deixar de existir (backend precisa
-- voltar a checar só can_view) e remove a granularidade de ação da UI de
-- Permissões. Nenhum dado de domínio (fora da própria matriz) é afetado.
-- ════════════════════════════════════════════════════════════════

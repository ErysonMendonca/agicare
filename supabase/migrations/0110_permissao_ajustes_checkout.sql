-- ════════════════════════════════════════════════════════════════
-- agicare — migration 0110: capacidade 'faturamento_ajustes'
--            (desconto/acréscimo e itens manuais no check-out)
--
-- Até aqui, aplicar desconto/acréscimo (e itens manuais) no check-out era
-- decidido em código por isGestor() (hardcoded). Esta migration transforma
-- essa capacidade em uma PERMISSÃO editável em Perfis de Acesso, modelada
-- como um MÓDULO dedicado usado como TOGGLE ÚNICO: só `can_view` importa
-- (habilitado / não). As ações create/edit/delete não são usadas para esta
-- capacidade e ficam sempre FALSE.
--
-- O QUE FAZ (100% ADITIVA — só linhas novas, nenhuma coluna/tabela alterada):
--   1) Semeia o módulo 'faturamento_ajustes' em role_permissions para
--      TODAS as clínicas × 4 papéis.
--   2) Mesmo seed no template global 'default' (permission_templates),
--      clonado por clínica na criação (provision_clinic() da 0020).
--
--   Regra de can_view (default):
--     • admin=true, recepcao=true, medico=false, paciente=false.
--   can_create=can_edit=can_delete=FALSE (toggle de view), scope='all'.
--
-- Idempotente: insert com ON CONFLICT DO NOTHING (não sobrescreve linhas
-- eventualmente já customizadas pelo admin).
--
-- Colunas e tabelas já existem desde a 0102 — esta migration NÃO as altera.
-- RLS de role_permissions (leitura staff / escrita admin, 0021) não muda.
-- ════════════════════════════════════════════════════════════════

-- ════════════════════════════════════════════════════════════════
-- 1) Semeia 'faturamento_ajustes' em role_permissions para todas as
--    clínicas × papéis. Só can_view varia; ações sempre false.
-- ════════════════════════════════════════════════════════════════
insert into public.role_permissions
  (clinic_id, role, module, can_view, scope, can_create, can_edit, can_delete)
select c.id, r.role, 'faturamento_ajustes', v.can_view,
       'all'::public.permission_scope, false, false, false
from public.clinics c
cross join (values
    ('admin'::public.user_role),
    ('medico'::public.user_role),
    ('recepcao'::public.user_role),
    ('paciente'::public.user_role)
  ) as r(role)
cross join lateral (
  select case
    when r.role in ('admin', 'recepcao') then true
    else false  -- medico, paciente
  end as can_view
) as v
on conflict (clinic_id, role, module) do nothing;

-- ════════════════════════════════════════════════════════════════
-- 2) Mesmo seed no template global 'default' (clonado nas próximas clínicas).
-- ════════════════════════════════════════════════════════════════
insert into public.permission_templates
  (template, role, module, can_view, scope, can_create, can_edit, can_delete)
select 'default', r.role, 'faturamento_ajustes', v.can_view,
       'all'::public.permission_scope, false, false, false
from (values
    ('admin'::public.user_role),
    ('medico'::public.user_role),
    ('recepcao'::public.user_role),
    ('paciente'::public.user_role)
  ) as r(role)
cross join lateral (
  select case
    when r.role in ('admin', 'recepcao') then true
    else false  -- medico, paciente
  end as can_view
) as v
on conflict (template, role, module) do nothing;

-- ════════════════════════════════════════════════════════════════
-- ROLLBACK (manual):
--   delete from public.role_permissions     where module = 'faturamento_ajustes';
--   delete from public.permission_templates  where module = 'faturamento_ajustes';
--
-- IMPACTO: reverter remove a capacidade da matriz e da tela de Perfis. O
-- backend volta a depender do gate hardcoded (isGestor) para desconto/
-- acréscimo/itens manuais no check-out. Nenhum dado de domínio (faturamento,
-- lançamentos) é afetado — só linhas da própria matriz de permissões.
--
-- DEPENDE DE: 0019 (role_permissions/permission_templates + seed base),
--             0102 (colunas can_create/can_edit/can_delete),
--             0020 (permission_templates + provision_clinic()).
-- ════════════════════════════════════════════════════════════════

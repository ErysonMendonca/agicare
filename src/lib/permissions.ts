import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getRole, getCurrentUser, type Role } from "@/lib/auth";
import {
  MODULES,
  DEFAULT_MATRIX,
  defaultMapForRole,
  permissionAllows,
  type Action,
  type ModuleSlug,
  type Scope,
  type PermissionMap,
  type PermissionRow,
} from "@/lib/permissions.shared";

/**
 * Camada de aplicação das permissões por papel × módulo (tabela `role_permissions`,
 * migration 0019). Server-only — sempre usa o cliente de servidor (cookies/RLS).
 *
 * Tipos e constantes PURAS (MODULES, MODULE_LABELS, DEFAULT_MATRIX, tipos) ficam
 * em `@/lib/permissions.shared` para poderem ser importadas no client (tela do
 * admin) sem arrastar dependências de servidor. Reexportamos aqui para preservar
 * o ponto de import único `@/lib/permissions`.
 *
 * Conceitos:
 *  - canView : o papel PODE ver o módulo no menu/na rota.
 *  - scope   : 'all' = enxerga tudo da plataforma; 'own' = só os registros do
 *              próprio profissional (filtro aplicado na camada de dados).
 */

export {
  MODULES,
  MODULE_LABELS,
  DEFAULT_MATRIX,
  ACTIONS,
  ACTION_LABELS,
  permissionAllows,
} from "@/lib/permissions.shared";
export type {
  Action,
  Scope,
  ModuleSlug,
  ModulePermission,
  PermissionMap,
  PermissionRow,
} from "@/lib/permissions.shared";

// ── Leitura da matriz completa (tela do admin) ───────────────────
/**
 * Lê TODAS as linhas de `role_permissions` para montar a tela do admin.
 * Em demo, devolve a matriz default (espelho do seed). Resiliente a erro → default.
 */
export async function getPermissionMatrix(): Promise<PermissionRow[]> {

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("role_permissions")
      .select("role, module, can_view, can_create, can_edit, can_delete, scope");

    if (error || !data || data.length === 0) return DEFAULT_MATRIX;

    return data.map((r) => ({
      role: r.role as Role,
      module: r.module as ModuleSlug,
      canView: Boolean(r.can_view),
      canCreate: Boolean(r.can_create),
      canEdit: Boolean(r.can_edit),
      canDelete: Boolean(r.can_delete),
      scope: (r.scope as Scope) ?? "all",
    }));
  } catch {
    return DEFAULT_MATRIX;
  }
}

// ── Permissões do usuário logado ─────────────────────────────────
/**
 * Mapa de permissões do papel do usuário logado. Em demo → admin (tudo).
 * Resiliente: qualquer falha cai no default do papel (comportamento vigente).
 *
 * `cache()` deduplica a chamada dentro do MESMO request (a página + o gate +
 * a camada de dados podem invocar várias vezes), sem cache global entre requests.
 */
export const getMyPermissions = cache(async (): Promise<PermissionMap> => {

  const role = await getRole();
  if (!role) {
    // Sem papel definido → fail-closed (nada visível, nenhuma ação).
    return MODULES.reduce((acc, module) => {
      acc[module] = {
        canView: false,
        canCreate: false,
        canEdit: false,
        canDelete: false,
        scope: "all",
      };
      return acc;
    }, {} as PermissionMap);
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("role_permissions")
      .select("module, can_view, can_create, can_edit, can_delete, scope")
      .eq("role", role);

    if (error || !data || data.length === 0) return defaultMapForRole(role);

    // Começa do default do papel e sobrescreve com o que veio do banco
    // (garante todas as chaves de ModuleSlug presentes).
    const map = defaultMapForRole(role);
    for (const r of data) {
      const slug = r.module as ModuleSlug;
      if (MODULES.includes(slug)) {
        map[slug] = {
          canView: Boolean(r.can_view),
          canCreate: Boolean(r.can_create),
          canEdit: Boolean(r.can_edit),
          canDelete: Boolean(r.can_delete),
          scope: (r.scope as Scope) ?? "all",
        };
      }
    }
    return map;
  } catch {
    return defaultMapForRole(role);
  }
});

/** O papel logado pode ver o módulo? */
export async function canView(module: ModuleSlug): Promise<boolean> {
  return can(module, "view");
}

/**
 * O papel logado pode executar `action` no módulo? Admin sempre pode (contrato
 * "admin = acesso total", idêntico ao de `requireView`). Toda ação implica
 * `canView` — ver `permissionAllows`.
 */
export async function can(
  module: ModuleSlug,
  action: Action,
): Promise<boolean> {
  if ((await getRole()) === "admin") return true;
  const perms = await getMyPermissions();
  return permissionAllows(perms[module], action);
}

/**
 * Guard de MUTATION para server actions: devolve mensagem de erro quando o
 * papel logado não pode executar a ação, `null` quando pode. Diferente de
 * `requireView`, não redireciona — actions devolvem `{ error }` ao client.
 */
export async function requireAction(
  module: ModuleSlug,
  action: Action,
): Promise<string | null> {
  if (await can(module, action)) return null;
  return "Você não tem permissão para executar esta ação.";
}

/** Escopo de visualização do papel logado no módulo (default 'all'). */
export async function getViewScope(module: ModuleSlug): Promise<Scope> {
  const perms = await getMyPermissions();
  return perms[module]?.scope ?? "all";
}

// ── Vínculo do usuário ao profissional (para escopo 'own') ───────
/**
 * id da linha em `professionals` ligada ao usuário logado (profile_id = auth.uid()).
 * Demo → null (sem filtro). Resiliente a erro → null.
 */
export const getMyProfessionalId = cache(async (): Promise<string | null> => {
  return (await getMyProfessional())?.id ?? null;
});

/**
 * Profissional (id + especialidade) vinculado ao usuário logado. Usado pela fila
 * do médico: ele vê a fila da SUA especialidade (e só pacientes sem profissional
 * atribuído ou atribuídos a ele). Demo → null. Resiliente a erro → null.
 */
export const getMyProfessional = cache(
  async (): Promise<{ id: string; specialty: string | null } | null> => {

    const current = await getCurrentUser();
    if (!current) return null;

    try {
      const supabase = await createClient();
      const { data } = await supabase
        .from("professionals")
        .select("id, specialty")
        .eq("profile_id", current.userId)
        .maybeSingle();
      if (!data?.id) return null;
      return {
        id: data.id as string,
        specialty: (data.specialty as string | null) ?? null,
      };
    } catch {
      return null;
    }
  },
);

// ── Guard de rota (Server Component) ─────────────────────────────
/**
 * Exige que o papel logado possa ver o módulo; senão redireciona para /dashboard.
 * Admin sempre passa (o default do admin já é tudo true, mas reforçamos aqui
 * para que o admin nunca fique travado mesmo com matriz corrompida).
 */
export async function requireView(module: ModuleSlug): Promise<void> {
  const role = await getRole();
  if (role === "admin") return;
  if (!(await canView(module))) redirect("/dashboard");
}

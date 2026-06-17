import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/supabase/config";
import { getRole, getCurrentUser, type Role } from "@/lib/auth";
import {
  MODULES,
  DEFAULT_MATRIX,
  defaultMapForRole,
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
} from "@/lib/permissions.shared";
export type {
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
  if (isDemoMode()) return DEFAULT_MATRIX;

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("role_permissions")
      .select("role, module, can_view, scope");

    if (error || !data || data.length === 0) return DEFAULT_MATRIX;

    return data.map((r) => ({
      role: r.role as Role,
      module: r.module as ModuleSlug,
      canView: Boolean(r.can_view),
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
  if (isDemoMode()) return defaultMapForRole("admin");

  const role = await getRole();
  if (!role) {
    // Sem papel definido → fail-closed (nada visível).
    return MODULES.reduce((acc, module) => {
      acc[module] = { canView: false, scope: "all" };
      return acc;
    }, {} as PermissionMap);
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("role_permissions")
      .select("module, can_view, scope")
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
  const perms = await getMyPermissions();
  return perms[module]?.canView ?? false;
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
  if (isDemoMode()) return null;

  const current = await getCurrentUser();
  if (!current) return null;

  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("professionals")
      .select("id")
      .eq("profile_id", current.userId)
      .maybeSingle();
    return (data?.id as string | null) ?? null;
  } catch {
    return null;
  }
});

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

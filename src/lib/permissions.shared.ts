/**
 * Permissões — parte PURA (sem dependências de servidor).
 *
 * Tipos e constantes da matriz papel × módulo que podem ser importados tanto em
 * Server Components quanto em Client Components (a tela do admin precisa dos
 * rótulos/ordem dos módulos no client). A camada de aplicação server-only
 * (leitura/escrita no Supabase, guards) vive em `@/lib/permissions`, que
 * reexporta tudo deste arquivo para manter um único ponto de import.
 */

import type { Role } from "@/lib/auth";

// ── Tipos ────────────────────────────────────────────────────────
export type Scope = "own" | "all";

export type ModuleSlug =
  | "dashboard"
  | "fila"
  | "pacientes"
  | "agenda"
  | "prontuario"
  | "enfermagem"
  | "procedimentos"
  | "laboratorio"
  | "estoque"
  | "profissionais"
  | "faturamento"
  | "relatorios"
  | "configuracoes"
  | "permissoes";

export type ModulePermission = { canView: boolean; scope: Scope };
export type PermissionMap = Record<ModuleSlug, ModulePermission>;
export type PermissionRow = {
  role: Role;
  module: ModuleSlug;
  canView: boolean;
  scope: Scope;
};

// ── Catálogo de módulos ──────────────────────────────────────────
/** Ordem canônica dos módulos (espelha o menu lateral e o seed da 0019). */
export const MODULES: ModuleSlug[] = [
  "dashboard",
  "fila",
  "pacientes",
  "agenda",
  "prontuario",
  "enfermagem",
  "procedimentos",
  "laboratorio",
  "estoque",
  "profissionais",
  "faturamento",
  "relatorios",
  "configuracoes",
  "permissoes",
];

/** Rótulos PT-BR exibidos na tela do admin. */
export const MODULE_LABELS: Record<ModuleSlug, string> = {
  dashboard: "Dashboard",
  fila: "Fila de Atendimento",
  pacientes: "Pacientes",
  agenda: "Agenda",
  prontuario: "Prontuário",
  enfermagem: "Enfermagem",
  procedimentos: "Procedimentos",
  laboratorio: "Laboratório",
  estoque: "Estoque",
  profissionais: "Profissionais",
  faturamento: "Faturamento",
  relatorios: "Relatórios",
  configuracoes: "Configurações",
  permissoes: "Perfis de Acesso",
};

// ── Defaults (espelham EXATAMENTE o seed da migration 0019) ──────
/**
 * Regra do seed:
 *  - admin    → todos os módulos can_view=true
 *  - paciente → todos false (não usa o painel interno)
 *  - medico/recepcao → tudo true, exceto 'procedimentos' e 'permissoes'
 *  - scope sempre 'all' (comportamento vigente).
 */
export function defaultCanView(role: Role, module: ModuleSlug): boolean {
  if (role === "admin") return true;
  if (role === "paciente") return false;
  // medico/recepcao
  return module !== "procedimentos" && module !== "permissoes";
}

/** Matriz default completa (todas as linhas), idêntica ao seed. */
export const DEFAULT_MATRIX: PermissionRow[] = (
  ["admin", "medico", "recepcao", "paciente"] as Role[]
).flatMap((role) =>
  MODULES.map((module) => ({
    role,
    module,
    canView: defaultCanView(role, module),
    scope: "all" as Scope,
  })),
);

/** Mapa default de um papel (todos os módulos, scope 'all'). */
export function defaultMapForRole(role: Role): PermissionMap {
  return MODULES.reduce((acc, module) => {
    acc[module] = { canView: defaultCanView(role, module), scope: "all" };
    return acc;
  }, {} as PermissionMap);
}

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
  | "procedimentos"
  | "laboratorio"
  | "estoque"
  | "solicitacoes"
  | "profissionais"
  | "faturamento"
  | "faturamento_ajustes"
  | "relatorios"
  | "configuracoes"
  | "usuarios"
  | "logs"
  | "permissoes";

/**
 * Ações granulares por módulo. `view` governa o acesso à rota/menu; as demais
 * governam as mutations (server actions). Toda ação implica `view` — quem não
 * vê o módulo não age sobre ele (invariante aplicada em `can()`).
 */
export type Action = "view" | "create" | "edit" | "delete";

export const ACTIONS: Action[] = ["view", "create", "edit", "delete"];

export const ACTION_LABELS: Record<Action, string> = {
  view: "Ver",
  create: "Criar",
  edit: "Editar",
  delete: "Excluir",
};

export type ModulePermission = {
  canView: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  scope: Scope;
};
export type PermissionMap = Record<ModuleSlug, ModulePermission>;
export type PermissionRow = { role: Role; module: ModuleSlug } & ModulePermission;

/** Chave de `ModulePermission` correspondente a cada ação. */
export const ACTION_KEY: Record<Action, keyof ModulePermission> = {
  view: "canView",
  create: "canCreate",
  edit: "canEdit",
  delete: "canDelete",
};

/** Toda ação exige `canView`. Ponto único da invariante (client e servidor). */
export function permissionAllows(
  perm: ModulePermission | undefined,
  action: Action,
): boolean {
  if (!perm?.canView) return false;
  return Boolean(perm[ACTION_KEY[action]]);
}

// ── Catálogo de módulos ──────────────────────────────────────────
/** Ordem canônica dos módulos (espelha o menu lateral e o seed da 0019). */
export const MODULES: ModuleSlug[] = [
  "dashboard",
  "fila",
  "pacientes",
  "agenda",
  "prontuario",
  "procedimentos",
  "laboratorio",
  "estoque",
  "solicitacoes",
  "profissionais",
  "faturamento",
  "faturamento_ajustes",
  "relatorios",
  "configuracoes",
  "usuarios",
  "logs",
  "permissoes",
];

/** Rótulos PT-BR exibidos na tela do admin. */
export const MODULE_LABELS: Record<ModuleSlug, string> = {
  dashboard: "Dashboard",
  fila: "Fila de Atendimento",
  pacientes: "Pacientes",
  agenda: "Agenda",
  prontuario: "Prontuário",
  procedimentos: "Procedimentos",
  laboratorio: "Laboratório",
  estoque: "Estoque",
  solicitacoes: "Solicitações",
  profissionais: "Profissionais",
  faturamento: "Faturamento",
  faturamento_ajustes: "Desconto/Acréscimo no Check-out",
  relatorios: "Relatórios",
  configuracoes: "Configurações",
  usuarios: "Usuários",
  logs: "Logs / Auditoria",
  permissoes: "Perfis de Acesso",
};

/** Módulos sensíveis: nenhum papel não-admin os recebe por default. */
const RESTRITOS: ModuleSlug[] = ["usuarios", "logs", "permissoes"];

/**
 * Módulos cujas MUTATIONS já checam `create/edit/delete` no servidor (via
 * `requireAction`). Nos demais, só `canView` é aplicado — marcar as ações ali
 * não teria efeito, então a tela as desabilita em vez de prometer um controle
 * que o servidor ainda não faz. Ao acrescentar `requireAction(...)` às actions
 * de um módulo, inclua-o nesta lista.
 */
export const MODULOS_COM_ACOES: ModuleSlug[] = [
  "pacientes",
  "prontuario",
  "profissionais",
  "faturamento",
  "usuarios",
];

/** As ações create/edit/delete são aplicadas no servidor para este módulo? */
export function temEnforcementDeAcoes(module: ModuleSlug): boolean {
  return MODULOS_COM_ACOES.includes(module);
}

// ── Defaults (espelham EXATAMENTE o seed da migration 0019) ──────
/**
 * Regra do seed:
 *  - admin    → todos os módulos can_view=true
 *  - paciente → todos false (não usa o painel interno)
 *  - medico   → tudo true, exceto 'procedimentos', 'permissoes' e 'fila'
 *               (o médico vê seus pacientes na tela de PRONTUÁRIO, não na Fila)
 *  - recepcao → tudo true, exceto 'procedimentos' e 'permissoes'
 *  - scope sempre 'all' (comportamento vigente).
 */
export function defaultCanView(role: Role, module: ModuleSlug): boolean {
  if (role === "admin") return true;
  if (role === "paciente") return false;
  // Capacidade de desconto/acréscimo (e itens manuais) no check-out: toggle
  // só para recepção (além do admin, já retornado acima). Médico não recebe.
  if (module === "faturamento_ajustes") return role === "recepcao";
  // Usuários, Logs e Perfis de Acesso são liberáveis pelo admin, mas nunca
  // vêm ligados por default para papéis não-admin.
  if (RESTRITOS.includes(module)) return false;
  // O médico não acessa a Fila de Atendimento — a lista dos pacientes dele
  // (mesma regra de especialidade/atribuição) fica na tela de Prontuário.
  if (role === "medico")
    return module !== "procedimentos" && module !== "fila";
  // recepcao
  return module !== "procedimentos";
}

/**
 * Permissão default de um (papel, módulo). Preserva o comportamento vigente:
 * antes das ações granulares, quem via o módulo podia agir nele. A exceção é
 * `recepcao × faturamento`, que fecha o check-out (edit) mas não cria nem
 * exclui lançamentos — reabrir/conciliar/gerar lote seguem com o admin.
 */
export function defaultPermission(
  role: Role,
  module: ModuleSlug,
): ModulePermission {
  const canView = defaultCanView(role, module);
  const base = { canView, scope: "all" as Scope };
  if (!canView) {
    return { ...base, canCreate: false, canEdit: false, canDelete: false };
  }
  // 'faturamento_ajustes' é um toggle de view: as ações não são usadas.
  if (module === "faturamento_ajustes") {
    return { ...base, canCreate: false, canEdit: false, canDelete: false };
  }
  if (role === "recepcao" && module === "faturamento") {
    return { ...base, canCreate: false, canEdit: true, canDelete: false };
  }
  return { ...base, canCreate: true, canEdit: true, canDelete: true };
}

/** Matriz default completa (todas as linhas), idêntica ao seed. */
export const DEFAULT_MATRIX: PermissionRow[] = (
  ["admin", "medico", "recepcao", "paciente"] as Role[]
).flatMap((role) =>
  MODULES.map((module) => ({
    role,
    module,
    ...defaultPermission(role, module),
  })),
);

/** Mapa default de um papel (todos os módulos, scope 'all'). */
export function defaultMapForRole(role: Role): PermissionMap {
  return MODULES.reduce((acc, module) => {
    acc[module] = defaultPermission(role, module);
    return acc;
  }, {} as PermissionMap);
}

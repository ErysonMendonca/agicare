/** Contrato client-safe de usuários/cargos (sem imports de servidor). */

/** Cargo-base (enum) → rótulo PT-BR. */
export const BASE_ROLES: { value: "admin" | "medico" | "recepcao"; label: string }[] = [
  { value: "admin", label: "Administrador" },
  { value: "medico", label: "Médico" },
  { value: "recepcao", label: "Recepção" },
];

export function rotuloBase(role: string): string {
  return BASE_ROLES.find((b) => b.value === role)?.label ?? role;
}

export type Cargo = {
  id: string;
  nome: string;
  baseRole: string;
};

export type Usuario = {
  userId: string;
  nome: string;
  roleBase: string;
  /** Cargo personalizado atribuído (null = usa o cargo-base puro). */
  cargoId: string | null;
  /** Rótulo exibido: nome do cargo personalizado ou o rótulo do cargo-base. */
  cargoLabel: string;
  ativo: boolean;
};

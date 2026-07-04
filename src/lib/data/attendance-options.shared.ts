/**
 * Parte PURA (sem dependências de servidor) das opções da ficha de atendimento.
 * Pode ser importada tanto em Server quanto em Client Components — o módulo
 * `attendance-options.ts` (server-only, usa next/headers via supabase/server)
 * reexporta tudo daqui. Padrão igual a `permissions.shared.ts`.
 */

/** Categorias válidas — espelha o contrato da migration 0050. */
export const ATTENDANCE_OPTION_CATEGORIES = [
  "origem",
  "medico",
  "especialidade",
  "encaminhamento",
  "carater",
  "procedencia",
  "centro_custo",
  "convenio",
  "plano",
  "parentesco",
  "motivo_alta",
  "detalhe_alta",
  "tipo_produto",
  "grupo_produto",
  "unidade_medida",
  "via_administracao",
  "principio_ativo",
  "marca",
] as const;

export type AttendanceOptionCategory =
  (typeof ATTENDANCE_OPTION_CATEGORIES)[number];

export type AttendanceOption = {
  id: string;
  label: string;
  value: string;
};

export type AttendanceOptionsByCategory = Record<string, AttendanceOption[]>;

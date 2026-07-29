// Constantes e tipos de Instrumental — SEM dependências de servidor
// (importável por Server e Client Components).

/** Métodos de esterilização disponíveis no cadastro do Instrumental (0121). */
export const METODOS_ESTERILIZACAO = [
  "Autoclave",
  "Óxido de Etileno",
  "Plasma de Peróxido de Hidrogênio",
  "Calor Seco (Estufa)",
  "Outro",
] as const;

export type MetodoEsterilizacao = (typeof METODOS_ESTERILIZACAO)[number];

/** Item do catálogo de Instrumental com os dados de esterilização (0121). */
export type InstrumentalConfigItem = {
  id: string;
  label: string;
  active: boolean;
  sortOrder: number;
  /** Método de esterilização atual (Autoclave, Óxido de Etileno, ...); null = não informado. */
  sterilizationMethod: string | null;
  /** Validade da esterilização atual (ISO yyyy-mm-dd); null = não informado. */
  validityDate: string | null;
  /** Ciclo/lote da esterilização atual; null = não informado. */
  lotCode: string | null;
};

/** true quando a validade já passou (comparação por data, sem hora). */
export function esterilizacaoVencida(validityDate: string | null): boolean {
  if (!validityDate) return false;
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const validade = new Date(`${validityDate}T00:00:00`);
  return validade.getTime() < hoje.getTime();
}

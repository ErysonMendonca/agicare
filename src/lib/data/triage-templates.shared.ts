/**
 * Templates de triagem — parte PURA (client-safe).
 *
 * Tipos e o fallback que reproduz a triagem HARDCODED atual (sinais vitais +
 * classificação de risco Manchester) no formato achatado de `fields` (jsonb)
 * usado pela tabela `triage_templates`. Sem imports de servidor: pode ser
 * importado por Client Components (lousa do gestor + modal da fila) sem vazar
 * `next/headers`. A camada server-only vive em `@/lib/data/triage-templates`.
 *
 * Espelha `@/lib/data/anamnese-templates.shared` — adiciona os tipos "numero"
 * (sinais vitais) e "risco" (classificador Manchester de 5 níveis).
 */

/** Tipos de campo suportados na triagem. */
export type TriageFieldTipo =
  | "numero"
  | "texto"
  | "textarea"
  | "checkboxes"
  | "sim_nao"
  | "select"
  | "risco";

/** Campo achatado de um template de triagem (1 item do array `fields` jsonb). */
export type TriageField = {
  /** Identificador estável do campo (ex.: systolic, heart_rate, risco). */
  id: string;
  tipo: TriageFieldTipo;
  label: string;
  /** Título da seção a que o campo pertence (agrupamento na UI). */
  section?: string;
  /** Opções para `checkboxes` / `select`. */
  options?: string[];
  placeholder?: string;
  /** Unidade exibida ao lado de campos `numero` (ex.: mmHg, bpm, °C). */
  unidade?: string;
};

export type TriageTemplate = {
  specialty: string;
  fields: TriageField[];
};

/**
 * Template de fallback (sem linha no banco): reproduz EXATAMENTE a triagem
 * hardcoded atual — IGUAL para toda especialidade. Sinais vitais (numero),
 * classificação de risco (risco/Manchester) e observações (textarea).
 */
export function fallbackTriageTemplate(specialty: string): TriageTemplate {
  return {
    specialty,
    fields: [
      // ── Sinais Vitais ──────────────────────────────────────────
      { id: "systolic", tipo: "numero", label: "PA Sistólica", section: "Sinais Vitais", unidade: "mmHg" },
      { id: "diastolic", tipo: "numero", label: "PA Diastólica", section: "Sinais Vitais", unidade: "mmHg" },
      { id: "heart_rate", tipo: "numero", label: "Freq. Cardíaca", section: "Sinais Vitais", unidade: "bpm" },
      { id: "resp_rate", tipo: "numero", label: "Freq. Respiratória", section: "Sinais Vitais", unidade: "irpm" },
      { id: "temperature", tipo: "numero", label: "Temperatura", section: "Sinais Vitais", unidade: "°C" },
      { id: "spo2", tipo: "numero", label: "SpO2", section: "Sinais Vitais", unidade: "%" },
      { id: "weight", tipo: "numero", label: "Peso", section: "Sinais Vitais", unidade: "kg" },
      { id: "height", tipo: "numero", label: "Altura", section: "Sinais Vitais", unidade: "m" },
      { id: "glucose", tipo: "numero", label: "Glicemia/HGT", section: "Sinais Vitais", unidade: "mg/dL" },
      // ── Classificação de Risco ─────────────────────────────────
      { id: "risco", tipo: "risco", label: "Classificação de Risco (Manchester)", section: "Classificação de Risco" },
      // ── Observações ────────────────────────────────────────────
      { id: "notes", tipo: "textarea", label: "Observações", section: "Observações" },
    ],
  };
}

/** Garante que o jsonb `fields` é um array de campos bem-formado. */
export function coerceTriageFields(raw: unknown): TriageField[] | null {
  if (!Array.isArray(raw)) return null;
  const fields = raw.filter(
    (f): f is TriageField =>
      !!f &&
      typeof f === "object" &&
      typeof (f as TriageField).id === "string" &&
      typeof (f as TriageField).tipo === "string" &&
      typeof (f as TriageField).label === "string",
  );
  return fields.length ? fields : null;
}

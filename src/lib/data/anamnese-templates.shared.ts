/**
 * Templates de anamnese — parte PURA (client-safe).
 *
 * Tipos e o conversor do motor hardcoded (`@/lib/clinico/anamnese-config`) para
 * o formato achatado de `fields` (jsonb) usado pela tabela `anamnese_templates`.
 * Sem imports de servidor: pode ser importado por Client Components (lousa do
 * gestor) sem vazar `next/headers`. A camada server-only vive em
 * `@/lib/data/anamnese-templates`.
 */

import {
  HISTORICO_GERAL,
  getAnamneseBlocos,
  type BlocoAnamnese,
  type CampoAnamnese,
} from "@/lib/clinico/anamnese-config";

/** Tipos de campo suportados (alinhados ao motor atual). */
export type AnamneseFieldTipo =
  | "texto"
  | "textarea"
  | "checkboxes"
  | "sim_nao"
  | "select";

/** Campo achatado de um template (1 item do array `fields` jsonb). */
export type AnamneseField = {
  /** Identificador estável do campo (era `key` no config). */
  id: string;
  tipo: AnamneseFieldTipo;
  label: string;
  /** Título da seção/bloco a que o campo pertence (agrupamento na UI). */
  section?: string;
  /** Opções para `checkboxes` / `select`. */
  options?: string[];
  placeholder?: string;
  /** Destaque visual (ex.: alergias). */
  destaque?: "amarelo";
  /** Quando "sim", dispara alerta (ex.: risco pré-diabético). */
  alertaSim?: "vermelho";
};

export type AnamneseTemplate = {
  specialty: string;
  fields: AnamneseField[];
  /**
   * Caminho (storage_path) da imagem de fundo pré-fixada da lousa no bucket
   * privado `anamnese`. null/undefined = sem imagem. Escrito pelo gestor.
   */
  lousaImagePath?: string | null;
  /** URL assinada (1h) da imagem de fundo, para exibição no client. */
  lousaImageUrl?: string | null;
};

/** Converte um campo do motor hardcoded para o formato achatado. */
function campoToField(campo: CampoAnamnese, section: string): AnamneseField {
  const base = { id: campo.key, label: campo.label, section };
  switch (campo.tipo) {
    case "checkboxes":
      return { ...base, tipo: "checkboxes", options: campo.opcoes };
    case "texto":
      return {
        ...base,
        tipo: "texto",
        placeholder: campo.placeholder,
        destaque: campo.destaque,
      };
    case "textarea":
      return { ...base, tipo: "textarea", placeholder: campo.placeholder };
    case "sim_nao":
      return { ...base, tipo: "sim_nao", alertaSim: campo.alertaSim };
  }
}

/** Achata uma lista de blocos em `AnamneseField[]` (seção = título do bloco). */
export function blocosToFields(blocos: BlocoAnamnese[]): AnamneseField[] {
  return blocos.flatMap((bloco) =>
    bloco.campos.map((campo) => campoToField(campo, bloco.titulo)),
  );
}

/**
 * Template de fallback (sem linha no banco): converte o motor hardcoded da
 * especialidade. Inclui sempre o Histórico Geral + módulo específico.
 */
export function fallbackTemplate(specialty: string): AnamneseTemplate {
  return { specialty, fields: blocosToFields(getAnamneseBlocos(specialty)) };
}

/** Apenas o Histórico Geral em formato de fields (base comum). */
export function historicoGeralFields(): AnamneseField[] {
  return blocosToFields([HISTORICO_GERAL]);
}

/**
 * Templates de anamnese — camada server-only.
 *
 * Lê/monta os templates da clínica ativa a partir da tabela
 * `anamnese_templates` (migration 0051). Se não houver linha ativa para a
 * especialidade, faz fallback convertendo o motor hardcoded
 * (`@/lib/clinico/anamnese-config`) — assim a anamnese continua funcionando
 * antes de qualquer customização do gestor.
 *
 * Reexporta os tipos PUROS de `.shared.ts` (ponto único de import).
 */

import { createClient } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/supabase/config";
import { ESPECIALIDADES_ANAMNESE } from "@/lib/clinico/anamnese-config";
import {
  type AnamneseField,
  type AnamneseTemplate,
  fallbackTemplate,
} from "@/lib/data/anamnese-templates.shared";

export {
  type AnamneseField,
  type AnamneseFieldTipo,
  type AnamneseTemplate,
} from "@/lib/data/anamnese-templates.shared";

/** Linha bruta retornada do banco. */
type TemplateRow = {
  specialty: string;
  fields: unknown;
};

/** Garante que o jsonb `fields` é um array de campos bem-formado. */
function coerceFields(raw: unknown): AnamneseField[] | null {
  if (!Array.isArray(raw)) return null;
  const fields = raw.filter(
    (f): f is AnamneseField =>
      !!f &&
      typeof f === "object" &&
      typeof (f as AnamneseField).id === "string" &&
      typeof (f as AnamneseField).tipo === "string" &&
      typeof (f as AnamneseField).label === "string",
  );
  return fields.length ? fields : null;
}

/**
 * Template ativo da especialidade na clínica ativa. Fallback ao motor
 * hardcoded quando não há linha (ou em modo demo).
 */
export async function getAnamneseTemplate(
  specialty: string,
): Promise<AnamneseTemplate> {
  if (isDemoMode()) return fallbackTemplate(specialty);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("anamnese_templates")
    .select("specialty, fields")
    .eq("specialty", specialty)
    .eq("active", true)
    .maybeSingle();

  if (error || !data) return fallbackTemplate(specialty);

  const fields = coerceFields((data as TemplateRow).fields);
  if (!fields) return fallbackTemplate(specialty);

  return { specialty: (data as TemplateRow).specialty, fields };
}

/**
 * Lista os templates por especialidade (tela do gestor). Para cada
 * especialidade conhecida devolve a linha do banco ou o fallback convertido,
 * garantindo que a lousa sempre tenha um ponto de partida editável.
 */
export async function listAnamneseTemplates(): Promise<AnamneseTemplate[]> {
  const especialidades = ESPECIALIDADES_ANAMNESE.map((e) => e.value);

  if (isDemoMode()) {
    return especialidades.map((s) => fallbackTemplate(s));
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("anamnese_templates")
    .select("specialty, fields")
    .eq("active", true);

  const bySpecialty = new Map<string, AnamneseField[]>();
  if (!error && data) {
    for (const row of data as TemplateRow[]) {
      const fields = coerceFields(row.fields);
      if (fields) bySpecialty.set(row.specialty, fields);
    }
  }

  return especialidades.map((specialty) => {
    const fields = bySpecialty.get(specialty);
    return fields ? { specialty, fields } : fallbackTemplate(specialty);
  });
}

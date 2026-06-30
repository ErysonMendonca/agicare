/**
 * Templates de triagem — camada server-only.
 *
 * Lê/monta os templates da clínica ativa a partir da tabela `triage_templates`
 * (migration 0062). Se não houver linha ativa para a especialidade, faz fallback
 * ao template hardcoded (`@/lib/data/triage-templates.shared`) — assim a triagem
 * continua funcionando exatamente como hoje antes de qualquer customização.
 *
 * Reexporta os tipos PUROS de `.shared.ts` (ponto único de import).
 */

import { createClient } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/supabase/config";
import { ESPECIALIDADES_ANAMNESE } from "@/lib/clinico/anamnese-config";
import {
  type TriageField,
  type TriageTemplate,
  fallbackTriageTemplate,
  coerceTriageFields,
} from "@/lib/data/triage-templates.shared";

export {
  type TriageField,
  type TriageFieldTipo,
  type TriageTemplate,
} from "@/lib/data/triage-templates.shared";

/** Linha bruta retornada do banco. */
type TemplateRow = {
  specialty: string;
  fields: unknown;
};

/**
 * Template ativo da especialidade na clínica ativa. Fallback ao template
 * hardcoded quando não há linha (ou em modo demo).
 */
export async function getTriageTemplate(
  specialty: string,
): Promise<TriageTemplate> {
  if (isDemoMode()) return fallbackTriageTemplate(specialty);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("triage_templates")
    .select("specialty, fields")
    .eq("specialty", specialty)
    .eq("active", true)
    .maybeSingle();

  if (error || !data) return fallbackTriageTemplate(specialty);

  const fields = coerceTriageFields((data as TemplateRow).fields);
  if (!fields) return fallbackTriageTemplate(specialty);

  return { specialty: (data as TemplateRow).specialty, fields };
}

/**
 * Lista os templates por especialidade (tela do gestor). Para cada
 * especialidade conhecida devolve a linha do banco ou o fallback hardcoded,
 * garantindo que a lousa sempre tenha um ponto de partida editável.
 */
export async function listTriageTemplates(): Promise<TriageTemplate[]> {
  const especialidades = ESPECIALIDADES_ANAMNESE.map((e) => e.value);

  if (isDemoMode()) {
    return especialidades.map((s) => fallbackTriageTemplate(s));
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("triage_templates")
    .select("specialty, fields")
    .eq("active", true);

  const bySpecialty = new Map<string, TriageField[]>();
  if (!error && data) {
    for (const row of data as TemplateRow[]) {
      const fields = coerceTriageFields(row.fields);
      if (fields) bySpecialty.set(row.specialty, fields);
    }
  }

  return especialidades.map((specialty) => {
    const fields = bySpecialty.get(specialty);
    return fields ? { specialty, fields } : fallbackTriageTemplate(specialty);
  });
}

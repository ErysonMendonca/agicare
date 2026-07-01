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

/** Bucket privado onde vive a imagem de fundo da lousa (mesmo dos anexos). */
const BUCKET = "anamnese";

/** Linha bruta retornada do banco. */
type TemplateRow = {
  specialty: string;
  fields: unknown;
  lousa_image_path?: string | null;
};

/** "Cardiologia (adulto)" → "cardiologia-adulto" para compor caminhos. */
export function slugEspecialidade(specialty: string): string {
  return specialty
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

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
    .select("specialty, fields, lousa_image_path")
    .eq("specialty", specialty)
    .eq("active", true)
    .maybeSingle();

  if (error || !data) return fallbackTemplate(specialty);

  const row = data as TemplateRow;
  const fields = coerceFields(row.fields);
  const lousaImagePath = row.lousa_image_path ?? null;
  const lousaImageUrl = await assinarLousaImagem(supabase, lousaImagePath);
  // Sem campos válidos: ainda assim devolve a imagem de fundo (se houver) sobre
  // o fallback hardcoded, para não perder a lousa configurada pelo gestor.
  if (!fields) return { ...fallbackTemplate(specialty), lousaImagePath, lousaImageUrl };

  return { specialty: row.specialty, fields, lousaImagePath, lousaImageUrl };
}

/** Assina (1h) o caminho da imagem de fundo da lousa no bucket privado. */
async function assinarLousaImagem(
  supabase: Awaited<ReturnType<typeof createClient>>,
  path: string | null,
): Promise<string | null> {
  if (!path) return null;
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, 3600);
  if (error || !data) return null;
  return data.signedUrl;
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
    .select("specialty, fields, lousa_image_path")
    .eq("active", true);

  const bySpecialty = new Map<string, AnamneseField[]>();
  const pathBySpecialty = new Map<string, string>();
  if (!error && data) {
    for (const row of data as TemplateRow[]) {
      const fields = coerceFields(row.fields);
      if (fields) bySpecialty.set(row.specialty, fields);
      if (row.lousa_image_path)
        pathBySpecialty.set(row.specialty, row.lousa_image_path);
    }
  }

  // Assina todas as imagens de fundo de uma vez (bucket privado).
  const paths = Array.from(new Set(pathBySpecialty.values()));
  const signedByPath = new Map<string, string>();
  if (paths.length > 0) {
    const { data: signed } = await supabase.storage
      .from(BUCKET)
      .createSignedUrls(paths, 3600);
    for (const s of signed ?? [])
      if (s.path && s.signedUrl) signedByPath.set(s.path, s.signedUrl);
  }

  return especialidades.map((specialty) => {
    const fields = bySpecialty.get(specialty);
    const lousaImagePath = pathBySpecialty.get(specialty) ?? null;
    const lousaImageUrl = lousaImagePath
      ? (signedByPath.get(lousaImagePath) ?? null)
      : null;
    const base = fields ? { specialty, fields } : fallbackTemplate(specialty);
    return { ...base, lousaImagePath, lousaImageUrl };
  });
}

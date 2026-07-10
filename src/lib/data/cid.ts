import { createClient } from "@/lib/supabase/server";

export type CidCode = { id: string; code: string; description: string };

const DEMO_CID_CODES: CidCode[] = [
  { id: "demo-cid-1", code: "J11", description: "Influenza (gripe)" },
  { id: "demo-cid-2", code: "J00", description: "Nasofaringite aguda (resfriado comum)" },
  { id: "demo-cid-3", code: "A09", description: "Diarreia e gastroenterite de origem infecciosa presumível" },
  { id: "demo-cid-4", code: "M54.5", description: "Dor lombar baixa" },
  { id: "demo-cid-5", code: "R51", description: "Cefaleia" },
];

/** Lista o catálogo global de CIDs ativos, ordenado por código. */
export async function listCidCodes(): Promise<CidCode[]> {

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("cid_codes")
    .select("id, code, description")
    .eq("active", true)
    .order("code", { ascending: true });

  if (error || !data) return [];

  return data.map((c) => ({
    id: c.id as string,
    code: c.code as string,
    description: c.description as string,
  }));
}

/**
 * Resolve um código CID digitado contra o catálogo (cid_codes ATIVOS),
 * tolerando diferença de caixa e de PONTO (o seed 0077 grava com ponto — M54.5 —
 * e o 0095 sem ponto — N803). Testa as variantes contra o índice único `code`.
 * Devolve a linha CANÔNICA do catálogo (code como está cadastrado) ou null se o
 * CID não existir/estiver inativo — usado para bloquear a emissão de documento
 * com CID fora do catálogo do admin.
 */
export async function resolveCidCode(input: string): Promise<CidCode | null> {
  const up = input.trim().toUpperCase().replace(/\s+/g, "");
  if (!up) return null;
  const undotted = up.replace(/\./g, "");
  // Forma pontuada padrão ICD-10: 3 primeiros caracteres + '.' + o resto.
  const dotted =
    undotted.length > 3 ? `${undotted.slice(0, 3)}.${undotted.slice(3)}` : undotted;
  const variants = Array.from(new Set([up, undotted, dotted]));

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("cid_codes")
    .select("id, code, description")
    .eq("active", true)
    .in("code", variants)
    .limit(1);

  if (error || !data || data.length === 0) return null;
  const c = data[0];
  return {
    id: c.id as string,
    code: c.code as string,
    description: c.description as string,
  };
}

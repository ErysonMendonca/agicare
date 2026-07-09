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

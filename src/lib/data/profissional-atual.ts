import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { getActiveClinicId } from "@/lib/tenant";
import { formatarConselho } from "@/lib/clinico/conselho";

/**
 * Identificação do profissional LOGADO para cabeçalhos de documentos clínicos
 * (Ortograma, atestados, etc.). Server-only.
 *
 * Só lê a própria linha (`profile_id` = usuário logado) dentro da clínica ativa
 * — nunca recebe id de fora. O nome vem de `profiles`; o registro do conselho,
 * de `professionals` (0070: council_name/uf/number, ex.: "CRO-BA 12345").
 */

export type ProfissionalAtual = {
  nome: string;
  /** Registro do conselho já formatado ("CRO-BA 12345") ou "—". */
  conselho: string;
};

export async function getProfissionalAtual(): Promise<ProfissionalAtual | null> {
  const current = await getCurrentUser();
  if (!current) return null;

  const nome = current.profile?.full_name?.trim() || "—";
  const clinicId = await getActiveClinicId();
  if (!clinicId) return { nome, conselho: "—" };

  const supabase = await createClient();
  const { data } = await supabase
    .from("professionals")
    .select("council_name, council_uf, council_number, council_reg")
    .eq("profile_id", current.userId)
    .eq("clinic_id", clinicId)
    .maybeSingle();

  return { nome, conselho: formatarConselho(data) };
}

import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { getActiveClinicId } from "@/lib/tenant";

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

type LinhaConselho = {
  council_name?: string | null;
  council_uf?: string | null;
  council_number?: string | null;
  council_reg?: string | null;
};

/**
 * "CRO-BA 12345" a partir dos campos detalhados (0070). Cai em `council_reg`
 * (campo legado, texto livre) quando o detalhado não foi preenchido.
 */
function formatarConselho(linha: LinhaConselho | null): string {
  const nome = linha?.council_name?.trim();
  const uf = linha?.council_uf?.trim();
  const numero = linha?.council_number?.trim();

  if (nome && numero) {
    const orgao = uf ? `${nome}-${uf}` : nome;
    return `${orgao} ${numero}`;
  }
  return linha?.council_reg?.trim() || "—";
}

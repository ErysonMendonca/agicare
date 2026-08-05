import { createClient } from "@/lib/supabase/server";
import { getPatientEditavel } from "@/lib/data/patients";

export type Receituario = {
  id: string;
  tipo: "simples" | "especial";
  texto: string;
  dataHora: string;
  profissional: string;
  /** Nº do atendimento (queue_entries.attendance_code) em que foi emitido; null = legado/sem vínculo. */
  atendimentoCodigo: string | null;
  /** CID-10 do catálogo (opcional por LGPD); null quando não informado. */
  cid10: string | null;
  /** Exibir o CID na impressão (LGPD — sigilo do diagnóstico). */
  exibirCid: boolean;
  /** Cancelamento (não destrutivo): null = documento ativo. */
  cancelledAt: string | null;
  cancelReason: string | null;
};

function fmtDataHora(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${d.toLocaleDateString("pt-BR")} ${d.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

/** Deriva o tipo ('simples'|'especial') a partir do sufixo do kind. */
function tipoFromKind(kind: string): Receituario["tipo"] {
  return kind === "receituario_especial" ? "especial" : "simples";
}

/** Lista os receituários (simples/especial) emitidos para o paciente. */
export async function listReceituarios(
  patientId: string,
): Promise<Receituario[]> {

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("certificates")
    .select(
      "id, kind, prescription_text, cid10, show_cid, created_at, cancelled_at, cancel_reason, professionals(profiles(full_name)), queue_entries(attendance_code)",
    )
    .eq("patient_id", patientId)
    .in("kind", ["receituario_simples", "receituario_especial"])
    .order("created_at", { ascending: false });

  if (error || !data) return [];

  return data.map((c) => {
    const prof = Array.isArray(c.professionals)
      ? c.professionals[0]
      : c.professionals;
    const profile = Array.isArray(prof?.profiles)
      ? prof?.profiles[0]
      : prof?.profiles;
    const qe = Array.isArray(c.queue_entries) ? c.queue_entries[0] : c.queue_entries;

    return {
      id: c.id as string,
      tipo: tipoFromKind((c.kind as string) ?? "receituario_simples"),
      texto: (c.prescription_text as string | null) ?? "",
      dataHora: fmtDataHora((c.created_at as string | null) ?? null),
      profissional: profile?.full_name ?? "—",
      atendimentoCodigo: (qe?.attendance_code as string | null) ?? null,
      cid10: (c.cid10 as string | null) ?? null,
      exibirCid: (c.show_cid as boolean | null) ?? true,
      cancelledAt: (c.cancelled_at as string | null) ?? null,
      cancelReason: (c.cancel_reason as string | null) ?? null,
    };
  });
}

export type PacienteEndereco = {
  endereco: string;
  bairro: string;
  cidade: string;
  uf: string;
  cep: string;
};

/** Endereço do paciente para o cabeçalho do receituário. Fallback vazio. */
export async function getPacienteEndereco(
  patientId: string,
): Promise<PacienteEndereco> {

  const p = await getPatientEditavel(patientId);
  if (!p) return { endereco: "", bairro: "", cidade: "", uf: "", cep: "" };

  return {
    endereco: p.address ?? "",
    bairro: p.district ?? "",
    cidade: p.city ?? "",
    uf: p.uf ?? "",
    cep: p.cep ?? "",
  };
}

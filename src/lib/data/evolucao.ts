import { createClient } from "@/lib/supabase/server";
import { extrairConselho } from "@/lib/clinico/conselho";

/** Rótulos dos campos da evolução, na ordem de impressão. */
export const EVOLUCAO_CAMPOS = [
  ["queixa", "Queixa Principal"],
  ["hda", "História da Doença Atual (HDA)"],
  ["exame", "Exame Físico"],
  ["hipotese", "Hipótese Diagnóstica"],
  ["conduta", "Conduta / Plano"],
] as const;

/** Par rótulo→valor de sinal vital extra (ex.: "Perímetro cefálico" → "34 cm"). */
export type SinalExtra = { label: string; value: string };

export type EvolucaoCard = {
  id: string;
  dataHora: string;
  profissional: string;
  /** Registro do conselho do autor já formatado ("CRM-SP 12345") ou "—". */
  conselho: string;
  /** Nº do atendimento (queue_entries.attendance_code) em que foi gerada; null = legado/sem vínculo. */
  atendimentoCodigo: string | null;
  /** Primeira linha (queixa principal) para o resumo do card. */
  resumo: string;
  /** Conteúdo completo formatado (para Ver / Imprimir). */
  conteudo: string;
  /** Sinais vitais extras aferidos junto da evolução (opcional). */
  extras: SinalExtra[];
  /** Cancelamento (não destrutivo): null = evolução ativa. */
  cancelledAt: string | null;
  cancelReason: string | null;
};

/** Converte o jsonb `extra` (objeto chave→valor) em lista de pares. */
function parseExtra(raw: unknown): SinalExtra[] {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
  return Object.entries(raw as Record<string, unknown>)
    .filter(([label, value]) => label.trim() !== "" && value != null && String(value).trim() !== "")
    .map(([label, value]) => ({ label, value: String(value) }));
}

function fmtDataHora(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${d.toLocaleDateString("pt-BR")} ${d.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

/**
 * Lista as evoluções clínicas do paciente (medical_records).
 * O conteúdo estruturado é gravado com rótulos pelo registrarEvolucao.
 */
export async function listEvolucoes(patientId: string): Promise<EvolucaoCard[]> {

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("medical_records")
    .select("id, content, created_at, cancelled_at, cancel_reason, professionals(council_name, council_uf, council_number, council_reg, profiles(full_name)), queue_entries(attendance_code)")
    .eq("patient_id", patientId)
    .order("created_at", { ascending: false });

  if (error || !data) return [];

  // Sinais extras ficam em vital_signs; casa-se por recorded_at == created_at
  // (ambos gravados com o mesmo instante no registrarEvolucao).
  const { data: vitais } = await supabase
    .from("vital_signs")
    .select("recorded_at, extra")
    .eq("patient_id", patientId);

  const extrasPorInstante = new Map<number, SinalExtra[]>();
  for (const v of vitais ?? []) {
    const t = new Date(v.recorded_at as string).getTime();
    const pares = parseExtra(v.extra);
    if (Number.isFinite(t) && pares.length > 0) extrasPorInstante.set(t, pares);
  }

  return data.map((r) => {
    const prof = Array.isArray(r.professionals)
      ? r.professionals[0]
      : r.professionals;
    const profile = Array.isArray(prof?.profiles)
      ? prof?.profiles[0]
      : prof?.profiles;
    const conteudo = (r.content as string | null) ?? "";
    const primeira = conteudo
      .replace(/^Queixa Principal:\s*/i, "")
      .split("\n")[0]
      .trim();

    const t = r.created_at ? new Date(r.created_at as string).getTime() : NaN;
    const extras = Number.isFinite(t)
      ? (extrasPorInstante.get(t) ?? [])
      : [];
    const qe = Array.isArray(r.queue_entries) ? r.queue_entries[0] : r.queue_entries;

    return {
      id: r.id as string,
      dataHora: fmtDataHora(r.created_at as string | null),
      profissional: profile?.full_name ?? "—",
      conselho: extrairConselho(r.professionals),
      atendimentoCodigo: (qe?.attendance_code as string | null) ?? null,
      resumo: primeira || "Evolução clínica registrada.",
      conteudo,
      extras,
      cancelledAt: (r.cancelled_at as string | null) ?? null,
      cancelReason: (r.cancel_reason as string | null) ?? null,
    };
  });
}

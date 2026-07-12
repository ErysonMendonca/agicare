import { createClient } from "@/lib/supabase/server";

// Re-exporta o motor PURO (config) para conveniência em Server Components.
export {
  type CampoAnamnese,
  type BlocoAnamnese,
  ESPECIALIDADES_ANAMNESE,
  getAnamneseBlocos,
} from "@/lib/clinico/anamnese-config";

// ── Anamneses registradas ───────────────────────────────────────────
export type AnamneseRegistro = {
  id: string;
  specialty: string;
  dataHora: string;
  profissional: string;
  consentimento: boolean;
  assinatura: string | null;
  campos: Record<string, unknown>;
  /** Nº do atendimento (queue_entries.attendance_code) em que foi gerada; null = legado/sem vínculo. */
  atendimentoCodigo: string | null;
  /** Cancelamento (não destrutivo): null = anamnese ativa. */
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

const DEMO_ANAMNESES: AnamneseRegistro[] = [
  {
    id: "demo-ana-1",
    specialty: "Podológico",
    dataHora: "10/06/2026 10:15",
    profissional: "Dra. Ana Beatriz Costa",
    consentimento: true,
    assinatura: "Ana Beatriz Costa",
    campos: {
      doencas_sistemicas: ["Diabetes"],
      alergias: "Nenhuma conhecida",
      podo_risco_pre_diabetico: true,
    },
    atendimentoCodigo: "204815",
    cancelledAt: null,
    cancelReason: null,
  },
];

/** Lista anamneses do paciente (todas as especialidades — visualização liberada). */
export async function listAnamneses(
  patientId: string,
): Promise<AnamneseRegistro[]> {

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("anamneses")
    .select(
      "id, specialty, fields, consent_given, signature, created_at, cancelled_at, cancel_reason, queue_entries(attendance_code), professionals(profiles(full_name))",
    )
    .eq("patient_id", patientId)
    .order("created_at", { ascending: false });

  if (error || !data) return [];

  return data.map((a) => {
    const prof = Array.isArray(a.professionals)
      ? a.professionals[0]
      : a.professionals;
    const profile = Array.isArray(prof?.profiles)
      ? prof?.profiles[0]
      : prof?.profiles;
    // Relacionamento único (FK queue_entry_id) — supabase-js pode devolver objeto ou array.
    const qe = Array.isArray(a.queue_entries)
      ? a.queue_entries[0]
      : a.queue_entries;

    return {
      id: a.id as string,
      specialty: (a.specialty as string | null) ?? "—",
      dataHora: fmtDataHora(a.created_at as string | null),
      profissional: profile?.full_name ?? "—",
      consentimento: !!a.consent_given,
      assinatura: (a.signature as string | null) ?? null,
      campos: (a.fields as Record<string, unknown> | null) ?? {},
      atendimentoCodigo: (qe?.attendance_code as string | null) ?? null,
      cancelledAt: (a.cancelled_at as string | null) ?? null,
      cancelReason: (a.cancel_reason as string | null) ?? null,
    };
  });
}

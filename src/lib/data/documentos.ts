import { createClient } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/supabase/config";

export type Documento = {
  id: string;
  tipo: "atestado" | "alta";
  dataHora: string;
  profissional: string;
  /** Atestado */
  dias: number | null;
  inicio: string | null;
  fim: string | null;
  diagnostico: string | null;
  cid10: string | null;
  /** Alta */
  motivo: string | null;
  orientacoes: string | null;
};

function fmtData(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString("pt-BR");
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

const DEMO_DOCUMENTOS: Documento[] = [
  {
    id: "demo-doc-1",
    tipo: "atestado",
    dataHora: "12/06/2026 09:00",
    profissional: "Dra. Ana Beatriz Costa",
    dias: 3,
    inicio: "12/06/2026",
    fim: "14/06/2026",
    diagnostico: "Síndrome gripal.",
    cid10: null,
    motivo: null,
    orientacoes: null,
  },
  {
    id: "demo-doc-2",
    tipo: "alta",
    dataHora: "11/06/2026 16:30",
    profissional: "Dr. Carlos Eduardo",
    dias: null,
    inicio: null,
    fim: null,
    diagnostico: "Quadro estável.",
    cid10: null,
    motivo: "Melhora clínica.",
    orientacoes: "Retornar em caso de febre ou piora da dor. Hidratação oral.",
  },
];

/** Lista atestados e altas emitidos para o paciente. */
export async function listDocumentos(patientId: string): Promise<Documento[]> {
  if (isDemoMode()) return DEMO_DOCUMENTOS;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("certificates")
    .select(
      "id, kind, days, start_date, end_date, diagnosis, cid10, reason, post_discharge, created_at, professionals(profiles(full_name))",
    )
    .eq("patient_id", patientId)
    .order("created_at", { ascending: false });

  if (error || !data) return [];

  return data.map((c) => {
    const prof = Array.isArray(c.professionals)
      ? c.professionals[0]
      : c.professionals;
    const profile = Array.isArray(prof?.profiles)
      ? prof?.profiles[0]
      : prof?.profiles;

    return {
      id: c.id as string,
      tipo: ((c.kind as string) === "alta" ? "alta" : "atestado") as Documento["tipo"],
      dataHora: fmtDataHora(c.created_at as string | null),
      profissional: profile?.full_name ?? "—",
      dias: c.days != null ? Number(c.days) : null,
      inicio: fmtData(c.start_date as string | null),
      fim: fmtData(c.end_date as string | null),
      diagnostico: (c.diagnosis as string | null) ?? null,
      cid10: (c.cid10 as string | null) ?? null,
      motivo: (c.reason as string | null) ?? null,
      orientacoes: (c.post_discharge as string | null) ?? null,
    };
  });
}

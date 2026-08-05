import { createClient } from "@/lib/supabase/server";
import { extrairConselho } from "@/lib/clinico/conselho";
import { dataBR } from "@/lib/format/data-br";

export type Documento = {
  id: string;
  tipo: "atestado" | "alta";
  dataHora: string;
  profissional: string;
  /** Registro do conselho do autor já formatado ("CRM-SP 12345") ou "—". */
  conselho: string;
  /** Nº do atendimento (queue_entries.attendance_code) em que foi emitido; null = legado/sem vínculo. */
  atendimentoCodigo: string | null;
  /** Atestado */
  dias: number | null;
  dataAtestado: string | null;
  inicio: string | null;
  fim: string | null;
  diagnostico: string | null;
  cid10: string | null;
  observacao: string | null;
  exibirCid: boolean;
  /** Alta */
  motivo: string | null;
  orientacoes: string | null;
  dataAlta: string | null;
  detalhe: string | null;
  /** Cancelamento (não destrutivo): null = documento ativo. */
  cancelledAt: string | null;
  cancelReason: string | null;
};

function fmtData(iso: string | null): string | null {
  return dataBR(iso);
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

/** Lista atestados e altas emitidos para o paciente. */
export async function listDocumentos(patientId: string): Promise<Documento[]> {

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("certificates")
    .select(
      "id, kind, days, issue_date, start_date, end_date, diagnosis, cid10, observation, show_cid, reason, post_discharge, discharge_at, discharge_detail, created_at, cancelled_at, cancel_reason, professionals(council_name, council_uf, council_number, council_reg, profiles(full_name)), queue_entries(attendance_code)",
    )
    .eq("patient_id", patientId)
    // Aba Documentos = só atestado/alta. Receituários têm aba própria.
    .in("kind", ["atestado", "alta"])
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
      tipo: ((c.kind as string) === "alta" ? "alta" : "atestado") as Documento["tipo"],
      dataHora: fmtDataHora(c.created_at as string | null),
      profissional: profile?.full_name ?? "—",
      conselho: extrairConselho(c.professionals),
      atendimentoCodigo: (qe?.attendance_code as string | null) ?? null,
      dias: c.days != null ? Number(c.days) : null,
      dataAtestado: fmtData(c.issue_date as string | null),
      inicio: fmtData(c.start_date as string | null),
      fim: fmtData(c.end_date as string | null),
      diagnostico: (c.diagnosis as string | null) ?? null,
      cid10: (c.cid10 as string | null) ?? null,
      observacao: (c.observation as string | null) ?? null,
      exibirCid: (c.show_cid as boolean | null) ?? true,
      motivo: (c.reason as string | null) ?? null,
      orientacoes: (c.post_discharge as string | null) ?? null,
      dataAlta: fmtDataHora((c.discharge_at as string | null) ?? null),
      detalhe: (c.discharge_detail as string | null) ?? null,
      cancelledAt: (c.cancelled_at as string | null) ?? null,
      cancelReason: (c.cancel_reason as string | null) ?? null,
    };
  });
}

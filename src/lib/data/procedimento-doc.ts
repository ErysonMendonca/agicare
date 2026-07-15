import { createClient } from "@/lib/supabase/server";
import { getActiveClinicId } from "@/lib/tenant";

/**
 * Leitura dos documentos de procedimentos. Server-only.
 *
 * Escopo por clínica EXPLÍCITO (clinic_id da clínica ativa) — a RLS da 0114 é a
 * segunda camada, não a única. Espelha o padrão de `data/ortograma.ts`.
 */

const brl = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export type ProcedimentoDocItem = { nome: string; valor: number };

export type ProcedimentoDocResumo = {
  id: string;
  createdAt: string;
  professionalName: string;
  totalItens: number;
  total: number;
  totalLabel: string;
  /** Nº do atendimento (queue_entries.attendance_code); null = avulso/legado. */
  atendimentoCodigo: string | null;
  /** Cancelamento (não destrutivo): null = documento ativo. */
  cancelledAt: string | null;
  cancelReason: string | null;
};

export type ProcedimentoDocDetalhe = {
  id: string;
  createdAt: string;
  professionalName: string;
  atendimentoCodigo: string | null;
  itens: ProcedimentoDocItem[];
  total: number;
  totalLabel: string;
  notes: string;
};

/** Nome do profissional vindo do join aninhado (objeto ou array). */
function nomeProfissional(prof: unknown): string {
  const p = Array.isArray(prof) ? prof[0] : prof;
  const profile = p as { profiles?: unknown } | null | undefined;
  const pf = Array.isArray(profile?.profiles) ? profile?.profiles[0] : profile?.profiles;
  const nome = (pf as { full_name?: string | null } | null | undefined)?.full_name;
  return nome ?? "—";
}

/**
 * Histórico resumido dos documentos de procedimentos do paciente (mais recente
 * primeiro). Total de itens/valor vem de UMA consulta aos itens (evita N+1).
 */
export async function listProcedimentoDocs(
  patientId: string,
): Promise<ProcedimentoDocResumo[]> {
  const clinicId = await getActiveClinicId();
  if (!clinicId) return [];

  const supabase = await createClient();
  const { data: docs, error } = await supabase
    .from("procedure_documents")
    .select(
      "id, created_at, cancelled_at, cancel_reason, queue_entries(attendance_code), professionals(profiles(full_name))",
    )
    .eq("clinic_id", clinicId)
    .eq("patient_id", patientId)
    .order("created_at", { ascending: false });

  if (error || !docs || docs.length === 0) return [];

  const ids = docs.map((d) => d.id as string);
  const { data: itens } = await supabase
    .from("procedure_document_items")
    .select("document_id, price_snapshot")
    .in("document_id", ids);

  const contagem = new Map<string, number>();
  const soma = new Map<string, number>();
  for (const it of itens ?? []) {
    const id = it.document_id as string;
    contagem.set(id, (contagem.get(id) ?? 0) + 1);
    soma.set(id, (soma.get(id) ?? 0) + Number(it.price_snapshot ?? 0));
  }

  return docs.map((d) => {
    const qe = Array.isArray(d.queue_entries) ? d.queue_entries[0] : d.queue_entries;
    const total = soma.get(d.id as string) ?? 0;
    return {
      id: d.id as string,
      createdAt: (d.created_at as string | null) ?? "",
      professionalName: nomeProfissional(d.professionals),
      totalItens: contagem.get(d.id as string) ?? 0,
      total,
      totalLabel: brl(total),
      atendimentoCodigo:
        ((qe as { attendance_code?: string | null } | null | undefined)
          ?.attendance_code as string | null) ?? null,
      cancelledAt: (d.cancelled_at as string | null) ?? null,
      cancelReason: (d.cancel_reason as string | null) ?? null,
    };
  });
}

/**
 * Um documento específico, para leitura/impressão. O id vem do client, então a
 * consulta é escopada por clínica ativa E paciente: documento de outra clínica
 * (ou outro paciente) simplesmente não é encontrado.
 */
export async function getProcedimentoDocPorId(
  patientId: string,
  documentId: string,
): Promise<ProcedimentoDocDetalhe | null> {
  const clinicId = await getActiveClinicId();
  if (!clinicId) return null;

  const supabase = await createClient();
  const { data: doc, error } = await supabase
    .from("procedure_documents")
    .select(
      "id, created_at, notes, queue_entries(attendance_code), professionals(profiles(full_name))",
    )
    .eq("id", documentId)
    .eq("clinic_id", clinicId)
    .eq("patient_id", patientId)
    .maybeSingle();

  if (error || !doc) return null;

  const { data: itensRows } = await supabase
    .from("procedure_document_items")
    .select("name_snapshot, price_snapshot, created_at")
    .eq("document_id", doc.id as string)
    .order("created_at", { ascending: true });

  const itens: ProcedimentoDocItem[] = (itensRows ?? []).map((r) => ({
    nome: (r.name_snapshot as string | null) ?? "—",
    valor: Number(r.price_snapshot ?? 0),
  }));
  const total = itens.reduce((acc, it) => acc + it.valor, 0);
  const qe = Array.isArray(doc.queue_entries) ? doc.queue_entries[0] : doc.queue_entries;

  return {
    id: doc.id as string,
    createdAt: (doc.created_at as string | null) ?? "",
    professionalName: nomeProfissional(doc.professionals),
    atendimentoCodigo:
      ((qe as { attendance_code?: string | null } | null | undefined)
        ?.attendance_code as string | null) ?? null,
    itens,
    total,
    totalLabel: brl(total),
    notes: (doc.notes as string | null) ?? "",
  };
}

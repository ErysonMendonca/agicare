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

/** Instrumental vinculado ao procedimento (catálogo, 0121: com esterilização). */
export type ProcedimentoDocInstrumental = {
  nome: string;
  sterilizationMethod: string | null;
  validityDate: string | null;
  lotCode: string | null;
};

/** Material (produto de estoque) vinculado ao procedimento. */
export type ProcedimentoDocMaterial = {
  nome: string;
  unidade: string;
  quantidade: number;
};

export type ProcedimentoDocItem = {
  nome: string;
  valor: number;
  /** Nota livre do registro (esterilização); null em documentos anteriores à 0120. */
  note: string | null;
  /** Materiais vinculados ao procedimento (catálogo) — [] se nenhum. */
  materiais: ProcedimentoDocMaterial[];
  /** Instrumentais vinculados ao procedimento (catálogo, 0121) — [] se nenhum. */
  instrumentos: ProcedimentoDocInstrumental[];
};

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
    .select("procedure_id, name_snapshot, price_snapshot, note_snapshot, created_at")
    .eq("document_id", doc.id as string)
    .order("created_at", { ascending: true });

  const procedureIds = Array.from(
    new Set(
      (itensRows ?? [])
        .map((r) => r.procedure_id as string | null)
        .filter((id): id is string => !!id),
    ),
  );

  // Materiais/instrumental vinculados aos procedimentos deste documento
  // (catálogo) — isolado: se a migration 0117/0121 não foi aplicada, a
  // leitura falha sem derrubar o documento.
  const one = <T,>(v: T | T[] | null | undefined): T | undefined =>
    Array.isArray(v) ? v[0] : (v ?? undefined);

  const instrumentosPorProc = new Map<string, ProcedimentoDocInstrumental[]>();
  const materiaisPorProc = new Map<string, ProcedimentoDocMaterial[]>();

  if (procedureIds.length > 0) {
    const [instrRes, matsRes] = await Promise.all([
      supabase
        .from("procedure_instruments")
        .select(
          "procedure_id, attendance_options(label, sterilization_method, validity_date, lot_code)",
        )
        .in("procedure_id", procedureIds),
      supabase
        .from("procedure_materials")
        .select("procedure_id, quantity, stock_products(name, unit)")
        .in("procedure_id", procedureIds),
    ]);

    for (const r of (instrRes.data ?? []) as {
      procedure_id: string;
      attendance_options:
        | {
            label: string;
            sterilization_method: string | null;
            validity_date: string | null;
            lot_code: string | null;
          }
        | {
            label: string;
            sterilization_method: string | null;
            validity_date: string | null;
            lot_code: string | null;
          }[]
        | null;
    }[]) {
      const opt = one(r.attendance_options);
      if (!opt) continue;
      const lista = instrumentosPorProc.get(r.procedure_id) ?? [];
      lista.push({
        nome: opt.label,
        sterilizationMethod: opt.sterilization_method ?? null,
        validityDate: opt.validity_date ?? null,
        lotCode: opt.lot_code ?? null,
      });
      instrumentosPorProc.set(r.procedure_id, lista);
    }

    for (const r of (matsRes.data ?? []) as {
      procedure_id: string;
      quantity: number | null;
      stock_products: { name: string; unit: string | null } | { name: string; unit: string | null }[] | null;
    }[]) {
      const prod = one(r.stock_products);
      if (!prod) continue;
      const lista = materiaisPorProc.get(r.procedure_id) ?? [];
      lista.push({
        nome: prod.name,
        unidade: prod.unit ?? "un",
        quantidade: Number(r.quantity ?? 1),
      });
      materiaisPorProc.set(r.procedure_id, lista);
    }
  }

  const itens: ProcedimentoDocItem[] = (itensRows ?? []).map((r) => {
    const procId = r.procedure_id as string | null;
    return {
      nome: (r.name_snapshot as string | null) ?? "—",
      valor: Number(r.price_snapshot ?? 0),
      note: (r.note_snapshot as string | null) ?? null,
      materiais: procId ? (materiaisPorProc.get(procId) ?? []) : [],
      instrumentos: procId ? (instrumentosPorProc.get(procId) ?? []) : [],
    };
  });
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

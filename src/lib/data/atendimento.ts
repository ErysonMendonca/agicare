import { createClient } from "@/lib/supabase/server";
import { getActiveClinicId } from "@/lib/tenant";

/** Instrumental vinculado a um procedimento do catálogo (0121: com esterilização). */
export type InstrumentalDoProcedimento = {
  id: string;
  nome: string;
  sterilizationMethod: string | null;
  validityDate: string | null;
  lotCode: string | null;
};

/** Material (produto de estoque) vinculado a um procedimento do catálogo. */
export type MaterialDoProcedimento = {
  id: string;
  nome: string;
  unidade: string;
  quantidade: number;
};

/** Procedimento do catálogo (para o médico escolher). */
export type ProcedimentoCatalogo = {
  id: string;
  nome: string;
  preco: number;
  /** Instrumentais vinculados (0121) — [] se nenhum ou se a migration não foi aplicada. */
  instrumentos: InstrumentalDoProcedimento[];
  /** Materiais (produtos de estoque) vinculados, com a quantidade consumida por execução. */
  materiais: MaterialDoProcedimento[];
};

/** Procedimento já registrado no atendimento. */
export type ProcedimentoExecutado = {
  id: string;
  nome: string;
  valor: number;
  note: string | null;
};

/** Atendimento ativo do paciente (em atendimento ou aguardando pagamento). */
export type AtendimentoAtivo = {
  queueEntryId: string;
  statusRaw: string;
  atendimentoCodigo: string | null;
};

const fmt = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const MOCK_CATALOGO: ProcedimentoCatalogo[] = [
  { id: "p1", nome: "Consulta Cardiológica", preco: 350, instrumentos: [], materiais: [] },
  { id: "p2", nome: "Eletrocardiograma", preco: 120, instrumentos: [], materiais: [] },
  { id: "p3", nome: "Teste Ergométrico", preco: 280, instrumentos: [], materiais: [] },
];

/**
 * Catálogo de procedimentos ativos (id + nome + preço), já com os
 * instrumentais (0121: esterilização/validade/lote) e materiais vinculados a
 * cada um — usado para exibir o painel informativo na tela de Procedimento
 * do prontuário ao selecionar o procedimento.
 */
export async function listCatalogoProcedimentos(): Promise<ProcedimentoCatalogo[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("procedures")
    .select("id, name, price, active")
    .order("name", { ascending: true });
  if (error || !data) return [];

  const procedureIds = data.map((p) => p.id as string);

  // Instrumentais (junção com attendance_options, category='instrumental') e
  // materiais (junção com stock_products) — isolados: se a migration 0117/
  // 0121 ainda não foi aplicada, a leitura falha sem derrubar o catálogo.
  const instrPromise =
    procedureIds.length === 0
      ? Promise.resolve({ data: null as unknown[] | null })
      : supabase
          .from("procedure_instruments")
          .select(
            "procedure_id, attendance_options(id, label, sterilization_method, validity_date, lot_code)",
          )
          .in("procedure_id", procedureIds);
  const matsPromise =
    procedureIds.length === 0
      ? Promise.resolve({ data: null as unknown[] | null })
      : supabase
          .from("procedure_materials")
          .select("procedure_id, quantity, stock_products(id, name, unit)")
          .in("procedure_id", procedureIds);

  const [instrRes, matsRes] = await Promise.all([instrPromise, matsPromise]);

  const one = <T,>(v: T | T[] | null | undefined): T | undefined =>
    Array.isArray(v) ? v[0] : (v ?? undefined);

  const instrumentosPorProc = new Map<string, InstrumentalDoProcedimento[]>();
  for (const r of (instrRes.data ?? []) as {
    procedure_id: string;
    attendance_options:
      | {
          id: string;
          label: string;
          sterilization_method: string | null;
          validity_date: string | null;
          lot_code: string | null;
        }
      | {
          id: string;
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
      id: opt.id,
      nome: opt.label,
      sterilizationMethod: opt.sterilization_method ?? null,
      validityDate: opt.validity_date ?? null,
      lotCode: opt.lot_code ?? null,
    });
    instrumentosPorProc.set(r.procedure_id, lista);
  }

  const materiaisPorProc = new Map<string, MaterialDoProcedimento[]>();
  for (const r of (matsRes.data ?? []) as {
    procedure_id: string;
    quantity: number | null;
    stock_products:
      | { id: string; name: string; unit: string | null }
      | { id: string; name: string; unit: string | null }[]
      | null;
  }[]) {
    const prod = one(r.stock_products);
    if (!prod) continue;
    const lista = materiaisPorProc.get(r.procedure_id) ?? [];
    lista.push({
      id: prod.id,
      nome: prod.name,
      unidade: prod.unit ?? "un",
      quantidade: Number(r.quantity ?? 1),
    });
    materiaisPorProc.set(r.procedure_id, lista);
  }

  return data
    .filter((p) => p.active !== false)
    .map((p) => ({
      id: p.id as string,
      nome: (p.name as string | null) ?? "—",
      preco: Number(p.price ?? 0),
      instrumentos: instrumentosPorProc.get(p.id as string) ?? [],
      materiais: materiaisPorProc.get(p.id as string) ?? [],
    }));
}

/**
 * Atendimento ATIVO do paciente: a entrada de fila mais recente em
 * 'em_atendimento' ou 'aguardando_pagamento'. null se não houver.
 */
export async function getAtendimentoAtivo(
  patientId: string,
): Promise<AtendimentoAtivo | null> {

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("queue_entries")
    .select("id, status, attendance_code")
    .eq("patient_id", patientId)
    .in("status", ["em_atendimento", "aguardando_pagamento"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return {
    queueEntryId: data.id as string,
    statusRaw: (data.status as string | null) ?? "",
    atendimentoCodigo: (data.attendance_code as string | null) ?? null,
  };
}

/** Procedimentos registrados no atendimento (com valor) + total. */
export async function listProcedimentosAtendimento(
  queueEntryId: string,
): Promise<{ itens: ProcedimentoExecutado[]; total: number; totalLabel: string }> {

  const clinicId = await getActiveClinicId();
  const supabase = await createClient();
  let query = supabase
    .from("procedure_executions")
    .select("id, amount, note, procedures(name)")
    .eq("queue_entry_id", queueEntryId)
    // Só os pendentes: procedimentos já fotografados num documento saem da lista.
    .is("document_id", null);
  // Defesa em profundidade: além da RLS, escopa pela clínica ativa.
  if (clinicId) query = query.eq("clinic_id", clinicId);
  const { data, error } = await query.order("created_at", { ascending: true });
  if (error || !data) return { itens: [], total: 0, totalLabel: fmt(0) };

  const one = <T,>(v: unknown): T | null =>
    Array.isArray(v) ? ((v[0] ?? null) as T | null) : ((v as T) ?? null);

  const itens: ProcedimentoExecutado[] = data.map((r) => {
    const proc = one<{ name: string | null }>(r.procedures);
    return {
      id: r.id as string,
      nome: proc?.name ?? "—",
      valor: Number(r.amount ?? 0),
      note: (r.note as string | null) ?? null,
    };
  });
  const total = itens.reduce((s, i) => s + i.valor, 0);
  return { itens, total, totalLabel: fmt(total) };
}

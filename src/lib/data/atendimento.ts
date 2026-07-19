import { createClient } from "@/lib/supabase/server";
import { getActiveClinicId } from "@/lib/tenant";

/** Procedimento do catálogo (para o médico escolher). */
export type ProcedimentoCatalogo = { id: string; nome: string; preco: number };

/** Procedimento já registrado no atendimento. */
export type ProcedimentoExecutado = {
  id: string;
  nome: string;
  valor: number;
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
  { id: "p1", nome: "Consulta Cardiológica", preco: 350 },
  { id: "p2", nome: "Eletrocardiograma", preco: 120 },
  { id: "p3", nome: "Teste Ergométrico", preco: 280 },
];

/** Catálogo de procedimentos ativos (id + nome + preço). */
export async function listCatalogoProcedimentos(): Promise<ProcedimentoCatalogo[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("procedures")
    .select("id, name, price, active")
    .order("name", { ascending: true });
  if (error || !data) return [];
  return data
    .filter((p) => p.active !== false)
    .map((p) => ({
      id: p.id as string,
      nome: (p.name as string | null) ?? "—",
      preco: Number(p.price ?? 0),
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
    .select("id, amount, procedures(name)")
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
    };
  });
  const total = itens.reduce((s, i) => s + i.valor, 0);
  return { itens, total, totalLabel: fmt(total) };
}

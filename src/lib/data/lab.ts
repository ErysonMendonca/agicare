import { createClient } from "@/lib/supabase/server";

export type LabStatus = "em_andamento" | "pendente" | "finalizado";

/** Etapas do processo (Kanban). */
export type LabEtapa = "entrada" | "processamento" | "refinamento" | "conclusao";

export type CasoLab = {
  id: string;
  codigo: string;
  paciente: string;
  tipo: string;
  status: LabStatus;
  urgente: boolean;
  prazo: string;
  /** Prazo em ISO (YYYY-MM-DD) para filtros por intervalo de datas. */
  prazoIso: string | null;
  /** Etapa do processo: persistida (Kanban) ou derivada do status. */
  etapa: LabEtapa;
};

/**
 * Deriva a etapa do processo a partir do status do caso.
 * pendente → Entrada · em andamento → Processamento (urgente: Refinamento) · finalizado → Conclusão.
 */
function derivarEtapa(status: LabStatus, urgente: boolean): LabEtapa {
  if (status === "finalizado") return "conclusao";
  if (status === "pendente") return "entrada";
  return urgente ? "refinamento" : "processamento";
}

/** Formata uma data ISO (YYYY-MM-DD) para o padrão pt-BR (DD/MM/AAAA). */
function formatarPrazo(due: string | null): string {
  if (!due) return "—";
  const d = new Date(`${due}T00:00:00`);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR");
}

/** Mock usado no modo demo (espelha o estilo do Figma). */

/** Lista casos do laboratório: do banco quando configurado, mock no modo demo. */
export async function listLabCases(): Promise<CasoLab[]> {

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("lab_cases")
    .select("id, code, type, status, urgent, due_date, stage, patients(full_name)")
    .order("created_at", { ascending: false });

  if (error || !data) return [];

  return data.map((c) => {
    const paciente = Array.isArray(c.patients) ? c.patients[0] : c.patients;
    const status = (c.status ?? "pendente") as LabStatus;
    const urgente = !!c.urgent;
    // Etapa persistida (transição manual no Kanban) tem prioridade; sem ela,
    // deriva-se do status (compatível com casos antigos sem stage).
    const stage = (c.stage as LabEtapa | null) ?? derivarEtapa(status, urgente);
    return {
      id: c.id,
      codigo: c.code ?? "—",
      paciente: paciente?.full_name ?? "—",
      tipo: c.type ?? "—",
      status,
      urgente,
      prazo: formatarPrazo(c.due_date),
      prazoIso: c.due_date ?? null,
      etapa: stage,
    };
  });
}

// ════════════════════════════════════════════════════════════════
// Módulo Financeiro do Laboratório (gestor-only).
// ════════════════════════════════════════════════════════════════

export type LabPaymentStatus = "orcado" | "aprovado" | "faturado" | "pago";

export type LabFinanceRow = {
  id: string;
  codigo: string;
  paciente: string;
  tipo: string;
  valorBase: number;
  adicionais: number;
  descontos: number;
  total: number;
  statusPagamento: LabPaymentStatus;
};

export type LabFinanceResumo = {
  orcado: number;
  aprovado: number;
  faturado: number;
  pago: number;
  total: number;
};

/** Formata um número em moeda R$ pt-BR. */
function formatBRL(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

/** Agrega o resumo financeiro a partir das linhas (por status de pagamento). */
export function resumirFinanceiroLab(rows: LabFinanceRow[]): LabFinanceResumo {
  const resumo: LabFinanceResumo = {
    orcado: 0,
    aprovado: 0,
    faturado: 0,
    pago: 0,
    total: 0,
  };
  for (const r of rows) {
    resumo[r.statusPagamento] += r.total;
    resumo.total += r.total;
  }
  return resumo;
}

/** Formata um valor numérico do laboratório em R$ pt-BR (reexport utilitário). */
export function formatLabBRL(value: number): string {
  return formatBRL(value);
}

/** Lista o financeiro dos casos: do banco quando configurado, mock no modo demo. */
export async function listLabFinance(): Promise<LabFinanceRow[]> {

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("lab_cases")
    .select(
      "id, code, type, price_base, additions, discounts, total, payment_status, patients(full_name)",
    )
    .order("created_at", { ascending: false });

  if (error || !data) return [];

  return data.map((c) => {
    const paciente = Array.isArray(c.patients) ? c.patients[0] : c.patients;
    return {
      id: c.id,
      codigo: c.code ?? "—",
      paciente: paciente?.full_name ?? "—",
      tipo: c.type ?? "—",
      valorBase: Number(c.price_base ?? 0),
      adicionais: Number(c.additions ?? 0),
      descontos: Number(c.discounts ?? 0),
      total: Number(c.total ?? 0),
      statusPagamento: (c.payment_status ?? "orcado") as LabPaymentStatus,
    };
  });
}

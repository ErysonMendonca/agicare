import { createClient } from "@/lib/supabase/server";
import type {
  ExamCategoria,
  ExamStatus,
  ExamOrder,
} from "@/lib/clinico/exames-shared";

// Constantes e tipos vivem em módulo client-safe (sem next/headers),
// reexportados aqui para os consumidores existentes.
export { EXAMES_TUSS } from "@/lib/clinico/exames-shared";
export type {
  ExamCategoria,
  ExamStatus,
  ExamOrder,
  TussExame,
} from "@/lib/clinico/exames-shared";

const CATEGORIAS: ReadonlySet<string> = new Set(["laboratorial", "imagem"]);
const STATUSES: ReadonlySet<string> = new Set(["solicitado", "concluido"]);

function normCategoria(v: unknown): ExamCategoria {
  return CATEGORIAS.has(v as string) ? (v as ExamCategoria) : "laboratorial";
}

function normStatus(v: unknown): ExamStatus {
  return STATUSES.has(v as string) ? (v as ExamStatus) : "solicitado";
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

const DEMO_EXAMES: ExamOrder[] = [
  {
    id: "demo-exam-1",
    exame: "Hemograma completo",
    tuss: "40304361",
    categoria: "laboratorial",
    status: "solicitado",
    observacoes: "Coleta em jejum de 8h.",
    lateralidade: null,
    quando: "12/06/2026 09:15",
    cancelledAt: null,
    cancelReason: null,
  },
  {
    id: "demo-exam-2",
    exame: "Raio-X de tórax",
    tuss: "40901114",
    categoria: "imagem",
    status: "concluido",
    observacoes: null,
    lateralidade: "Bilateral",
    quando: "10/06/2026 14:40",
    cancelledAt: null,
    cancelReason: null,
  },
  {
    id: "demo-exam-3",
    exame: "TSH - Hormônio tireoestimulante",
    tuss: "40316105",
    categoria: "laboratorial",
    status: "solicitado",
    observacoes: "Avaliar função tireoidiana.",
    lateralidade: null,
    quando: "10/06/2026 14:38",
    cancelledAt: null,
    cancelReason: null,
  },
];

/**
 * Lista os pedidos de exame do paciente (mais recentes primeiro).
 * Resiliente: erro/sem permissão → lista vazia (não derruba a seção).
 */
export async function listExamOrders(patientId: string): Promise<ExamOrder[]> {

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("exam_orders")
    .select("id, exam_name, tuss_code, category, status, notes, laterality, created_at, cancelled_at, cancel_reason")
    .eq("patient_id", patientId)
    .order("created_at", { ascending: false });

  if (error || !data) return [];

  return data.map((r) => ({
    id: r.id as string,
    exame: (r.exam_name as string | null) ?? "—",
    tuss: (r.tuss_code as string | null) ?? null,
    categoria: normCategoria(r.category),
    status: normStatus(r.status),
    observacoes: (r.notes as string | null) ?? null,
    lateralidade: (r.laterality as string | null) ?? null,
    quando: fmtDataHora(r.created_at as string | null),
    cancelledAt: (r.cancelled_at as string | null) ?? null,
    cancelReason: (r.cancel_reason as string | null) ?? null,
  }));
}

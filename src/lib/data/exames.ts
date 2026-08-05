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

/**
 * Lista os pedidos de exame do paciente (mais recentes primeiro).
 * Resiliente: erro/sem permissão → lista vazia (não derruba a seção).
 */
export async function listExamOrders(patientId: string): Promise<ExamOrder[]> {

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("exam_orders")
    .select(
      // "profiles!created_by(...)" — hint via "!" (sintaxe suportada pelo
      // query-builder MySQL). O select original usava "profiles:created_by(...)"
      // (sintaxe de alias do PostgREST/Supabase), que o resolvedor de embeds
      // daqui não reconhece — a coluna via "!" some literalmente do nome da
      // tabela buscada no grafo de FKs, o embed nunca casa, a query falha com
      // "não tem relação com exam_orders no schema" e, como o erro só faz
      // `listExamOrders` cair no `if (error || !data) return []`, TODO pedido
      // de exame ficava invisível nesta aba (embora gravado no banco).
      "id, exam_name, tuss_code, category, status, notes, laterality, created_at, cancelled_at, cancel_reason, profiles!created_by(full_name), queue_entries(attendance_code)",
    )
    .eq("patient_id", patientId)
    .order("created_at", { ascending: false });

  if (error || !data) return [];

  return data.map((r) => {
    const profile = Array.isArray(r.profiles) ? r.profiles[0] : r.profiles;
    const qe = Array.isArray(r.queue_entries) ? r.queue_entries[0] : r.queue_entries;
    return {
      id: r.id as string,
      exame: (r.exam_name as string | null) ?? "—",
      tuss: (r.tuss_code as string | null) ?? null,
      categoria: normCategoria(r.category),
      status: normStatus(r.status),
      observacoes: (r.notes as string | null) ?? null,
      lateralidade: (r.laterality as string | null) ?? null,
      quando: fmtDataHora(r.created_at as string | null),
      profissional: (profile as { full_name: string | null } | null)?.full_name ?? "—",
      atendimentoCodigo: (qe?.attendance_code as string | null) ?? null,
      cancelledAt: (r.cancelled_at as string | null) ?? null,
      cancelReason: (r.cancel_reason as string | null) ?? null,
    };
  });
}

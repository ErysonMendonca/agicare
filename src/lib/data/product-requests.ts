import { createClient } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/supabase/config";
import {
  STATUS_MAP,
  type SolicitacaoProduto,
  type StatusSolicitacaoRaw,
} from "@/lib/data/product-requests.shared";

// Reexporta o contrato compartilhado (constantes/tipos client-safe).
export {
  SETORES,
  STATUS_MAP,
  type Setor,
  type StatusSolicitacaoRaw,
  type ItemSolicitacao,
  type SolicitacaoProduto,
} from "@/lib/data/product-requests.shared";

function fmtDataHora(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  });
}

const MOCK: SolicitacaoProduto[] = [
  {
    id: "sol-1",
    codigo: "SOL-2026-0001",
    setor: "Recepção",
    status: STATUS_MAP.pendente,
    statusRaw: "pendente",
    urgente: true,
    observacoes: "Reposição semanal.",
    solicitante: "Recepção",
    criadaEm: "02/07/2026 09:15",
    atendidaPor: null,
    atendidaEm: null,
    itens: [
      { nome: "Papel A4 (resma)", unidade: "resma", quantidade: 5 },
      { nome: "Álcool gel 500ml", unidade: "unidade", quantidade: 3 },
    ],
  },
  {
    id: "sol-2",
    codigo: "SOL-2026-0002",
    setor: "Médico",
    status: STATUS_MAP.atendida,
    statusRaw: "atendida",
    urgente: false,
    observacoes: null,
    solicitante: "Dr. Carlos Eduardo",
    criadaEm: "01/07/2026 14:40",
    atendidaPor: "Farmácia",
    atendidaEm: "01/07/2026 16:10",
    itens: [{ nome: "Luva Cirúrgica nº 7,5", unidade: "caixa", quantidade: 2 }],
  },
];

/**
 * Lista as solicitações de produtos da clínica ativa (mais recentes primeiro).
 * RLS escopa por clínica; qualquer staff enxerga. Em demo, retorna o MOCK.
 */
export async function listSolicitacoes(): Promise<SolicitacaoProduto[]> {
  if (isDemoMode()) return MOCK;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("product_requests")
    .select(
      "id, code, setor, status, urgent, notes, created_at, attended_at, " +
        "requester:profiles!requested_by(full_name), " +
        "attendant:profiles!attended_by(full_name), " +
        "product_request_items(product_name, unit, quantity_num)",
    )
    .order("created_at", { ascending: false });

  if (error || !data) return [];

  const one = <T,>(v: unknown): T | null =>
    Array.isArray(v) ? ((v[0] ?? null) as T | null) : ((v as T) ?? null);

  // O duplo embed em profiles (requester/attendant) degrada a inferência do
  // supabase-js; tipamos a linha explicitamente (o runtime já está correto).
  type SolicRow = {
    id: string;
    code: string | null;
    setor: string | null;
    status: string | null;
    urgent: boolean | null;
    notes: string | null;
    created_at: string | null;
    attended_at: string | null;
    requester: unknown;
    attendant: unknown;
    product_request_items:
      | { product_name: string | null; unit: string | null; quantity_num: number | null }[]
      | null;
  };

  return (data as unknown as SolicRow[]).map((r) => {
    const statusRaw = (r.status as StatusSolicitacaoRaw) ?? "pendente";
    const requester = one<{ full_name: string | null }>(r.requester);
    const attendant = one<{ full_name: string | null }>(r.attendant);
    const itensRaw = Array.isArray(r.product_request_items)
      ? r.product_request_items
      : [];
    return {
      id: r.id as string,
      codigo: (r.code as string | null) ?? "—",
      setor: (r.setor as string | null) ?? "—",
      status: STATUS_MAP[statusRaw] ?? STATUS_MAP.pendente,
      statusRaw,
      urgente: !!r.urgent,
      observacoes: (r.notes as string | null) ?? null,
      solicitante: requester?.full_name ?? (r.setor as string | null) ?? "—",
      criadaEm: fmtDataHora((r.created_at as string | null) ?? null),
      atendidaPor: attendant?.full_name ?? null,
      atendidaEm: r.attended_at ? fmtDataHora(r.attended_at as string) : null,
      itens: itensRaw.map((it) => ({
        nome: (it.product_name as string | null) ?? "—",
        unidade: (it.unit as string | null) ?? "",
        quantidade: Number(it.quantity_num ?? 0),
      })),
    };
  });
}

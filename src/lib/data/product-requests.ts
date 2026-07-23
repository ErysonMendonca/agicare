import { createClient } from "@/lib/supabase/server";
import {
  STATUS_MAP,
  type SolicitacaoProduto,
  type StatusSolicitacaoRaw,
  type SetorFornecedorOption,
} from "@/lib/data/product-requests.shared";
import type { CatalogoItem } from "@/lib/data/produto-catalogos";

// Reexporta o contrato compartilhado (constantes/tipos client-safe).
export {
  SETORES,
  STATUS_MAP,
  type Setor,
  type StatusSolicitacaoRaw,
  type ItemSolicitacao,
  type SolicitacaoProduto,
  type SetorFornecedorOption,
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
    setorFornecedor: "Farmácia Satélite",
    urgente: true,
    observacoes: "Reposição semanal.",
    solicitante: "Recepção",
    criadaEm: "02/07/2026 09:15",
    atendidaPor: null,
    atendidaEm: null,
    itens: [
      { id: "sol-1-item-1", productId: null, nome: "Papel A4 (resma)", unidade: "resma", quantidade: 5, quantidadeAtendida: 0 },
      { id: "sol-1-item-2", productId: null, nome: "Álcool gel 500ml", unidade: "unidade", quantidade: 3, quantidadeAtendida: 0 },
    ],
  },
  {
    id: "sol-2",
    codigo: "SOL-2026-0002",
    setor: "Médico",
    status: STATUS_MAP.atendida,
    statusRaw: "atendida",
    setorFornecedor: "Almoxarifado",
    urgente: false,
    observacoes: null,
    solicitante: "Dr. Carlos Eduardo",
    criadaEm: "01/07/2026 14:40",
    atendidaPor: "Farmácia",
    atendidaEm: "01/07/2026 16:10",
    itens: [
      { id: "sol-2-item-1", productId: null, nome: "Luva Cirúrgica nº 7,5", unidade: "caixa", quantidade: 2, quantidadeAtendida: 2 },
    ],
  },
];

/**
 * Lista as solicitações de produtos da clínica ativa (mais recentes primeiro).
 * RLS escopa por clínica; qualquer staff enxerga. Em demo, retorna o MOCK.
 */
export async function listSolicitacoes(
  opts: { setor?: string; apenasHoje?: boolean } = {},
): Promise<SolicitacaoProduto[]> {

  const supabase = await createClient();
  let query = supabase
    .from("product_requests")
    .select(
      "id, code, setor, supplier_sector, status, urgent, notes, created_at, attended_at, " +
        "requester:profiles!requested_by(full_name), " +
        "attendant:profiles!attended_by(full_name), " +
        "product_request_items(id, product_id, product_name, unit, quantity_num, quantity_atendida)",
    )
    .order("created_at", { ascending: false });

  // Tela do solicitante: escopa ao próprio setor (não expõe pedidos de outros
  // setores). Sem opts (ex.: aba do Estoque que ATENDE), retorna todos.
  if (opts.setor) query = query.eq("setor", opts.setor);

  const { data, error } = await query;
  if (error || !data) return [];

  // Apenas os pedidos de HOJE (fuso America/Sao_Paulo) quando solicitado — evita
  // a lista crescer indefinidamente na tela do solicitante.
  let rows = data as unknown as SolicRow[];
  if (opts.apenasHoje) {
    const diaSP = (iso: string | null) =>
      iso
        ? new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" })
        : "";
    const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
    rows = rows.filter((r) => diaSP(r.created_at) === hoje);
  }

  const one = <T,>(v: unknown): T | null =>
    Array.isArray(v) ? ((v[0] ?? null) as T | null) : ((v as T) ?? null);

  // O duplo embed em profiles (requester/attendant) degrada a inferência do
  // supabase-js; tipamos a linha explicitamente (o runtime já está correto).
  type SolicRow = {
    id: string;
    code: string | null;
    setor: string | null;
    supplier_sector: string | null;
    status: string | null;
    urgent: boolean | null;
    notes: string | null;
    created_at: string | null;
    attended_at: string | null;
    requester: unknown;
    attendant: unknown;
    product_request_items:
      | {
          id: string;
          product_id: string | null;
          product_name: string | null;
          unit: string | null;
          quantity_num: number | null;
          quantity_atendida: number | null;
        }[]
      | null;
  };

  return rows.map((r) => {
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
      setorFornecedor: (r.supplier_sector as string | null) ?? null,
      urgente: !!r.urgent,
      observacoes: (r.notes as string | null) ?? null,
      solicitante: requester?.full_name ?? (r.setor as string | null) ?? "—",
      criadaEm: fmtDataHora((r.created_at as string | null) ?? null),
      atendidaPor: attendant?.full_name ?? null,
      atendidaEm: r.attended_at ? fmtDataHora(r.attended_at as string) : null,
      itens: itensRaw.map((it) => ({
        id: it.id as string,
        productId: (it.product_id as string | null) ?? null,
        nome: (it.product_name as string | null) ?? "—",
        unidade: (it.unit as string | null) ?? "",
        quantidade: Number(it.quantity_num ?? 0),
        quantidadeAtendida: Number(it.quantity_atendida ?? 0),
      })),
    };
  });
}

/** Uma solicitação específica (para a página dedicada de atendimento). */
export async function getSolicitacao(
  id: string,
): Promise<SolicitacaoProduto | null> {
  const todas = await listSolicitacoes();
  return todas.find((s) => s.id === id) ?? null;
}

/** Item de linha de um atendimento (dispensação) já registrado para a
 * solicitação — histórico de bipagens/atendimentos parciais anteriores. */
export type LinhaHistoricoAtendimento = {
  nome: string;
  quantidade: number;
  unidade: string;
};

export type AtendimentoHistorico = {
  id: string;
  codigo: string;
  criadoEm: string;
  itens: LinhaHistoricoAtendimento[];
};

/**
 * Histórico de atendimentos (dispensações) já vinculados a esta solicitação
 * — cada "Salvar"/"Encerrar" no fluxo de atendimento gera uma dispensação
 * (0118). Mostra quem/quando/quanto foi dado baixa em cada passagem.
 */
export async function listAtendimentosSolicitacao(
  requestId: string,
): Promise<AtendimentoHistorico[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("dispensations")
    .select(
      "id, code, created_at, dispensation_items(name, quantity_num, quantity)",
    )
    .eq("product_request_id", requestId)
    .order("created_at", { ascending: true });

  if (error || !data) return [];

  return data.map((d) => {
    const itens = Array.isArray(d.dispensation_items) ? d.dispensation_items : [];
    return {
      id: d.id as string,
      codigo: (d.code as string | null) ?? "—",
      criadoEm: fmtDataHora((d.created_at as string | null) ?? null),
      itens: itens.map((it: any) => {
        const qtd = Number(it.quantity_num ?? 0);
        const texto = (it.quantity as string | null) ?? "";
        const unidade = texto.replace(/^[\d.,\s]+/, "").trim();
        return {
          nome: (it.name as string | null) ?? "—",
          quantidade: qtd,
          unidade,
        };
      }),
    };
  });
}

// ════════════════════════════════════════════════════════════════
// Catálogo de SETOR FORNECEDOR (attendance_options, category='setor_fornecedor').
// Lista PLANA (sem parent_id). Espelha o padrão de leitura de alta.ts.
// RLS escopa por clínica.
// ════════════════════════════════════════════════════════════════

/** Setores fornecedores ATIVOS da clínica (p/ o Select do modal), ordenados. */
export async function listSetoresFornecedor(): Promise<SetorFornecedorOption[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("attendance_options")
    .select("id, label, value, active, sort_order")
    .eq("category", "setor_fornecedor")
    .eq("active", true)
    .order("sort_order", { ascending: true })
    .order("label", { ascending: true });

  if (error || !data) return [];

  return (data as {
    id: string;
    label: string;
    value: string;
    active: boolean | null;
    sort_order: number | null;
  }[]).map((row) => ({
    id: row.id,
    label: row.label,
    value: row.value,
    sortOrder: row.sort_order ?? 0,
    active: row.active ?? true,
  }));
}

/** Todos os setores fornecedores (ativos + inativos) p/ a tela de Configurações. */
export async function listSetoresFornecedorConfig(): Promise<CatalogoItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("attendance_options")
    .select("id, label, active, sort_order")
    .eq("category", "setor_fornecedor")
    .order("sort_order", { ascending: true })
    .order("label", { ascending: true });

  if (error || !data) return [];

  return (data as {
    id: string;
    label: string;
    active: boolean | null;
    sort_order: number | null;
  }[]).map((row) => ({
    id: row.id,
    label: row.label,
    active: row.active ?? true,
    sortOrder: row.sort_order ?? 0,
  }));
}

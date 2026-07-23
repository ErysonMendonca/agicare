import { type Status } from "@/components/ui/Badge";

/** Setores que podem solicitar produtos (lista fixa — não há papel "farmácia"). */
export const SETORES = ["Farmácia", "Recepção", "Médico"] as const;
export type Setor = (typeof SETORES)[number];

/**
 * Setor fornecedor (catálogo por clínica em attendance_options,
 * category='setor_fornecedor'). Opção ATIVA para o Select do modal.
 */
export type SetorFornecedorOption = {
  id: string;
  label: string;
  value: string;
  sortOrder: number;
  active: boolean;
};

export type StatusSolicitacaoRaw =
  | "pendente"
  | "atendida_parcial"
  | "atendida"
  | "cancelada";

export const STATUS_MAP: Record<
  StatusSolicitacaoRaw,
  { label: string; tone: Status }
> = {
  pendente: { label: "Pendente", tone: "warn" },
  atendida_parcial: { label: "Parcial", tone: "wait" },
  atendida: { label: "Atendida", tone: "active" },
  cancelada: { label: "Cancelada", tone: "danger" },
};

export type ItemSolicitacao = {
  /** id da linha (product_request_items.id) — alvo do atendimento por linha. */
  id: string;
  /** Produto de estoque de origem — base da baixa ao atender/dispensar. NULL se
   * o produto foi removido do catálogo (item desnormalizado sobrevive). */
  productId: string | null;
  nome: string;
  unidade: string;
  quantidade: number;
  /** Quantidade já dada baixa (cumulativa) para este item — 0119. Permite
   * atendimento parcial em múltiplas passagens (bipagem ou digitação). */
  quantidadeAtendida: number;
};

export type SolicitacaoProduto = {
  id: string;
  codigo: string;
  setor: string;
  status: { label: string; tone: Status };
  statusRaw: StatusSolicitacaoRaw;
  setorFornecedor: string | null;
  urgente: boolean;
  observacoes: string | null;
  solicitante: string;
  criadaEm: string;
  atendidaPor: string | null;
  atendidaEm: string | null;
  itens: ItemSolicitacao[];
};

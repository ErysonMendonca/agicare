import { type Status } from "@/components/ui/Badge";

/** Setores que podem solicitar produtos (lista fixa — não há papel "farmácia"). */
export const SETORES = ["Farmácia", "Recepção", "Médico"] as const;
export type Setor = (typeof SETORES)[number];

export type StatusSolicitacaoRaw = "pendente" | "atendida" | "cancelada";

export const STATUS_MAP: Record<
  StatusSolicitacaoRaw,
  { label: string; tone: Status }
> = {
  pendente: { label: "Pendente", tone: "warn" },
  atendida: { label: "Atendida", tone: "active" },
  cancelada: { label: "Cancelada", tone: "danger" },
};

export type ItemSolicitacao = {
  nome: string;
  unidade: string;
  quantidade: number;
};

export type SolicitacaoProduto = {
  id: string;
  codigo: string;
  setor: string;
  status: { label: string; tone: Status };
  statusRaw: StatusSolicitacaoRaw;
  urgente: boolean;
  observacoes: string | null;
  solicitante: string;
  criadaEm: string;
  atendidaPor: string | null;
  atendidaEm: string | null;
  itens: ItemSolicitacao[];
};

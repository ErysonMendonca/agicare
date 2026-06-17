import { createClient } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/supabase/config";

export type Procedimento = {
  codigo: string;
  nome: string;
  descricao: string;
  categoria: string;
  duracao: string;
  valor: string;
  /** Valor numérico bruto (para cálculo do ticket médio). */
  precoNum: number;
  margem: string;
  /** Margem numérica bruta em % (para cálculo da margem média). */
  margemNum: number;
  ativo: boolean;
  status: string;
};

/** Formata número para moeda brasileira (R$ pt-BR). */
const moedaBR = (v: number) =>
  v.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

/** Monta o shape da tabela a partir dos campos brutos. */
function toProcedimento(p: {
  code?: string | null;
  name?: string | null;
  description?: string | null;
  category?: string | null;
  duration_min?: number | null;
  price?: number | null;
  margin_pct?: number | null;
  active?: boolean | null;
}): Procedimento {
  const preco = Number(p.price ?? 0);
  const margem = Number(p.margin_pct ?? 0);
  const duracao = Number(p.duration_min ?? 0);
  const ativo = !!p.active;
  return {
    codigo: p.code ?? "",
    nome: p.name ?? "",
    descricao: p.description ?? "",
    categoria: p.category ?? "—",
    duracao: `${duracao}min`,
    valor: moedaBR(preco),
    precoNum: preco,
    margem: `${margem}%`,
    margemNum: margem,
    ativo,
    status: ativo ? "Ativo" : "Inativo",
  };
}

/** Mock usado no modo demo (espelha o Figma). */
const MOCK: Procedimento[] = [
  {
    code: "PROC001",
    name: "Limpeza de Pele Profunda",
    description: "Limpeza facial completa com peeling de diamante...",
    category: "Facial",
    duration_min: 85,
    price: 250,
    margin_pct: 32,
    active: true,
  },
  {
    code: "PROC002",
    name: "Aplicação de Toxina Botulínica",
    description: "Aplicação de toxina para suavização de...",
    category: "Injetáveis",
    duration_min: 55,
    price: 1200,
    margin_pct: 28,
    active: true,
  },
  {
    code: "PROC003",
    name: "Drenagem Linfática",
    description: "Sessão completa de drenagem linfática manual co...",
    category: "Corporal",
    duration_min: 60,
    price: 180,
    margin_pct: 38,
    active: true,
  },
].map(toProcedimento);

/** Lista procedimentos: do banco quando configurado, mock no modo demo. */
export async function listProcedures(): Promise<Procedimento[]> {
  if (isDemoMode()) return MOCK;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("procedures")
    .select(
      "code, name, description, category, duration_min, price, margin_pct, active",
    )
    .order("created_at", { ascending: false });

  if (error || !data) return [];

  return data.map(toProcedimento);
}

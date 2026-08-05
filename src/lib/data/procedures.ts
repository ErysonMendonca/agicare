import { createClient } from "@/lib/supabase/server";

export type Procedimento = {
  codigo: string;
  nome: string;
  descricao: string;
  categoria: string;
  duracao: string;
  /** Duração em minutos (bruto) — usado p/ preencher o slot da escala. */
  duracaoNum: number;
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
    duracaoNum: duracao,
    valor: moedaBR(preco),
    precoNum: preco,
    margem: `${margem}%`,
    margemNum: margem,
    ativo,
    status: ativo ? "Ativo" : "Inativo",
  };
}

/** Mock usado no modo demo (espelha o Figma). */

/** Lista procedimentos: do banco quando configurado, mock no modo demo. */
export async function listProcedures(): Promise<Procedimento[]> {

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

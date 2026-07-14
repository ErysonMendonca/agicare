// Contrato COMPARTILHADO da importação em massa de produtos (Excel).
// Sem dependências de servidor — importável por Client e Server Components e
// pela Server Action de bulk insert.

/** Colunas do modelo .xlsx que a clínica baixa e preenche. */
export const COLUNAS_MODELO = [
  "Descrição",
  "Unidade",
  "Quantidade",
  "Código de barras",
] as const;

/** Uma linha da grade de importação (planilha + campos preenchidos na tela). */
export type ProdutoImportRow = {
  /** Descrição/nome do produto (vem da planilha, editável na grade). */
  descricao: string;
  unidade: string;
  quantidade: number;
  codigoBarras: string;
  // Classificação (labels do catálogo product_categories) — obrigatórias.
  grupo: string;
  classificacao: string;
  subclassificacao: string;
  // Detalhes preenchidos na tela — opcionais (nem todo produto controla lote).
  lote: string;
  /** Validade em ISO yyyy-mm-dd (valor do <input type="date">) ou "". */
  validade: string;
};

/** Linha vazia (usada ao adicionar manualmente). */
export function linhaVazia(): ProdutoImportRow {
  return {
    descricao: "",
    unidade: "un",
    quantidade: 0,
    codigoBarras: "",
    grupo: "",
    classificacao: "",
    subclassificacao: "",
    lote: "",
    validade: "",
  };
}

/**
 * Uma linha está pronta para salvar quando tem Descrição e as 3 categorias.
 * Lote/Validade são opcionais (destaque na UI, mas não bloqueiam).
 */
export function linhaCompleta(r: ProdutoImportRow): boolean {
  return (
    r.descricao.trim().length >= 2 &&
    r.grupo.trim() !== "" &&
    r.classificacao.trim() !== "" &&
    r.subclassificacao.trim() !== ""
  );
}

export type ImportarProdutosResult =
  | { ok: true; inseridos: number }
  | { ok?: false; error: string };

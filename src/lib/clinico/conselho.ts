/**
 * Formatação do registro de conselho profissional — CLIENT-SAFE (sem
 * dependência de servidor). Compartilhado entre a leitura do profissional
 * logado (`data/profissional-atual`) e as camadas de dados que trazem o
 * AUTOR de um documento (receita, atestado, alta, evolução, anamnese) via
 * join `professionals(...)`.
 */

export type LinhaConselho = {
  council_name?: string | null;
  council_uf?: string | null;
  council_number?: string | null;
  council_reg?: string | null;
};

/**
 * "CRO-BA 12345" a partir dos campos detalhados (0070). Cai em `council_reg`
 * (campo legado, texto livre) quando o detalhado não foi preenchido. Retorna
 * "—" quando não há registro.
 */
export function formatarConselho(linha: LinhaConselho | null | undefined): string {
  const nome = linha?.council_name?.trim();
  const uf = linha?.council_uf?.trim();
  const numero = linha?.council_number?.trim();

  if (nome && numero) {
    const orgao = uf ? `${nome}-${uf}` : nome;
    return `${orgao} ${numero}`;
  }
  return linha?.council_reg?.trim() || "—";
}

/**
 * Normaliza o objeto `professionals(...)` (que o Supabase pode devolver como
 * array ou objeto) para uma única linha, extraindo os campos do conselho.
 */
export function extrairConselho(professionals: unknown): string {
  const prof = Array.isArray(professionals) ? professionals[0] : professionals;
  return formatarConselho(prof as LinhaConselho | null | undefined);
}

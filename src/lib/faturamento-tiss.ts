/**
 * Módulo CLIENT-SAFE de faturamento TISS.
 * Funções puras (sem import de servidor) — podem ser usadas tanto no
 * Server (actions) quanto no Client (download do XML gerado).
 * NÃO importa @/lib/supabase/server, @/lib/auth, @/lib/permissions, @/lib/tenant.
 */

/** Dados mínimos de uma guia para compor o lote XML TISS. */
export type GuiaXML = {
  numero: string;
  paciente: string;
  convenio: string;
  procedimento: string;
  valor: number;
};

/** Escapa caracteres especiais para conteúdo XML. */
function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Formata número com 2 casas decimais (ponto), padrão monetário TISS. */
function num2(value: number): string {
  return (Math.round(value * 100) / 100).toFixed(2);
}

/**
 * Monta o XML de um lote TISS (versão SIMPLIFICADA / didática — não é o
 * schema oficial da ANS, que exige assinatura e dezenas de campos).
 * STUB: gera conteúdo real e válido sintaticamente para download local;
 * não há transmissão a operadora.
 */
export function gerarLoteTissXML(params: {
  loteCodigo: string;
  convenio: string;
  guias: GuiaXML[];
  geradoEm?: Date;
}): string {
  const { loteCodigo, convenio, guias } = params;
  const geradoEm = params.geradoEm ?? new Date();
  const total = guias.reduce((acc, g) => acc + g.valor, 0);

  const guiasXml = guias
    .map(
      (g) => `    <ans:guiaSP-SADT>
      <ans:numeroGuiaPrestador>${esc(g.numero)}</ans:numeroGuiaPrestador>
      <ans:beneficiario>
        <ans:nomeBeneficiario>${esc(g.paciente)}</ans:nomeBeneficiario>
        <ans:convenio>${esc(g.convenio)}</ans:convenio>
      </ans:beneficiario>
      <ans:procedimento>
        <ans:descricaoProcedimento>${esc(g.procedimento)}</ans:descricaoProcedimento>
        <ans:valorTotal>${num2(g.valor)}</ans:valorTotal>
      </ans:procedimento>
    </ans:guiaSP-SADT>`,
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<!-- Lote TISS simplificado gerado pelo agicare (protótipo). NÃO é XML oficial ANS. -->
<ans:mensagemTISS xmlns:ans="http://www.ans.gov.br/padroes/tiss/schemas">
  <ans:cabecalho>
    <ans:identificacaoTransacao>
      <ans:tipoTransacao>ENVIO_LOTE_GUIAS</ans:tipoTransacao>
      <ans:numeroLote>${esc(loteCodigo)}</ans:numeroLote>
      <ans:dataRegistroTransacao>${geradoEm.toISOString()}</ans:dataRegistroTransacao>
    </ans:identificacaoTransacao>
    <ans:origem><ans:operadoraDestino>${esc(convenio)}</ans:operadoraDestino></ans:origem>
  </ans:cabecalho>
  <ans:prestadorParaOperadora>
    <ans:loteGuias>
      <ans:numeroLote>${esc(loteCodigo)}</ans:numeroLote>
      <ans:guiasTISS>
${guiasXml}
      </ans:guiasTISS>
    </ans:loteGuias>
  </ans:prestadorParaOperadora>
  <ans:epilogo>
    <ans:totalGuias>${guias.length}</ans:totalGuias>
    <ans:valorTotalLote>${num2(total)}</ans:valorTotalLote>
  </ans:epilogo>
</ans:mensagemTISS>
`;
}

/** Dispara o download de um arquivo XML no browser (client-side blob). */
export function baixarArquivoXML(nomeArquivo: string, conteudo: string): void {
  const blob = new Blob([conteudo], { type: "application/xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nomeArquivo.endsWith(".xml") ? nomeArquivo : `${nomeArquivo}.xml`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

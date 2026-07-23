import {
  abrirImpressao,
  esc,
  hojeBR,
  limpo,
  type ClinicaImpressao,
} from "@/lib/clinico/documento-impressao";

// ════════════════════════════════════════════════════════════════
// Impressão A4 do "ATENDIMENTO DA REQUISIÇÃO" — comprovante físico do
// atendimento de uma Solicitação de Produtos (setor ⇄ fornecedor interno),
// com DUAS assinaturas (requisitante + responsável pelo atendimento) para
// evitar divergências internas de quem retirou o quê. Modelo replica o
// layout de referência do cliente (cabeçalho da clínica, dados da
// requisição, tabela de itens e rodapé de assinaturas lado a lado).
// ════════════════════════════════════════════════════════════════

export type { ClinicaImpressao };

export type ItemImpressao = {
  produto: string;
  unidade: string;
  solicitada: number;
  atendida: number;
  lote: string;
  validade: string;
  situacao: string;
};

export type RequisicaoImpressao = {
  codigo: string;
  setorSolicitante: string;
  setorFornecedor: string;
  solicitante: string;
  situacao: string;
  motivo: string;
};

function fmtQtd(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(".", ",");
}

function cabecalhoRequisicaoHTML(clinica: ClinicaImpressao): string {
  const sub = [limpo(clinica.endereco), limpo(clinica.telefone)]
    .filter(Boolean)
    .join(" · ");
  return `
  <div class="topo">
    <div class="clinica-box">
      <div class="clinica">${esc(clinica.nome)}</div>
      ${sub ? `<div class="clinica-sub">${esc(sub)}</div>` : ""}
      ${limpo(clinica.cnpj) ? `<div class="clinica-sub">CNPJ: ${esc(clinica.cnpj)}</div>` : ""}
    </div>
  </div>`;
}

function identRequisicaoHTML(req: RequisicaoImpressao, dataHora: string): string {
  return `
  <table class="ident">
    <tr>
      <td class="lbl">Requisição N°</td><td class="val">${esc(req.codigo)}</td>
      <td class="lbl">Data</td><td class="val">${esc(dataHora)}</td>
    </tr>
    <tr>
      <td class="lbl">Solicitante</td><td class="val">${esc(req.setorSolicitante)} — ${esc(req.solicitante)}</td>
      <td class="lbl">Fornecedor</td><td class="val">${esc(req.setorFornecedor)}</td>
    </tr>
    <tr>
      <td class="lbl">Situação</td><td class="val">${esc(req.situacao)}</td>
      <td class="lbl">Motivo</td><td class="val">${esc(req.motivo)}</td>
    </tr>
  </table>`;
}

function tabelaItensHTML(itens: ItemImpressao[]): string {
  const linhas = itens
    .map(
      (it, idx) => `
    <tr>
      <td>${idx + 1}</td>
      <td>${esc(it.produto)}</td>
      <td>${esc(it.unidade)}</td>
      <td>${fmtQtd(it.solicitada)}</td>
      <td>${fmtQtd(it.atendida)}</td>
      <td>${esc(limpo(it.lote) || "—")}</td>
      <td>${esc(limpo(it.validade) || "—")}</td>
      <td>${esc(it.situacao)}</td>
    </tr>`,
    )
    .join("");
  return `
  <table class="itens">
    <thead>
      <tr>
        <th>Cód</th><th>Produto</th><th>Und</th><th>Solic.</th>
        <th>Atend.</th><th>Lote</th><th>Validade</th><th>Situação</th>
      </tr>
    </thead>
    <tbody>${linhas}</tbody>
  </table>`;
}

/** Rodapé com DUAS assinaturas lado a lado — requisitante e quem atendeu. */
function assinaturasHTML(solicitante: string, atendente: string): string {
  return `
  <div class="rodape">
    <div class="data">Local e data: ${esc(hojeBR())}</div>
    <div class="assinaturas">
      <div class="assin-col">
        <div class="assin-linha"></div>
        <div class="assin-nome">${esc(limpo(solicitante) || "—")}</div>
        <div class="assin-cargo">Requisitante</div>
      </div>
      <div class="assin-col">
        <div class="assin-linha"></div>
        <div class="assin-nome">${esc(limpo(atendente) || "—")}</div>
        <div class="assin-cargo">Responsável pelo Atendimento</div>
      </div>
    </div>
  </div>`;
}

const CSS = `
  * { box-sizing: border-box; }
  @page { size: A4; margin: 14mm; }
  html, body { height: 100%; }
  body { font-family: Arial, Helvetica, sans-serif; color: #111; margin: 0; line-height: 1.5; }
  .folha { display: flex; flex-direction: column; min-height: calc(297mm - 28mm); }

  .topo { display: flex; justify-content: space-between; gap: 16px; align-items: stretch; }
  .clinica-box { border: 1px solid #666; padding: 8px 12px; flex: 1; }
  .clinica { font-size: 15px; font-weight: bold; }
  .clinica-sub { font-size: 11px; color: #555; margin-top: 2px; }

  .titulo { text-align: center; font-size: 13px; font-weight: bold; letter-spacing: 1.5px; margin: 14px 0 10px; }

  table.ident { width: 100%; border-collapse: collapse; margin-bottom: 14px; }
  table.ident td { border: 1px solid #888; padding: 5px 8px; font-size: 12px; }
  table.ident td.lbl { color: #555; width: 90px; white-space: nowrap; }
  table.ident td.val { font-weight: 500; }

  table.itens { width: 100%; border-collapse: collapse; font-size: 12px; }
  table.itens th, table.itens td { border: 1px solid #888; padding: 6px 8px; text-align: left; }
  table.itens th { background: #f0f0f0; font-size: 11px; text-transform: uppercase; color: #444; }
  table.itens td:nth-child(1), table.itens td:nth-child(4), table.itens td:nth-child(5) { text-align: center; }

  .rodape { margin-top: auto; padding-top: 40px; }
  .data { font-size: 12px; margin-bottom: 40px; }
  .assinaturas { display: flex; justify-content: space-between; gap: 40px; }
  .assin-col { flex: 1; text-align: center; }
  .assin-linha { border-top: 1px solid #111; margin-bottom: 4px; }
  .assin-nome { font-size: 12px; font-weight: 600; }
  .assin-cargo { font-size: 11px; color: #555; }
`;

function montarDocumento(
  clinica: ClinicaImpressao,
  req: RequisicaoImpressao,
  itens: ItemImpressao[],
  atendente: string,
  dataHora: string,
): string {
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<title>Atendimento da Requisição — ${esc(req.codigo)}</title>
<style>${CSS}</style>
</head>
<body>
  <div class="folha">
    ${cabecalhoRequisicaoHTML(clinica)}
    <div class="titulo">ATENDIMENTO DA REQUISIÇÃO</div>
    ${identRequisicaoHTML(req, dataHora)}
    ${tabelaItensHTML(itens)}
    ${assinaturasHTML(req.solicitante, atendente)}
  </div>
</body>
</html>`;
}

/** Abre o comprovante de atendimento numa janela nova e dispara a impressão. */
export function imprimirAtendimentoRequisicao(
  clinica: ClinicaImpressao,
  req: RequisicaoImpressao,
  itens: ItemImpressao[],
  atendente: string,
): void {
  const dataHora = new Date().toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  abrirImpressao(
    montarDocumento(clinica, req, itens, atendente, dataHora),
    "Permita pop-ups para imprimir o comprovante de atendimento.",
  );
}

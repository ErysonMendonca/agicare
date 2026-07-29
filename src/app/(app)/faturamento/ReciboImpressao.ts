import {
  abrirImpressao,
  esc,
  identPacienteHTML,
  limpo,
  montarDocumentoBase,
  rodapeAssinaturaPaciente,
  type ClinicaImpressao,
} from "@/lib/clinico/documento-impressao";

// ════════════════════════════════════════════════════════════════
// Impressão A4 do RECIBO DE PAGAMENTO. Segue o mesmo modelo padrão dos
// documentos do prontuário (cabeçalho sem carimbo, título centralizado,
// identificação do paciente, corpo com moldura, rodapé de assinatura logo
// abaixo do conteúdo) — só que assinado pelo PACIENTE/responsável (recibo é
// documento de recepção/faturamento, não clínico), como a Ficha de
// Atendimento. Monta um HTML completo e abre numa JANELA NOVA (nunca troca
// o DOM da app viva).
// ════════════════════════════════════════════════════════════════

export type MaterialRecibo = { nome: string; unidade: string; quantidade: number };
export type InstrumentoRecibo = { nome: string };

export type ItemRecibo = {
  descricao: string;
  qtd: number;
  valor: number;
  /** Material do procedimento (catálogo) — [] quando não aplicável/vinculado. */
  materiais: MaterialRecibo[];
  /** Instrumental do procedimento (catálogo) — idem. */
  instrumentos: InstrumentoRecibo[];
};

export type CabecalhoRecibo = {
  clinica: ClinicaImpressao;
  paciente: string;
  /** Nº do atendimento (queue_entries.attendance_code) — NÃO o código interno do evento faturável. */
  atendimento: string;
  data: string;
  /** Rótulo já formatado da forma de cobrança/pagamento (ex.: "PIX", "Empresa"). */
  forma: string;
};

function formatBRL(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

function montarDocumento(
  cab: CabecalhoRecibo,
  itens: ItemRecibo[],
  desconto: number,
  acrescimo: number,
  total: number,
): string {
  const linhas =
    itens.length > 0
      ? itens
          .map((i) => {
            const detalhes: string[] = [];
            if (i.materiais.length > 0) {
              detalhes.push(
                `<span class="det-lbl">Material:</span> ${esc(
                  i.materiais
                    .map((m) => `${m.nome} (${m.quantidade} ${m.unidade})`)
                    .join(", "),
                )}`,
              );
            }
            if (i.instrumentos.length > 0) {
              detalhes.push(
                `<span class="det-lbl">Instrumental:</span> ${esc(
                  i.instrumentos.map((inst) => inst.nome).join(", "),
                )}`,
              );
            }
            const linhaDetalhe =
              detalhes.length > 0
                ? `<tr class="detalhe"><td colspan="4">${detalhes.join(" &middot; ")}</td></tr>`
                : "";
            return `
      <tr>
        <td>${esc(i.descricao)}</td>
        <td class="num">${i.qtd}</td>
        <td class="num">${esc(formatBRL(i.valor))}</td>
        <td class="num">${esc(formatBRL(i.valor * i.qtd))}</td>
      </tr>${linhaDetalhe}`;
          })
          .join("")
      : `<tr><td colspan="4" class="vazio">Nenhum item faturado.</td></tr>`;

  const linhaDesconto =
    desconto > 0
      ? `<tr class="ajuste-neg"><td colspan="3">Desconto</td><td class="num">-${esc(formatBRL(desconto))}</td></tr>`
      : "";
  const linhaAcrescimo =
    acrescimo > 0
      ? `<tr class="ajuste-pos"><td colspan="3">Acréscimo</td><td class="num">${esc(formatBRL(acrescimo))}</td></tr>`
      : "";

  const corpo = `
    <table class="itens">
      <thead>
        <tr>
          <th>Procedimento</th>
          <th class="num">Qtd</th>
          <th class="num">Valor Unit.</th>
          <th class="num">Valor Total</th>
        </tr>
      </thead>
      <tbody>
        ${linhas}
        ${linhaDesconto}
        ${linhaAcrescimo}
      </tbody>
      <tfoot>
        <tr>
          <td colspan="3">TOTAL PAGO</td>
          <td class="num">${esc(formatBRL(total))}</td>
        </tr>
      </tfoot>
    </table>
    <p class="forma">Forma de pagamento: <strong>${esc(cab.forma)}</strong></p>`;

  const ident = identPacienteHTML(cab.paciente, [
    { lbl: "Atendimento nº", val: limpo(cab.atendimento) || "—" },
    { lbl: "Data", val: limpo(cab.data) || "—" },
  ]);

  const cssExtra = `
    table.itens { width: 100%; border-collapse: collapse; font-size: 12px; }
    table.itens th, table.itens td { border: 1px solid #888; padding: 6px 8px; }
    table.itens th { background: #f4f4f4; text-align: left; font-weight: bold; }
    table.itens .num { text-align: right; }
    table.itens tfoot td { font-weight: bold; }
    table.itens tr.detalhe td { border-top: none; padding: 0 8px 6px; font-size: 10.5px; color: #555; }
    .det-lbl { font-weight: 600; color: #333; }
    .ajuste-neg td { color: #b91c1c; }
    .ajuste-pos td { color: #0f6b5c; }
    .vazio { text-align: center; color: #555; font-style: italic; }
    .forma { margin-top: 10px; font-size: 12px; }`;

  return montarDocumentoBase({
    titulo: "RECIBO DE PAGAMENTO",
    clinica: cab.clinica,
    pacienteNome: cab.paciente,
    identHTML: ident,
    corpoHTML: corpo,
    rodapeHTML: rodapeAssinaturaPaciente(),
    cssExtra,
  });
}

/** Abre o recibo numa janela nova e dispara a impressão (só o documento). */
export function imprimirRecibo(
  cab: CabecalhoRecibo,
  itens: ItemRecibo[],
  desconto: number,
  acrescimo: number,
  total: number,
): void {
  abrirImpressao(
    montarDocumento(cab, itens, desconto, acrescimo, total),
    "Permita pop-ups para imprimir o recibo.",
  );
}

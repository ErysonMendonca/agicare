import {
  abrirImpressao,
  esc,
  identPacienteHTML,
  limpo,
  montarDocumentoBase,
  rodapeAssinaturaProfissional,
  type ClinicaImpressao,
} from "@/lib/clinico/documento-impressao";
import { type ProcedimentoDocItem } from "@/lib/data/procedimento-doc";

// ════════════════════════════════════════════════════════════════
// Impressão A4 do DOCUMENTO DE PROCEDIMENTOS. Espelha o padrão do
// Ortograma/Atestado: monta um HTML completo e o abre numa JANELA NOVA.
// NUNCA trocar document.body.innerHTML (destrói a árvore React viva).
// ════════════════════════════════════════════════════════════════

export type CabecalhoProcedimentos = {
  clinica: ClinicaImpressao;
  paciente: string;
  nascimento: string;
  prontuario: string;
  data: string;
  profissional: string;
  conselho: string;
  /** Nº do atendimento (queue_entries.attendance_code). */
  atendimento?: string;
};

const brl = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function montarDocumento(
  cab: CabecalhoProcedimentos,
  itens: ProcedimentoDocItem[],
  total: number,
): string {
  const linhas =
    itens.length > 0
      ? itens
          .map(
            (it, i) =>
              `<tr><td class="n">${i + 1}</td><td>${esc(it.nome)}</td><td class="v">${esc(
                brl(it.valor),
              )}</td></tr>`,
          )
          .join("")
      : `<tr><td colspan="3" class="vazio">Nenhum procedimento registrado.</td></tr>`;

  const ident = identPacienteHTML(cab.paciente, [
    { lbl: "Data de nascimento", val: limpo(cab.nascimento) || "—" },
    { lbl: "Prontuário", val: limpo(cab.prontuario) || "—" },
    { lbl: "Atendimento nº", val: limpo(cab.atendimento ?? "") || "—" },
    { lbl: "Data", val: limpo(cab.data) || "—" },
  ]);

  const corpo = `
    <table class="procs">
      <thead>
        <tr><th class="n">#</th><th>Procedimento</th><th class="v">Valor</th></tr>
      </thead>
      <tbody>${linhas}</tbody>
      <tfoot>
        <tr><td colspan="2" class="tot-lbl">Total</td><td class="v tot">${esc(
          brl(total),
        )}</td></tr>
      </tfoot>
    </table>`;

  const cssExtra = `
    table.procs { width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 4px; }
    table.procs th, table.procs td { border: 1px solid #888; padding: 6px 8px; text-align: left; }
    table.procs th { background: #f2f2f2; text-transform: uppercase; font-size: 10px; letter-spacing: .5px; }
    table.procs td.n, table.procs th.n { width: 32px; text-align: center; }
    table.procs td.v, table.procs th.v { text-align: right; white-space: nowrap; }
    table.procs td.vazio { text-align: center; color: #555; font-style: italic; }
    table.procs td.tot-lbl { text-align: right; font-weight: bold; text-transform: uppercase; font-size: 11px; }
    table.procs td.tot { font-weight: bold; }
    @media print { table.procs tr { break-inside: avoid; } }`;

  return montarDocumentoBase({
    titulo: "PROCEDIMENTOS REALIZADOS",
    clinica: cab.clinica,
    pacienteNome: cab.paciente,
    identHTML: ident,
    corpoHTML: corpo,
    rodapeHTML: rodapeAssinaturaProfissional(
      limpo(cab.profissional) || "Profissional responsável",
      limpo(cab.conselho) ? `Assinatura e carimbo — ${cab.conselho}` : "Assinatura e carimbo",
    ),
    cssExtra,
  });
}

/** Abre o documento numa janela nova e dispara a impressão (só o documento). */
export function imprimirProcedimentos(
  cab: CabecalhoProcedimentos,
  itens: ProcedimentoDocItem[],
  total: number,
): void {
  abrirImpressao(
    montarDocumento(cab, itens, total),
    "Permita pop-ups para imprimir o documento de procedimentos.",
  );
}

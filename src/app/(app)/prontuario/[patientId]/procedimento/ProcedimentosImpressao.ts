import {
  abrirImpressao,
  camposIdentPadrao,
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
//
// Não exibe valor/preço (documento clínico, não financeiro): para cada
// procedimento realizado, lista o procedimento, o material vinculado e o
// instrumental vinculado (com esterilização/validade/lote, quando houver).
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
  idade: string;
  convenio: string;
  plano: string;
  dataAdmissao: string;
  sexo: string;
  nomeMae: string;
};

function fmtData(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("pt-BR");
}

function montarDocumento(cab: CabecalhoProcedimentos, itens: ProcedimentoDocItem[]): string {
  const blocos =
    itens.length > 0
      ? itens
          .map((it, i) => {
            const nota = limpo(it.note ?? "")
              ? `<div class="nota">Observação: ${esc(it.note as string)}</div>`
              : "";

            const materiais =
              it.materiais.length > 0
                ? `<ul>${it.materiais
                    .map((m) => `<li>${esc(m.nome)} — ${esc(String(m.quantidade))} ${esc(m.unidade)}</li>`)
                    .join("")}</ul>`
                : `<p class="vazio">Nenhum material vinculado.</p>`;

            const instrumentos =
              it.instrumentos.length > 0
                ? `<ul>${it.instrumentos
                    .map((inst) => {
                      const detalhe = [
                        inst.sterilizationMethod ?? "Esterilização não informada",
                        inst.lotCode ? `Lote ${inst.lotCode}` : "",
                        inst.validityDate
                          ? `Validade ${fmtData(inst.validityDate)}`
                          : "Sem validade informada",
                      ]
                        .filter(Boolean)
                        .join(" · ");
                      return `<li>${esc(inst.nome)} <span class="det">(${esc(detalhe)})</span></li>`;
                    })
                    .join("")}</ul>`
                : `<p class="vazio">Nenhum instrumental vinculado.</p>`;

            return `
            <div class="proc">
              <div class="proc-tit">${i + 1}. ${esc(it.nome)}</div>
              ${nota}
              <div class="proc-cols">
                <div class="proc-col">
                  <div class="proc-col-tit">Material do procedimento</div>
                  ${materiais}
                </div>
                <div class="proc-col">
                  <div class="proc-col-tit">Instrumental do procedimento</div>
                  ${instrumentos}
                </div>
              </div>
            </div>`;
          })
          .join("")
      : `<p class="vazio">Nenhum procedimento registrado.</p>`;

  const ident = identPacienteHTML(cab.paciente, [
    ...camposIdentPadrao({
      registro: limpo(cab.prontuario) || "—",
      atendimento: cab.atendimento ?? null,
      convenio: limpo(cab.convenio) || "—",
      plano: limpo(cab.plano) || "—",
      dataAdmissao: limpo(cab.dataAdmissao) || "—",
      nascimento: limpo(cab.nascimento) || "—",
      idade: limpo(cab.idade) || "—",
      sexo: limpo(cab.sexo) || "—",
      nomeMae: limpo(cab.nomeMae) || "—",
    }),
    { lbl: "Data", val: limpo(cab.data) || "—" },
  ]);

  const cssExtra = `
    .proc { border: 1px solid #888; padding: 10px 12px; margin-bottom: 10px; font-size: 12px; }
    .proc-tit { font-weight: bold; font-size: 13px; margin-bottom: 4px; }
    .proc .nota { font-size: 11px; color: #555; margin-bottom: 6px; }
    .proc-cols { display: flex; gap: 16px; margin-top: 6px; }
    .proc-col { flex: 1; }
    .proc-col-tit { font-size: 10px; font-weight: bold; text-transform: uppercase; letter-spacing: .4px; color: #555; margin-bottom: 3px; }
    .proc-col ul { margin: 0; padding-left: 16px; }
    .proc-col li { margin-bottom: 2px; }
    .proc-col li .det { color: #555; font-size: 10.5px; }
    .vazio { color: #555; font-style: italic; margin: 0; }
    @media print { .proc { break-inside: avoid; } }`;

  return montarDocumentoBase({
    titulo: "PROCEDIMENTOS REALIZADOS",
    clinica: cab.clinica,
    pacienteNome: cab.paciente,
    identHTML: ident,
    corpoHTML: blocos,
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
): void {
  abrirImpressao(
    montarDocumento(cab, itens),
    "Permita pop-ups para imprimir o documento de procedimentos.",
  );
}

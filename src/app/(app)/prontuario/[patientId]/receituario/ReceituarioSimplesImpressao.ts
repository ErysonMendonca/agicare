import {
  abrirImpressao,
  corpoTexto,
  esc,
  hojeBR,
  identPacienteHTML,
  limpo,
  montarDocumentoBase,
  rodapeAssinaturaProfissional,
  type ClinicaImpressao,
} from "@/lib/clinico/documento-impressao";

// ════════════════════════════════════════════════════════════════
// Impressão A4 de um RECEITUÁRIO SIMPLES — usa o MODELO padrão
// compartilhado (`documento-impressao`). O corpo preserva as quebras de
// linha do textarea (\n → <br> após escapar).
// ════════════════════════════════════════════════════════════════

export type { ClinicaImpressao };

export type PacienteImpressao = {
  nome: string;
  registro: string;
  cpf: string;
  idade: string;
  convenio: string;
};

/** Identificação do profissional emitente (nome + registro do conselho). */
export type ProfissionalImpressao = {
  nome: string;
  conselho: string;
};

function montarDocumento(
  clinica: ClinicaImpressao,
  paciente: PacienteImpressao,
  texto: string,
  profissional: ProfissionalImpressao,
  cid: string,
): string {
  const ident = identPacienteHTML(limpo(paciente.nome) || "—", [
    { lbl: "Registro", val: limpo(paciente.registro) || "—" },
    { lbl: "CPF", val: limpo(paciente.cpf) || "—" },
    { lbl: "Data", val: hojeBR(), span: 3 },
  ]);

  const corpo = `
    <div class="corpo-lbl">Prescrição:</div>
    <div class="presc">${corpoTexto(texto)}</div>
    ${limpo(cid) ? `<p class="corpo-lbl" style="margin-top:8px">CID-10: ${esc(cid)}</p>` : ""}`;

  return montarDocumentoBase({
    titulo: "RECEITUÁRIO",
    clinica,
    pacienteNome: paciente.nome,
    identHTML: ident,
    corpoHTML: corpo,
    rodapeHTML: rodapeAssinaturaProfissional(
      limpo(profissional.nome) || "Profissional responsável",
      limpo(profissional.conselho) ? `Assinatura e carimbo — ${profissional.conselho}` : "Assinatura e carimbo",
    ),
    cssExtra: ".corpo { min-height: 320px; } .presc { margin-top: 4px; }",
  });
}

/** Abre o receituário simples numa janela nova e dispara a impressão. */
export function imprimirReceituarioSimples(
  clinica: ClinicaImpressao,
  paciente: PacienteImpressao,
  texto: string,
  profissional: ProfissionalImpressao,
  cid = "",
): void {
  abrirImpressao(
    montarDocumento(clinica, paciente, texto, profissional, cid),
    "Permita pop-ups para imprimir o receituário.",
  );
}

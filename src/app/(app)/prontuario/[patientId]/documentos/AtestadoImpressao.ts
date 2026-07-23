import type { Documento } from "@/lib/data/documentos";
import {
  abrirImpressao,
  esc,
  identPacienteHTML,
  limpo,
  montarDocumentoBase,
  rodapeAssinaturaProfissional,
  type ClinicaImpressao,
} from "@/lib/clinico/documento-impressao";

// ════════════════════════════════════════════════════════════════
// Impressão A4 de um ATESTADO MÉDICO — usa o MODELO padrão compartilhado
// (`documento-impressao`): cabeçalho + identificação + corpo + assinatura
// no fim da folha. O CID-10 só aparece quando `exibirCid` for verdadeiro
// (LGPD).
// ════════════════════════════════════════════════════════════════

export type { ClinicaImpressao };

export type PacienteImpressao = {
  nome: string;
  registro: string;
  cpf: string;
  idade: string;
  convenio: string;
};

/**
 * Número por extenso (0–99) — suficiente para dias de afastamento. Ex.: 5 →
 * "cinco", 21 → "vinte e um". Fora do intervalo, cai no próprio numeral.
 */
function porExtenso(n: number): string {
  const unidades = [
    "zero", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito",
    "nove", "dez", "onze", "doze", "treze", "quatorze", "quinze", "dezesseis",
    "dezessete", "dezoito", "dezenove",
  ];
  const dezenas = [
    "", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta",
    "setenta", "oitenta", "noventa",
  ];
  if (n < 0 || n > 99 || !Number.isInteger(n)) return String(n);
  if (n < 20) return unidades[n];
  const d = Math.floor(n / 10);
  const u = n % 10;
  return u === 0 ? dezenas[d] : `${dezenas[d]} e ${unidades[u]}`;
}

function corpoAtestado(paciente: PacienteImpressao, doc: Documento): string {
  const dias = doc.dias ?? 0;
  const diasTxt = `${dias} (${porExtenso(dias)}) dia${dias === 1 ? "" : "s"}`;
  const cidVisivel = doc.exibirCid && !!limpo(doc.cid10 ?? "");

  const texto = `
    Atesto, para os devidos fins, que o(a) paciente
    <strong>${esc(paciente.nome)}</strong>${
      limpo(paciente.registro) ? ` (registro ${esc(paciente.registro)})` : ""
    } necessita de afastamento de suas atividades por
    <strong>${esc(diasTxt)}</strong>${
      limpo(doc.dataAtestado ?? "")
        ? `, a partir de <strong>${esc(doc.dataAtestado ?? "")}</strong>${
            limpo(doc.fim ?? "") ? ` até <strong>${esc(doc.fim ?? "")}</strong>` : ""
          }`
        : ""
    }${
      limpo(doc.diagnostico ?? "")
        ? `, em razão de: ${esc(doc.diagnostico ?? "")}`
        : ""
    }.`;

  return `
    <p class="just">${texto}</p>
    ${cidVisivel ? `<p class="corpo-lbl">CID-10: <strong>${esc(doc.cid10 ?? "")}</strong></p>` : ""}
    ${limpo(doc.observacao ?? "") ? `<p><strong>Observação:</strong> ${esc(doc.observacao ?? "")}</p>` : ""}
    <p class="corpo-lbl">Data de emissão: ${esc(limpo(doc.dataAtestado ?? "") || limpo(doc.dataHora) || "—")}</p>`;
}

function montarDocumento(
  clinica: ClinicaImpressao,
  paciente: PacienteImpressao,
  doc: Documento,
): string {
  const ident = identPacienteHTML(paciente.nome, [
    { lbl: "Registro", val: limpo(paciente.registro) || "—" },
    { lbl: "CPF", val: limpo(paciente.cpf) || "—" },
    { lbl: "Idade", val: limpo(paciente.idade) || "—" },
    { lbl: "Convênio", val: limpo(paciente.convenio) || "—" },
  ]);

  return montarDocumentoBase({
    titulo: "ATESTADO MÉDICO",
    clinica,
    pacienteNome: paciente.nome,
    identHTML: ident,
    corpoHTML: corpoAtestado(paciente, doc),
    rodapeHTML: rodapeAssinaturaProfissional(
      limpo(doc.profissional) || "Profissional responsável",
      limpo(doc.conselho) ? `Assinatura e carimbo — ${doc.conselho}` : "Assinatura e carimbo",
    ),
  });
}

/** Abre o atestado numa janela nova e dispara a impressão (só o atestado). */
export function imprimirAtestado(
  clinica: ClinicaImpressao,
  paciente: PacienteImpressao,
  doc: Documento,
): void {
  abrirImpressao(
    montarDocumento(clinica, paciente, doc),
    "Permita pop-ups para imprimir o atestado.",
  );
}

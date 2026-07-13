import type { Documento } from "@/lib/data/documentos";
import type { PacienteImpressao } from "./AtestadoImpressao";
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
// Impressão A4 de uma ALTA MÉDICA — usa o MODELO padrão compartilhado
// (`documento-impressao`). Reusa PacienteImpressao do atestado. CID só
// consta quando "Exibir CID" estiver marcado (LGPD).
// ════════════════════════════════════════════════════════════════

function corpoAlta(paciente: PacienteImpressao, doc: Documento): string {
  const dataAlta = limpo(doc.dataAlta ?? "") || limpo(doc.dataHora);
  const cid = doc.exibirCid ? limpo(doc.cid10 ?? "") : "";

  const texto = `
    Declaro, para os devidos fins, que o(a) paciente
    <strong>${esc(paciente.nome)}</strong>${
      limpo(paciente.registro) ? ` (registro ${esc(paciente.registro)})` : ""
    } recebeu ALTA${
      dataAlta ? ` em <strong>${esc(dataAlta)}</strong>` : ""
    }${
      limpo(doc.motivo ?? "")
        ? `, por motivo de <strong>${esc(doc.motivo ?? "")}</strong>`
        : ""
    }${limpo(doc.detalhe ?? "") ? ` (${esc(doc.detalhe ?? "")})` : ""}.`;

  return `
    <p class="just">${texto}</p>
    ${cid ? `<p class="corpo-lbl">CID-10: <strong>${esc(cid)}</strong></p>` : ""}
    ${limpo(doc.observacao ?? "") ? `<p><strong>Observação:</strong> ${esc(doc.observacao ?? "")}</p>` : ""}
    <p class="corpo-lbl">Data da alta: ${esc(dataAlta || "—")}</p>`;
}

function montarDocumento(
  clinica: ClinicaImpressao,
  paciente: PacienteImpressao,
  doc: Documento,
): string {
  const ident = identPacienteHTML(limpo(paciente.nome) || "—", [
    { lbl: "Registro", val: limpo(paciente.registro) || "—" },
    { lbl: "Idade", val: limpo(paciente.idade) || "—" },
    { lbl: "Convênio", val: limpo(paciente.convenio) || "—", span: 3 },
  ]);

  return montarDocumentoBase({
    titulo: "ALTA MÉDICA",
    clinica,
    pacienteNome: paciente.nome,
    identHTML: ident,
    corpoHTML: corpoAlta(paciente, doc),
    rodapeHTML: rodapeAssinaturaProfissional(
      limpo(doc.profissional) || "Profissional responsável",
      "Assinatura e carimbo (CRM)",
    ),
  });
}

/** Abre a alta numa janela nova e dispara a impressão (só a alta). */
export function imprimirAlta(
  clinica: ClinicaImpressao,
  paciente: PacienteImpressao,
  doc: Documento,
): void {
  abrirImpressao(
    montarDocumento(clinica, paciente, doc),
    "Permita pop-ups para imprimir a alta.",
  );
}

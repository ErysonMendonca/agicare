import { toast } from "sonner";
import type { Documento } from "@/lib/data/documentos";

// ════════════════════════════════════════════════════════════════
// Impressão A4 de um ATESTADO MÉDICO — documento próprio, isolado da
// UI (abre numa janela nova e imprime só o atestado). Espelha o padrão
// do Receituário (ReceitaClient): HTML inline em escala de cinza.
// O CID-10 só aparece quando `exibirCid` for verdadeiro (LGPD).
// ════════════════════════════════════════════════════════════════

export type ClinicaImpressao = {
  nome: string;
  cnpj: string;
  endereco: string;
  telefone: string;
};

export type PacienteImpressao = {
  nome: string;
  registro: string;
  idade: string;
  convenio: string;
};

/** "—" (placeholder do data layer) → vazio, para não poluir o documento. */
const limpo = (v: string) => (v && v !== "—" ? v : "");

/** Escapa texto para inserção segura no documento de impressão. */
function esc(v: string): string {
  return v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function montarDocumento(
  clinica: ClinicaImpressao,
  paciente: PacienteImpressao,
  doc: Documento,
): string {
  const dias = doc.dias ?? 0;
  const diasTxt = `${dias} (${dias === 1 ? "um" : dias}) dia${dias === 1 ? "" : "s"}`;
  const cidVisivel = doc.exibirCid && !!limpo(doc.cid10 ?? "");

  const corpo = `
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

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<title>Atestado Médico — ${esc(paciente.nome)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: black; margin: 32px; line-height: 1.6; }
  .head { text-align: center; border-bottom: 2px solid black; padding-bottom: 12px; margin-bottom: 20px; }
  .clinica { font-size: 18px; font-weight: bold; }
  .clinica-sub { font-size: 12px; color: dimgray; margin-top: 2px; }
  h1 { font-size: 16px; letter-spacing: 2px; text-align: center; margin: 24px 0; }
  .pac { font-size: 13px; margin-bottom: 18px; }
  .pac span { display: inline-block; margin-right: 24px; }
  .label { color: dimgray; }
  .corpo { font-size: 14px; text-align: justify; margin: 18px 0; }
  .cid { font-size: 13px; margin-top: 12px; }
  .obs { font-size: 12px; margin-top: 14px; }
  .sign { margin-top: 72px; text-align: center; }
  .sign-line { width: 280px; margin: 0 auto; border-top: 1px solid black; padding-top: 6px; font-size: 13px; }
  .sign-sub { font-size: 11px; color: dimgray; }
  .foot { margin-top: 28px; font-size: 10px; color: gray; text-align: center; }
</style>
</head>
<body>
  <div class="head">
    <div class="clinica">${esc(clinica.nome)}</div>
    <div class="clinica-sub">${esc(
      [limpo(clinica.endereco), limpo(clinica.telefone)].filter(Boolean).join(" · "),
    )}</div>
    <div class="clinica-sub">${
      limpo(clinica.cnpj) ? `CNPJ: ${esc(clinica.cnpj)}` : ""
    }</div>
  </div>

  <h1>ATESTADO MÉDICO</h1>

  <div class="pac">
    <span><span class="label">Paciente:</span> <strong>${esc(paciente.nome)}</strong></span>
    <span><span class="label">Registro:</span> ${esc(limpo(paciente.registro) || "—")}</span>
    <span><span class="label">Idade:</span> ${esc(limpo(paciente.idade) || "—")}</span>
    <span><span class="label">Convênio:</span> ${esc(limpo(paciente.convenio) || "—")}</span>
  </div>

  <p class="corpo">${corpo}</p>

  ${cidVisivel ? `<p class="cid"><span class="label">CID-10:</span> <strong>${esc(doc.cid10 ?? "")}</strong></p>` : ""}
  ${limpo(doc.observacao ?? "") ? `<p class="obs"><strong>Observação:</strong> ${esc(doc.observacao ?? "")}</p>` : ""}

  <p class="obs"><span class="label">Data de emissão:</span> ${esc(limpo(doc.dataAtestado ?? "") || limpo(doc.dataHora) || "—")}</p>

  <div class="sign">
    <div class="sign-line">
      ${esc(limpo(doc.profissional) || "Profissional responsável")}
      <div class="sign-sub">Assinatura e carimbo (CRM)</div>
    </div>
  </div>

  <div class="foot">Documento gerado eletronicamente pelo agicare — ${esc(clinica.nome)}.</div>
</body>
</html>`;
}

/** Abre o atestado numa janela nova e dispara a impressão (só o atestado). */
export function imprimirAtestado(
  clinica: ClinicaImpressao,
  paciente: PacienteImpressao,
  doc: Documento,
): void {
  const win = window.open("", "_blank", "width=820,height=1040");
  if (!win) {
    toast.error("Permita pop-ups para imprimir o atestado.");
    return;
  }
  win.document.write(montarDocumento(clinica, paciente, doc));
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 150);
}

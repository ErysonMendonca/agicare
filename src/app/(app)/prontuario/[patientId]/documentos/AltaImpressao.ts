import { toast } from "sonner";
import type { Documento } from "@/lib/data/documentos";
import type { ClinicaImpressao, PacienteImpressao } from "./AtestadoImpressao";

// ════════════════════════════════════════════════════════════════
// Impressão A4 de uma ALTA MÉDICA — documento próprio, isolado da UI
// (abre numa janela nova e imprime só a alta). Espelha o padrão do
// AtestadoImpressao: HTML inline em escala de cinza. Reusa os types
// ClinicaImpressao/PacienteImpressao do atestado.
// ════════════════════════════════════════════════════════════════

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
  const dataAlta = limpo(doc.dataAlta ?? "") || limpo(doc.dataHora);
  // CID só consta no documento quando o checkbox "Exibir CID" estiver marcado (LGPD).
  const cid = doc.exibirCid ? limpo(doc.cid10 ?? "") : "";

  const corpo = `
    Declaro, para os devidos fins, que o(a) paciente
    <strong>${esc(paciente.nome)}</strong>${
      limpo(paciente.registro) ? ` (registro ${esc(paciente.registro)})` : ""
    } recebeu ALTA${
      dataAlta ? ` em <strong>${esc(dataAlta)}</strong>` : ""
    }${
      limpo(doc.motivo ?? "")
        ? `, por motivo de <strong>${esc(doc.motivo ?? "")}</strong>`
        : ""
    }${
      limpo(doc.detalhe ?? "") ? ` (${esc(doc.detalhe ?? "")})` : ""
    }.`;

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<title>Alta Médica — ${esc(paciente.nome)}</title>
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

  <h1>ALTA MÉDICA</h1>

  <div class="pac">
    <span><span class="label">Paciente:</span> ${esc(limpo(paciente.nome) || "—")}</span>
    <span><span class="label">Registro:</span> ${esc(limpo(paciente.registro) || "—")}</span>
    <span><span class="label">Idade:</span> ${esc(limpo(paciente.idade) || "—")}</span>
    <span><span class="label">Convênio:</span> ${esc(limpo(paciente.convenio) || "—")}</span>
  </div>

  <p class="corpo">${corpo}</p>

  ${cid ? `<p class="cid"><span class="label">CID-10:</span> <strong>${esc(cid)}</strong></p>` : ""}
  ${limpo(doc.observacao ?? "") ? `<p class="obs"><strong>Observação:</strong> ${esc(doc.observacao ?? "")}</p>` : ""}

  <p class="obs"><span class="label">Data da alta:</span> ${esc(dataAlta || "—")}</p>

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

/** Abre a alta numa janela nova e dispara a impressão (só a alta). */
export function imprimirAlta(
  clinica: ClinicaImpressao,
  paciente: PacienteImpressao,
  doc: Documento,
): void {
  const win = window.open("", "_blank", "width=820,height=1040");
  if (!win) {
    toast.error("Permita pop-ups para imprimir a alta.");
    return;
  }
  win.document.write(montarDocumento(clinica, paciente, doc));
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 150);
}

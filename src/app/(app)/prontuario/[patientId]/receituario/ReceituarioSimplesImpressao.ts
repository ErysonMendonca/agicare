import { toast } from "sonner";

// ════════════════════════════════════════════════════════════════
// Impressão A4 de um RECEITUÁRIO SIMPLES — texto livre sob o cabeçalho
// da clínica. Espelha o padrão do AtestadoImpressao (HTML inline em
// escala de cinza, window.open + print). O corpo preserva as quebras
// de linha do textarea (\n → <br> após escapar).
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

/** Escapa e converte quebras de linha em <br> (preserva o layout do textarea). */
function corpoTexto(v: string): string {
  return esc(v).replace(/\n/g, "<br>");
}

function hojeBR(): string {
  return new Date().toLocaleDateString("pt-BR");
}

function montarDocumento(
  clinica: ClinicaImpressao,
  paciente: PacienteImpressao,
  texto: string,
): string {
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<title>Receituário — ${esc(paciente.nome)}</title>
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
  .corpo { font-size: 14px; margin: 18px 0; min-height: 340px; white-space: normal; }
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

  <h1>RECEITUÁRIO</h1>

  <div class="pac">
    <span><span class="label">Paciente:</span> <strong>${esc(limpo(paciente.nome) || "—")}</strong></span>
    <span><span class="label">Registro:</span> ${esc(limpo(paciente.registro) || "—")}</span>
  </div>

  <div class="corpo">${corpoTexto(texto)}</div>

  <p class="obs"><span class="label">Data:</span> ${esc(hojeBR())}</p>

  <div class="sign">
    <div class="sign-line">
      Assinatura do médico
      <div class="sign-sub">Assinatura e carimbo (CRM)</div>
    </div>
  </div>

  <div class="foot">Documento gerado eletronicamente pelo agicare — ${esc(clinica.nome)}.</div>
</body>
</html>`;
}

/** Abre o receituário simples numa janela nova e dispara a impressão. */
export function imprimirReceituarioSimples(
  clinica: ClinicaImpressao,
  paciente: PacienteImpressao,
  texto: string,
): void {
  const win = window.open("", "_blank", "width=820,height=1040");
  if (!win) {
    toast.error("Permita pop-ups para imprimir o receituário.");
    return;
  }
  win.document.write(montarDocumento(clinica, paciente, texto));
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 150);
}

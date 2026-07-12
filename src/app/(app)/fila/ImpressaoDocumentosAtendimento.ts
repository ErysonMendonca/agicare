import { toast } from "sonner";
import type { ClinicaImpressao, PacienteImpressao } from "@/app/(app)/prontuario/[patientId]/documentos/AtestadoImpressao";
import type { DadosAtendimentoDoc } from "./FichaAtendimento";

// ════════════════════════════════════════════════════════════════
// Impressão A4 do pacote de documentos do atendimento (recepção):
//   • Página 1 = FICHA DE DETALHE DO ATENDIMENTO (dados administrativos);
//   • 1 página por TERMO de consentimento ATIVO (paciente assina no papel).
// Segue o padrão A (HTML inline autocontido em escala de cinza, abre numa
// janela nova e imprime), espelhando o AtestadoImpressao. Cada página quebra
// via `.page { page-break-after: always }`.
// ════════════════════════════════════════════════════════════════

/** Termo de consentimento reduzido ao necessário para a impressão. */
export type TermoImpressao = { title: string; body: string };

/** "—" (placeholder do data layer) → vazio, para não poluir o documento. */
const limpo = (v: string) => (v && v !== "—" ? v : "");

/** Escapa texto para inserção segura no documento de impressão. */
function esc(v: string): string {
  return v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Cabeçalho institucional (dados da clínica) — repetido em toda página. */
function cabecalhoClinica(clinica: ClinicaImpressao): string {
  return `
  <div class="head">
    <div class="clinica">${esc(clinica.nome)}</div>
    <div class="clinica-sub">${esc(
      [limpo(clinica.endereco), limpo(clinica.telefone)].filter(Boolean).join(" · "),
    )}</div>
    <div class="clinica-sub">${limpo(clinica.cnpj) ? `CNPJ: ${esc(clinica.cnpj)}` : ""}</div>
  </div>`;
}

/** Linha rótulo/valor; devolve "" quando vazia (não polui o documento). */
function linha(rotulo: string, valor: string): string {
  const v = limpo(valor);
  if (!v) return "";
  return `<div class="row"><span class="label">${esc(rotulo)}</span><span class="val">${esc(v)}</span></div>`;
}

/** Bloco de assinatura do paciente (linha + legenda). */
function assinaturaPaciente(paciente: PacienteImpressao): string {
  return `
  <div class="sign">
    <div class="sign-line">
      ${esc(limpo(paciente.nome) || "Paciente")}
      <div class="sign-sub">Assinatura do Paciente / Responsável</div>
    </div>
  </div>`;
}

/** Página 1 — Ficha de Detalhe do Atendimento. */
function paginaFicha(
  clinica: ClinicaImpressao,
  paciente: PacienteImpressao,
  dados: DadosAtendimentoDoc,
  emitidoEm: string,
): string {
  const temResp =
    limpo(dados.responsavel) || limpo(dados.respDocumento) || limpo(dados.respParentesco);

  return `
  <section class="page">
    ${cabecalhoClinica(clinica)}
    <h1>FICHA DE DETALHE DO ATENDIMENTO</h1>

    <div class="pac">
      <span><span class="label">Paciente:</span> <strong>${esc(paciente.nome)}</strong></span>
      <span><span class="label">Registro:</span> ${esc(limpo(paciente.registro) || "—")}</span>
      <span><span class="label">Idade:</span> ${esc(limpo(paciente.idade) || "—")}</span>
    </div>

    <h2>Dados do Atendimento</h2>
    <div class="grid">
      ${linha("Especialidade", dados.especialidade)}
      ${linha("Profissional", dados.profissional)}
      ${linha("Tipo de Atendimento", dados.tipo)}
      ${linha("Caráter", dados.carater)}
      ${linha("Local Procedência", dados.procedencia)}
      ${linha("Centro de Custo", dados.centroCusto)}
      ${linha("Origem", dados.origem)}
      ${linha("Data de Entrada", dados.dataEntrada)}
      ${linha("Gestante", dados.gestante)}
    </div>

    <h2>Convênio</h2>
    <div class="grid">
      ${linha("Convênio", dados.convenio)}
      ${linha("Plano", dados.plano)}
      ${linha("Carteirinha", dados.carteira)}
      ${linha("Validade", dados.validade)}
    </div>

    ${
      temResp
        ? `<h2>Responsável</h2>
    <div class="grid">
      ${linha("Nome", dados.responsavel)}
      ${linha("Documento", dados.respDocumento)}
      ${linha("Grau Parentesco", dados.respParentesco)}
    </div>`
        : ""
    }

    ${
      limpo(dados.observacoes)
        ? `<h2>Observação</h2><p class="corpo">${esc(dados.observacoes)}</p>`
        : ""
    }

    ${assinaturaPaciente(paciente)}
    <div class="foot">Emitido em ${esc(emitidoEm)} — ${esc(clinica.nome)}.</div>
  </section>`;
}

/** Uma página por termo de consentimento. */
function paginaTermo(
  clinica: ClinicaImpressao,
  paciente: PacienteImpressao,
  termo: TermoImpressao,
): string {
  const corpo = esc(termo.body).replace(/\r?\n/g, "<br>");
  return `
  <section class="page">
    ${cabecalhoClinica(clinica)}
    <h1>${esc(termo.title)}</h1>
    <p class="pac-nome"><span class="label">Paciente:</span> <strong>${esc(paciente.nome)}</strong></p>
    <div class="termo">${corpo}</div>
    ${assinaturaPaciente(paciente)}
  </section>`;
}

function montarDocumento(
  clinica: ClinicaImpressao,
  paciente: PacienteImpressao,
  dados: DadosAtendimentoDoc,
  termos: TermoImpressao[],
  incluirFicha = true,
): string {
  const emitidoEm = new Date().toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const paginas = [
    ...(incluirFicha ? [paginaFicha(clinica, paciente, dados, emitidoEm)] : []),
    ...termos.map((t) => paginaTermo(clinica, paciente, t)),
  ].join("\n");

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<title>Documentos do Atendimento — ${esc(paciente.nome)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: black; margin: 0; line-height: 1.6; }
  .page { padding: 32px; min-height: 100vh; page-break-after: always; }
  .page:last-child { page-break-after: auto; }
  .head { text-align: center; border-bottom: 2px solid black; padding-bottom: 12px; margin-bottom: 20px; }
  .clinica { font-size: 18px; font-weight: bold; }
  .clinica-sub { font-size: 12px; color: dimgray; margin-top: 2px; }
  h1 { font-size: 16px; letter-spacing: 2px; text-align: center; margin: 24px 0; text-transform: uppercase; }
  h2 { font-size: 12px; text-transform: uppercase; letter-spacing: 1px; color: dimgray; border-bottom: 1px solid lightgray; padding-bottom: 4px; margin: 20px 0 10px; }
  .pac { font-size: 13px; margin-bottom: 8px; }
  .pac span { display: inline-block; margin-right: 24px; }
  .pac-nome { font-size: 13px; margin-bottom: 16px; }
  .label { color: dimgray; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 32px; font-size: 13px; }
  .row { display: flex; justify-content: space-between; gap: 12px; border-bottom: 1px dotted lightgray; padding: 2px 0; }
  .val { font-weight: bold; text-align: right; }
  .corpo { font-size: 13px; text-align: justify; margin: 8px 0; }
  .termo { font-size: 13px; text-align: justify; margin: 12px 0 8px; white-space: normal; }
  .sign { margin-top: 64px; text-align: center; }
  .sign-line { width: 300px; margin: 0 auto; border-top: 1px solid black; padding-top: 6px; font-size: 13px; }
  .sign-sub { font-size: 11px; color: dimgray; }
  .foot { margin-top: 24px; font-size: 10px; color: gray; text-align: center; }
  @media print { .page { min-height: auto; } }
</style>
</head>
<body>
${paginas}
</body>
</html>`;
}

/**
 * Abre o pacote de documentos numa janela nova e dispara a impressão.
 * `termos` vazio imprime só a ficha (página 1). Com `incluirFicha = false`
 * imprime apenas os termos informados (impressão seletiva de um único termo).
 */
export function imprimirDocumentosAtendimento(
  clinica: ClinicaImpressao,
  paciente: PacienteImpressao,
  dados: DadosAtendimentoDoc,
  termos: TermoImpressao[],
  incluirFicha = true,
): void {
  const win = window.open("", "_blank", "width=820,height=1040");
  if (!win) {
    toast.error("Permita pop-ups para imprimir os documentos do atendimento.");
    return;
  }
  win.document.write(montarDocumento(clinica, paciente, dados, termos, incluirFicha));
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 150);
}

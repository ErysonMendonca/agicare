import { toast } from "sonner";
import type { ClinicaImpressao } from "./ReceituarioSimplesImpressao";

// ════════════════════════════════════════════════════════════════
// Impressão A4 do RECEITUÁRIO DE CONTROLE ESPECIAL (Portaria 344/98).
// Modelo em DUAS VIAS (1ª via farmácia, 2ª via paciente) separadas por
// page-break. Cabeçalho da clínica + "CARIMBO E A ASSINATURA DO MÉDICO";
// dados do paciente com bordas; área de prescrição; e os blocos
// "IDENTIFICAÇÃO DO COMPRADOR" / "IDENTIFICAÇÃO DO FORNECEDOR" que saem
// EM BRANCO no papel (preenchidos na farmácia). Espelha o padrão do
// AtestadoImpressao (HTML inline em escala de cinza, window.open+print).
// ════════════════════════════════════════════════════════════════

export type { ClinicaImpressao };

export type PacienteImpressaoEspecial = {
  nome: string;
  registro: string;
  endereco: string;
  cidade: string;
  uf: string;
  cep: string;
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

/** Monta uma via (idêntica nas duas); `via` só rotula o rodapé. */
function montarVia(
  clinica: ClinicaImpressao,
  paciente: PacienteImpressaoEspecial,
  texto: string,
  via: string,
  cid: string,
): string {
  return `
  <div class="via">
    <div class="topo">
      <div class="clinica-box">
        <div class="clinica">${esc(clinica.nome)}</div>
        <div class="clinica-sub">${esc(
          [limpo(clinica.endereco), limpo(clinica.telefone)].filter(Boolean).join(" · "),
        )}</div>
        <div class="clinica-sub">${
          limpo(clinica.cnpj) ? `CNPJ: ${esc(clinica.cnpj)}` : ""
        }</div>
      </div>
      <div class="carimbo">CARIMBO E A ASSINATURA DO MÉDICO</div>
    </div>

    <div class="titulo">RECEITUÁRIO DE CONTROLE ESPECIAL — ${esc(via)}</div>

    <table class="ident">
      <tr>
        <td class="lbl">Paciente</td>
        <td class="val" colspan="3">${esc(limpo(paciente.nome) || "")}</td>
      </tr>
      <tr>
        <td class="lbl">Endereço</td>
        <td class="val" colspan="3">${esc(limpo(paciente.endereco) || "")}</td>
      </tr>
      <tr>
        <td class="lbl">Cidade</td>
        <td class="val">${esc(
          [limpo(paciente.cidade), limpo(paciente.uf)].filter(Boolean).join(" / "),
        )}</td>
        <td class="lbl">CEP</td>
        <td class="val">${esc(limpo(paciente.cep) || "")}</td>
      </tr>
    </table>

    <div class="presc-lbl">Prescrição:</div>
    <div class="presc">${corpoTexto(texto)}</div>

    ${limpo(cid) ? `<div class="data">CID-10: ${esc(cid)}</div>` : ""}
    <div class="data">Data: ${esc(hojeBR())}</div>

    <div class="blocos">
      <div class="bloco">
        <div class="bloco-tit">IDENTIFICAÇÃO DO COMPRADOR</div>
        <div class="linha"><span class="k">Nome:</span></div>
        <div class="linha"><span class="k">Ident.:</span> <span class="k2">Órgão Emissor:</span></div>
        <div class="linha"><span class="k">End.:</span></div>
        <div class="linha"><span class="k">Cidade:</span> <span class="k2">UF:</span></div>
        <div class="linha"><span class="k">Telefone:</span></div>
      </div>
      <div class="bloco">
        <div class="bloco-tit">IDENTIFICAÇÃO DO FORNECEDOR</div>
        <div class="linha">&nbsp;</div>
        <div class="linha">&nbsp;</div>
        <div class="linha">&nbsp;</div>
        <div class="rod-farm">
          <div class="rod-linha"></div>
          <div class="rod-lbl">ASSINATURA DO FARMACÊUTICO &nbsp;&nbsp; DATA ___/___/______</div>
        </div>
      </div>
    </div>
  </div>`;
}

function montarDocumento(
  clinica: ClinicaImpressao,
  paciente: PacienteImpressaoEspecial,
  texto: string,
  cid: string,
): string {
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<title>Receituário de Controle Especial — ${esc(paciente.nome)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: black; margin: 24px; line-height: 1.5; }
  .via { padding-bottom: 8px; }
  .via.primeira { page-break-after: always; border-bottom: 1px dashed gray; margin-bottom: 24px; }
  .topo { display: flex; justify-content: space-between; gap: 16px; align-items: stretch; }
  .clinica-box { border: 1px solid gray; padding: 8px 12px; flex: 1; }
  .clinica { font-size: 15px; font-weight: bold; }
  .clinica-sub { font-size: 11px; color: dimgray; margin-top: 2px; }
  .carimbo { border: 1px solid gray; padding: 8px 12px; width: 220px; font-size: 10px; color: dimgray; display: flex; align-items: flex-end; text-align: center; }
  .titulo { text-align: center; font-size: 12px; font-weight: bold; letter-spacing: 1px; margin: 12px 0; }
  table.ident { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
  table.ident td { border: 1px solid gray; padding: 5px 8px; font-size: 12px; }
  table.ident td.lbl { color: dimgray; width: 90px; white-space: nowrap; }
  table.ident td.val { font-weight: 500; }
  .presc-lbl { font-size: 12px; color: dimgray; margin-top: 6px; }
  .presc { border: 1px solid gray; padding: 10px; min-height: 180px; font-size: 13px; margin-top: 4px; }
  .data { font-size: 12px; margin: 10px 0; }
  .blocos { display: flex; gap: 12px; margin-top: 8px; }
  .bloco { flex: 1; border: 1px solid gray; padding: 8px 10px; min-height: 150px; }
  .bloco-tit { font-size: 10px; font-weight: bold; text-align: center; border-bottom: 1px solid gray; padding-bottom: 4px; margin-bottom: 8px; }
  .linha { font-size: 11px; color: dimgray; padding: 8px 0 2px; border-bottom: 1px solid #ccc; }
  .linha .k2 { margin-left: 24px; }
  .rod-farm { margin-top: 24px; text-align: center; }
  .rod-linha { border-top: 1px solid black; margin: 0 8px; }
  .rod-lbl { font-size: 9px; color: dimgray; margin-top: 4px; }
</style>
</head>
<body>
  ${montarVia(clinica, { ...paciente }, texto, "1ª VIA FARMÁCIA", cid)
    .replace('class="via"', 'class="via primeira"')}
  ${montarVia(clinica, { ...paciente }, texto, "2ª VIA PACIENTE", cid)}
</body>
</html>`;
}

/** Abre o receituário de controle especial (2 vias) e dispara a impressão. */
export function imprimirReceituarioEspecial(
  clinica: ClinicaImpressao,
  paciente: PacienteImpressaoEspecial,
  texto: string,
  cid = "",
): void {
  const win = window.open("", "_blank", "width=820,height=1040");
  if (!win) {
    toast.error("Permita pop-ups para imprimir o receituário.");
    return;
  }
  win.document.write(montarDocumento(clinica, paciente, texto, cid));
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 150);
}

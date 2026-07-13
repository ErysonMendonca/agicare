import {
  abrirImpressao,
  cabecalhoHTML,
  corpoTexto,
  esc,
  hojeBR,
  identPacienteHTML,
  limpo,
  type ClinicaImpressao,
} from "@/lib/clinico/documento-impressao";

// ════════════════════════════════════════════════════════════════
// Impressão A4 do RECEITUÁRIO DE CONTROLE ESPECIAL (Portaria 344/98).
// Modelo em DUAS VIAS (1ª via farmácia, 2ª via paciente) separadas por
// page-break — formato legal preservado. Usa os helpers do MODELO padrão
// compartilhado (`documento-impressao`) no cabeçalho, identificação e
// utilitários; os blocos "IDENTIFICAÇÃO DO COMPRADOR / DO FORNECEDOR"
// (preenchidos na farmácia) são específicos deste documento.
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

/** Monta uma via (idêntica nas duas); `via` só rotula o título. */
function montarVia(
  clinica: ClinicaImpressao,
  paciente: PacienteImpressaoEspecial,
  texto: string,
  via: string,
  cid: string,
): string {
  const cidade = [limpo(paciente.cidade), limpo(paciente.uf)].filter(Boolean).join(" / ");
  const ident = identPacienteHTML(limpo(paciente.nome) || "", [
    { lbl: "Endereço", val: limpo(paciente.endereco), span: 3 },
    { lbl: "Cidade", val: cidade },
    { lbl: "CEP", val: limpo(paciente.cep) },
  ]);

  return `
  <div class="via">
    ${cabecalhoHTML(clinica)}
    <div class="titulo">RECEITUÁRIO DE CONTROLE ESPECIAL — ${esc(via)}</div>
    ${ident}

    <div class="corpo-lbl">Prescrição:</div>
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
  @page { size: A4; margin: 14mm; }
  body { font-family: Arial, Helvetica, sans-serif; color: #111; margin: 0; line-height: 1.5; }
  .via { padding-bottom: 8px; }
  .via.primeira { page-break-after: always; border-bottom: 1px dashed #999; margin-bottom: 24px; }

  .topo { display: flex; justify-content: space-between; gap: 16px; align-items: stretch; }
  .clinica-box { border: 1px solid #666; padding: 8px 12px; flex: 1; }
  .clinica { font-size: 15px; font-weight: bold; }
  .clinica-sub { font-size: 11px; color: #555; margin-top: 2px; }
  .carimbo { border: 1px solid #666; padding: 8px 12px; width: 210px; font-size: 10px; color: #555; display: flex; align-items: flex-end; justify-content: center; text-align: center; }

  .titulo { text-align: center; font-size: 12px; font-weight: bold; letter-spacing: 1px; margin: 12px 0; }
  table.ident { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
  table.ident td { border: 1px solid #888; padding: 5px 8px; font-size: 12px; }
  table.ident td.lbl { color: #555; width: 90px; white-space: nowrap; }
  table.ident td.val { font-weight: 500; }

  .corpo-lbl { font-size: 12px; color: #555; margin-top: 6px; }
  .presc { border: 1px solid #888; padding: 10px; min-height: 180px; font-size: 13px; margin-top: 4px; }
  .data { font-size: 12px; margin: 10px 0; }
  .blocos { display: flex; gap: 12px; margin-top: 8px; }
  .bloco { flex: 1; border: 1px solid #888; padding: 8px 10px; min-height: 150px; }
  .bloco-tit { font-size: 10px; font-weight: bold; text-align: center; border-bottom: 1px solid #888; padding-bottom: 4px; margin-bottom: 8px; }
  .linha { font-size: 11px; color: #555; padding: 8px 0 2px; border-bottom: 1px solid #ccc; }
  .linha .k2 { margin-left: 24px; }
  .rod-farm { margin-top: 24px; text-align: center; }
  .rod-linha { border-top: 1px solid #111; margin: 0 8px; }
  .rod-lbl { font-size: 9px; color: #555; margin-top: 4px; }
</style>
</head>
<body>
  ${montarVia(clinica, { ...paciente }, texto, "1ª VIA FARMÁCIA", cid).replace('class="via"', 'class="via primeira"')}
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
  abrirImpressao(
    montarDocumento(clinica, paciente, texto, cid),
    "Permita pop-ups para imprimir o receituário.",
  );
}

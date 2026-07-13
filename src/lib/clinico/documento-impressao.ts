// ════════════════════════════════════════════════════════════════
// BASE compartilhada de impressão dos documentos do prontuário/recepção.
//
// Encapsula o MODELO padrão aprovado (extraído do Receituário de Controle
// Especial): cabeçalho da clínica + box "carimbo e assinatura", título
// centralizado, tabela de identificação do paciente, corpo com moldura e
// o bloco DATA + ASSINATURA empurrado para o FIM DA FOLHA A4.
//
// Cada documento monta só o seu CORPO e a sua identificação e delega o
// invólucro (HTML/CSS/rodapé) a `montarDocumentoBase` + `abrirImpressao`.
// Escala de cinza, pronto para impressão (window.open + print).
// ════════════════════════════════════════════════════════════════

import { toast } from "sonner";

export type ClinicaImpressao = {
  nome: string;
  cnpj: string;
  endereco: string;
  telefone: string;
};

/** "—" (placeholder do data layer) → vazio, para não poluir o documento. */
export const limpo = (v: string | null | undefined): string =>
  v && v !== "—" ? v : "";

/** Escapa texto para inserção segura no documento de impressão. */
export function esc(v: string): string {
  return v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Escapa e converte quebras de linha em <br> (preserva o layout do textarea). */
export function corpoTexto(v: string): string {
  return esc(v).replace(/\n/g, "<br>");
}

export function hojeBR(): string {
  return new Date().toLocaleDateString("pt-BR");
}

// ── Cabeçalho (box da clínica + box de carimbo/assinatura) ───────
export function cabecalhoHTML(clinica: ClinicaImpressao): string {
  const sub = [limpo(clinica.endereco), limpo(clinica.telefone)]
    .filter(Boolean)
    .join(" · ");
  return `
  <div class="topo">
    <div class="clinica-box">
      <div class="clinica">${esc(clinica.nome)}</div>
      ${sub ? `<div class="clinica-sub">${esc(sub)}</div>` : ""}
      ${limpo(clinica.cnpj) ? `<div class="clinica-sub">CNPJ: ${esc(clinica.cnpj)}</div>` : ""}
    </div>
    <div class="carimbo">CARIMBO E ASSINATURA DO PROFISSIONAL</div>
  </div>`;
}

// ── Identificação do paciente ────────────────────────────────────
export type CampoIdent = { lbl: string; val: string; span?: number };

/**
 * Tabela de identificação. `nome` sai numa linha própria (largura total);
 * os demais campos são dispostos em pares (2 por linha / 4 colunas). Um
 * campo com `span: 3` ocupa a linha inteira (ex.: Endereço).
 */
export function identPacienteHTML(nome: string, campos: CampoIdent[]): string {
  const linhas: string[] = [
    `<tr><td class="lbl">Paciente</td><td class="val" colspan="3">${esc(nome)}</td></tr>`,
  ];
  let i = 0;
  while (i < campos.length) {
    const c = campos[i];
    if (c.span === 3) {
      linhas.push(
        `<tr><td class="lbl">${esc(c.lbl)}</td><td class="val" colspan="3">${esc(c.val)}</td></tr>`,
      );
      i += 1;
      continue;
    }
    const d = campos[i + 1];
    if (d && d.span !== 3) {
      linhas.push(
        `<tr><td class="lbl">${esc(c.lbl)}</td><td class="val">${esc(c.val)}</td><td class="lbl">${esc(d.lbl)}</td><td class="val">${esc(d.val)}</td></tr>`,
      );
      i += 2;
    } else {
      linhas.push(
        `<tr><td class="lbl">${esc(c.lbl)}</td><td class="val" colspan="3">${esc(c.val)}</td></tr>`,
      );
      i += 1;
    }
  }
  return `<table class="ident">${linhas.join("")}</table>`;
}

// ── Rodapé: data + assinatura (empurrado para o fim da folha) ────
export function rodapeAssinaturaProfissional(
  nome: string,
  conselho: string,
  dataLinha = `Local e data: ${hojeBR()}`,
): string {
  return `
  <div class="rodape">
    ${dataLinha ? `<div class="data">${esc(dataLinha)}</div>` : ""}
    <div class="assinatura">
      <div class="assin-linha"></div>
      <div class="assin-nome">${esc(limpo(nome) || "Profissional responsável")}</div>
      ${limpo(conselho) ? `<div class="assin-conselho">${esc(conselho)}</div>` : `<div class="assin-conselho">Assinatura e carimbo</div>`}
    </div>
  </div>`;
}

export function rodapeAssinaturaPaciente(dataLinha = ""): string {
  return `
  <div class="rodape">
    ${dataLinha ? `<div class="data">${esc(dataLinha)}</div>` : ""}
    <div class="assinatura">
      <div class="assin-linha"></div>
      <div class="assin-conselho">Assinatura do Paciente / Responsável</div>
    </div>
  </div>`;
}

const CSS = `
  * { box-sizing: border-box; }
  @page { size: A4; margin: 14mm; }
  html, body { height: 100%; }
  body { font-family: Arial, Helvetica, sans-serif; color: #111; margin: 0; line-height: 1.5; }
  .folha { display: flex; flex-direction: column; min-height: calc(297mm - 28mm); }

  .topo { display: flex; justify-content: space-between; gap: 16px; align-items: stretch; }
  .clinica-box { border: 1px solid #666; padding: 8px 12px; flex: 1; }
  .clinica { font-size: 15px; font-weight: bold; }
  .clinica-sub { font-size: 11px; color: #555; margin-top: 2px; }
  .carimbo { border: 1px solid #666; padding: 8px 12px; width: 210px; font-size: 10px; color: #555; display: flex; align-items: flex-end; justify-content: center; text-align: center; }

  .titulo { text-align: center; font-size: 13px; font-weight: bold; letter-spacing: 1.5px; margin: 14px 0 10px; }

  table.ident { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
  table.ident td { border: 1px solid #888; padding: 5px 8px; font-size: 12px; }
  table.ident td.lbl { color: #555; width: 110px; white-space: nowrap; }
  table.ident td.val { font-weight: 500; }

  .corpo { border: 1px solid #888; padding: 12px; min-height: 200px; font-size: 13px; }
  .corpo p { margin: 0 0 10px; }
  .corpo .just { text-align: justify; }
  .corpo-lbl { font-size: 12px; color: #555; margin-bottom: 4px; }

  /* Data + assinatura no fim da folha */
  .rodape { margin-top: auto; }
  .data { font-size: 12px; margin: 14px 0 26px; }
  .assinatura { text-align: center; }
  .assin-linha { border-top: 1px solid #111; width: 60%; margin: 0 auto 4px; }
  .assin-nome { font-size: 12px; font-weight: 600; }
  .assin-conselho { font-size: 11px; color: #555; }
`;

export type DocumentoBaseOpts = {
  titulo: string;
  clinica: ClinicaImpressao;
  pacienteNome: string;
  /** HTML da tabela de identificação (use identPacienteHTML). */
  identHTML: string;
  /** HTML do corpo do documento. */
  corpoHTML: string;
  /** HTML do rodapé (data + assinatura). */
  rodapeHTML: string;
  /** CSS extra específico do documento (opcional). */
  cssExtra?: string;
};

/** Monta o HTML A4 completo de um documento seguindo o modelo padrão. */
export function montarDocumentoBase(opts: DocumentoBaseOpts): string {
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<title>${esc(opts.titulo)} — ${esc(opts.pacienteNome)}</title>
<style>${CSS}${opts.cssExtra ?? ""}</style>
</head>
<body>
  <div class="folha">
    ${cabecalhoHTML(opts.clinica)}
    <div class="titulo">${esc(opts.titulo)}</div>
    ${opts.identHTML}
    <div class="corpo">${opts.corpoHTML}</div>
    ${opts.rodapeHTML}
  </div>
</body>
</html>`;
}

/** Abre um documento HTML numa janela nova e dispara a impressão. */
export function abrirImpressao(html: string, erro = "Permita pop-ups para imprimir o documento."): void {
  const win = window.open("", "_blank", "width=820,height=1040");
  if (!win) {
    toast.error(erro);
    return;
  }
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 150);
}

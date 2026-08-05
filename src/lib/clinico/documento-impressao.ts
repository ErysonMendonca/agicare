// ════════════════════════════════════════════════════════════════
// BASE compartilhada de impressão dos documentos do prontuário/recepção.
//
// Encapsula o MODELO padrão aprovado (extraído do Receituário de Controle
// Especial, ajustado ao padrão da Anamnese): cabeçalho da clínica (sem
// carimbo — removido a pedido), título centralizado, tabela de
// identificação do paciente, corpo com moldura e o bloco DATA + ASSINATURA
// DO PROFISSIONAL logo abaixo do conteúdo (2 espaçamentos), sem caixa de
// carimbo e sem ficar empurrado para o fim da folha A4.
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
  logo?: string | null;
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

// ── Cabeçalho (box da clínica) ────────────────────────────────────
// Observação: o box de "carimbo e assinatura do profissional" foi removido
// (a pedido) do cabeçalho de todos os documentos. A função mantém o nome e
// a assinatura para não exigir alterações em todos os call sites.
export function cabecalhoHTML(clinica: ClinicaImpressao): string {
  const sub = [limpo(clinica.endereco), limpo(clinica.telefone)]
    .filter(Boolean)
    .join(" · ");

  return `
  <div class="topo">
    <div class="clinica-box">
      ${clinica.logo ? `<div class="clinica-logo-wrap"><img src="${esc(clinica.logo)}" alt="Logo" /></div>` : ""}
      <div class="clinica-info">
        <div class="clinica">${esc(clinica.nome)}</div>
        ${sub ? `<div class="clinica-sub">${esc(sub)}</div>` : ""}
        ${limpo(clinica.cnpj) ? `<div class="clinica-sub">CNPJ: ${esc(clinica.cnpj)}</div>` : ""}
      </div>
    </div>
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

// ── Campos de identificação PADRÃO (todos os relatórios do prontuário) ──
// Conjunto mínimo exigido em Anamnese, Evolução, Exames, Protético,
// Receituário, Alta, Atestado, Ortograma, Procedimento, Enfermagem, etc.:
// Prontuário, Atendimento, Convênio, Plano, Data de Admissão, Data de
// Nascimento, Idade, Sexo e Nome da Mãe (o Nome do paciente já sai à parte,
// na 1ª linha da tabela — ver `identPacienteHTML`). Cada documento pode
// completar o array com campos próprios (ex.: Data do registro).
export type IdentPadrao = {
  registro: string;
  atendimento: string | null;
  convenio: string;
  plano: string;
  dataAdmissao: string;
  nascimento: string;
  idade: string;
  sexo: string;
  nomeMae: string;
};

export function camposIdentPadrao(d: IdentPadrao): CampoIdent[] {
  return [
    { lbl: "Prontuário", val: d.registro },
    { lbl: "Atendimento", val: d.atendimento ?? "—" },
    { lbl: "Convênio", val: d.convenio },
    { lbl: "Plano", val: d.plano },
    { lbl: "Data de Admissão", val: d.dataAdmissao },
    { lbl: "Data de Nascimento", val: d.nascimento },
    { lbl: "Idade", val: d.idade },
    { lbl: "Sexo", val: d.sexo },
    { lbl: "Nome da Mãe", val: d.nomeMae, span: 3 },
  ];
}

// ── Rodapé: assinatura (perto do fim da folha, sem virar rodapé fixo) ─────
// Observação: o box de carimbo do CABEÇALHO foi removido de todos os
// documentos. Aqui no rodapé fica só a linha de assinatura do profissional
// (sem caixa/carimbo). Fica empurrada para perto do FIM da folha A4 (.rodape
// com margin-top:auto dentro do .folha flex), com uma folga antes da margem
// inferior da página — não fica colada nela, e não é um rodapé repetido em
// toda página (documento de 1 folha). A linha "Local e data" foi removida (a
// pedido): a data já consta na identificação do paciente em todos os documentos.
export function rodapeAssinaturaProfissional(
  nome: string,
  conselho: string,
  dataLinha = "",
): string {
  return `
  <div class="rodape">
    ${dataLinha ? `<div class="data">${esc(dataLinha)}</div>` : ""}
    <div class="assinatura">
      <div class="assin-linha"></div>
      <div class="assin-nome">${esc(limpo(nome) || "Profissional responsável")}</div>
      ${limpo(conselho) ? `<div class="assin-conselho">${esc(conselho)}</div>` : `<div class="assin-conselho">Assinatura</div>`}
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

  .topo { display: flex; gap: 16px; align-items: stretch; }
  .clinica-box { border: 1px solid #666; padding: 8px 12px; flex: 1; display: flex; gap: 16px; align-items: center; }
  .clinica-logo-wrap { height: 48px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; }
  .clinica-logo-wrap img { max-height: 100%; max-width: 140px; object-fit: contain; }
  .clinica-info { flex: 1; display: flex; flex-direction: column; justify-content: center; }
  .clinica { font-size: 15px; font-weight: bold; }
  .clinica-sub { font-size: 11px; color: #555; margin-top: 2px; }

  .titulo { text-align: center; font-size: 13px; font-weight: bold; letter-spacing: 1.5px; margin: 14px 0 10px; }

  table.ident { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
  table.ident td { border: 1px solid #888; padding: 5px 8px; font-size: 12px; }
  table.ident td.lbl { color: #555; width: 110px; white-space: nowrap; }
  table.ident td.val { font-weight: 500; }

  .corpo { border: 1px solid #888; padding: 12px; min-height: 200px; font-size: 13px; }
  .corpo p { margin: 0 0 10px; }
  .corpo .just { text-align: justify; }
  .corpo-lbl { font-size: 12px; color: #555; margin-bottom: 4px; }

  /* Data + assinatura: empurrada para perto do fim da folha (margin-top:
     auto, dentro do .folha flex), mas com uma folga antes da margem inferior
     da página — não fica colada nela nem vira um rodapé fixo/repetido. */
  .rodape { margin-top: auto; padding-top: 2em; margin-bottom: 10mm; }
  .data { font-size: 12px; margin: 0 0 26px; }
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

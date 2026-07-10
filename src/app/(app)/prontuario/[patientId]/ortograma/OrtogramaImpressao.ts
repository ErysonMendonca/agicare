import { toast } from "sonner";
import {
  ARCO_INFERIOR,
  ARCO_SUPERIOR,
  MARCACOES,
  MARCACAO_LABELS,
  MARCACAO_SIMBOLOS,
  TODOS_OS_DENTES,
  calcularResumo,
  isAusente,
  isHigido,
  marcasDoDente,
  observacoesAutomaticas,
  type Marca,
  type Marcacao,
} from "@/lib/clinico/ortograma.shared";
import {
  VIEWBOX_OCLUSAL,
  VIEWBOX_VESTIBULAR,
  coroaPath,
  coroaSulcos,
  espelhado,
  isSuperior,
  oclusalPath,
  oclusalSulcos,
  raizesPaths,
} from "@/components/clinico/dente-paths";
import {
  DESENHO_OCLUSAL,
  DESENHO_VESTIBULAR,
  ocultaSulcos,
  substituiRaiz,
  type Traco,
} from "@/components/clinico/marcacao-desenho";

// ════════════════════════════════════════════════════════════════
// Impressão A4 do ORTOGRAMA. Espelha o padrão do Atestado
// (`AtestadoImpressao.ts`) e do Receituário: monta um documento HTML
// completo e o abre numa JANELA NOVA, com estilos próprios.
//
// NUNCA trocar `document.body.innerHTML` para imprimir: isso destrói a
// árvore React da tela viva (foi o que quebrou o faturamento —
// ver `ConferenciaModal.tsx:imprimirRecibo`).
//
// O documento é em PRETO E BRANCO: as marcações se distinguem pelo
// SÍMBOLO (`MARCACAO_SIMBOLOS`), nunca pela cor. É exatamente por isso
// que os símbolos existem no contrato.
// ════════════════════════════════════════════════════════════════

export type CabecalhoOrtograma = {
  paciente: string;
  nascimento: string;
  prontuario: string;
  data: string;
  profissional: string;
  cro: string;
};

/** "—" (placeholder do data layer) → vazio, para não poluir o documento. */
const limpo = (v: string) => (v && v !== "—" ? v : "");

/** Escapa texto para inserção segura no documento de impressão. */
function esc(v: string): string {
  return v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Atributos comuns dos traços — o documento é P&B, tudo em preto. */
const TRACO = 'fill="none" stroke="#111" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round"';

/**
 * Face oclusal (vista de cima) com os símbolos das marcações sobrepostos, como
 * no ortograma de referência. Dente ausente sai pontilhado e esmaecido.
 */
function svgOclusal(marcas: Marca[], tooth: number): string {
  const ausente = isAusente(marcas, tooth);
  const dash = ausente ? 'stroke-dasharray="2.5 2"' : "";
  const op = ausente ? 'opacity="0.45"' : "";
  const sulcos = ausente
    ? ""
    : oclusalSulcos(tooth)
        .map((d: string) => `<path d="${d}" ${TRACO} />`)
        .join("");

  // Quadrantes esquerdos são a imagem especular do homólogo direito.
  const flip = espelhado(tooth)
    ? 'transform="scale(-1,1) translate(-36,0)"'
    : "";

  // A marcação altera o desenho, igual à tela. Aqui tudo em preto: é a FORMA
  // que carrega a informação no papel, não a cor.
  const marca = ausente
    ? ""
    : marcasDoDente(marcas, tooth)
        .flatMap((m: Marcacao) => DESENHO_OCLUSAL[m] ?? [])
        .map((t: Traco) => tracoSvg(t))
        .join("");

  return `<svg viewBox="${VIEWBOX_OCLUSAL}" class="oclusal" ${op}>
    <g ${flip}><path d="${oclusalPath(tooth)}" ${TRACO} ${dash} />${sulcos}</g>${marca}
  </svg>`;
}

/** Um traço de marcação como <path> preto — ver `marcacao-desenho.ts`. */
function tracoSvg(t: Traco): string {
  const fill = t.fill ? '#111' : "none";
  const stroke = t.fill ? "none" : "#111";
  const dash = t.dash ? `stroke-dasharray="${t.dash}"` : "";
  return `<path d="${t.d}" fill="${fill}" stroke="${stroke}" stroke-width="${t.width ?? 1.6}" stroke-linecap="${t.cap ?? "round"}" stroke-linejoin="round" ${dash} />`;
}

/**
 * Vista vestibular (coroa + raízes). O arco SUPERIOR é espelhado na vertical
 * (raízes para cima, no maxilar) e os quadrantes esquerdos, na horizontal.
 */
function svgVestibular(marcas: Marca[], tooth: number): string {
  const superior = isSuperior(tooth);
  const ausente = isAusente(marcas, tooth);
  const dash = ausente ? 'stroke-dasharray="2.5 2"' : "";
  const op = ausente ? 'opacity="0.45"' : "";

  const doDente: Marcacao[] = ausente ? [] : marcasDoDente(marcas, tooth);
  const semRaiz = substituiRaiz(doDente);
  const semSulcos = ocultaSulcos(doDente);

  // O implante ocupa o lugar da raiz — não desenhamos as duas.
  const rz = semRaiz
    ? ""
    : raizesPaths(tooth)
        .map((d: string) => `<path d="${d}" ${TRACO} ${dash} />`)
        .join("");

  // Sulcos: some no dente ausente e sob a coroa protética.
  const sulcos =
    ausente || semSulcos
      ? ""
      : coroaSulcos(tooth)
          .map(
            (d: string) =>
              `<path d="${d}" fill="none" stroke="#111" stroke-width="0.9" opacity="0.7" />`,
          )
          .join("");

  const marca = doDente
    .flatMap((m: Marcacao) => DESENHO_VESTIBULAR[m] ?? [])
    .map((t: Traco) => tracoSvg(t))
    .join("");

  const t = [
    superior ? "scale(1,-1) translate(0,-64)" : "",
    espelhado(tooth) ? "scale(-1,1) translate(-36,0)" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const flip = t ? `transform="${t}"` : "";

  return `<svg viewBox="${VIEWBOX_VESTIBULAR}" class="vestibular" ${op}>
    <g ${flip}>${rz}<path d="${coroaPath(tooth)}" ${TRACO} ${dash} />${sulcos}${marca}</g>
  </svg>`;
}

/**
 * Um arco: número, face oclusal e vista vestibular — três faixas, como no
 * documento de referência. No arco inferior a ordem se inverte (vestibular em
 * cima, oclusal embaixo, número por último), espelhando a leitura da boca.
 */
function arco(titulo: string, dentes: number[], marcas: Marca[]): string {
  const cel = (conteudo: string, tooth: number) =>
    `<td class="dente${isHigido(marcas, tooth) ? "" : " marcado"}">${conteudo}</td>`;

  const faixa = (render: (t: number) => string) =>
    "<tr>" +
    dentes
      .map(
        (t, i) => cel(render(t), t) + (i === 7 ? '<td class="linha-media"></td>' : ""),
      )
      .join("") +
    "</tr>";

  const numeros = faixa((t) => `<div class="num">${t}</div>`);
  const oclusais = faixa((t) => svgOclusal(marcas, t));
  const vestibulares = faixa((t) => svgVestibular(marcas, t));

  const superior = isSuperior(dentes[0]);
  const linhas = superior
    ? numeros + oclusais + vestibulares
    : vestibulares + oclusais + numeros;

  return `<section class="arco">
    <h2>${esc(titulo)}</h2>
    <div class="lados"><span>Lado direito</span><span>Lado esquerdo</span></div>
    <table class="arco-tab"><tbody>${linhas}</tbody></table>
  </section>`;
}

function montarDocumento(
  cab: CabecalhoOrtograma,
  marcas: Marca[],
  notes: string,
): string {
  const resumo = calcularResumo(marcas);
  const observacoes = observacoesAutomaticas(marcas);

  // Só as marcações realmente usadas entram na legenda impressa: uma legenda de
  // 11 itens para um exame com duas marcações é ruído em papel.
  const usadas = MARCACOES.filter((m) => resumo[m] > 0);
  const legenda = (usadas.length > 0 ? usadas : MARCACOES)
    .map(
      (m) =>
        `<li><span class="sim">${esc(MARCACAO_SIMBOLOS[m])}</span> ${esc(
          MARCACAO_LABELS[m],
        )}</li>`,
    )
    .join("");

  const linhasResumo = [
    `<tr><td>Dentes hígidos</td><td class="n">${resumo.higidos}/${TODOS_OS_DENTES.length}</td></tr>`,
    ...MARCACOES.filter((m) => resumo[m] > 0).map(
      (m) =>
        `<tr><td><span class="sim">${esc(MARCACAO_SIMBOLOS[m])}</span> ${esc(
          MARCACAO_LABELS[m],
        )}</td><td class="n">${resumo[m]}</td></tr>`,
    ),
  ].join("");

  const auto =
    observacoes.length > 0
      ? `<ul class="obs-lista">${observacoes
          .map((l) => `<li>${esc(l)}</li>`)
          .join("")}</ul>`
      : `<p class="vazio">Nenhum dente marcado — arcada hígida.</p>`;

  const livre = limpo(notes.trim())
    ? `<p class="obs-livre">${esc(notes.trim()).replace(/\n/g, "<br />")}</p>`
    : "";

  const campo = (rotulo: string, valor: string) =>
    `<div><span class="label">${esc(rotulo)}</span><strong>${
      esc(limpo(valor)) || "—"
    }</strong></div>`;

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<title>Ortograma — ${esc(cab.paciente)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: black; margin: 28px; line-height: 1.4; }
  h1 { font-size: 16px; letter-spacing: 2px; text-align: center; margin: 0 0 18px; }
  .cab { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px 20px;
         border: 1px solid black; padding: 12px; font-size: 12px; margin-bottom: 20px; }
  .cab .label { display: block; font-size: 9px; text-transform: uppercase; letter-spacing: .5px; color: dimgray; }
  .arco { margin-bottom: 18px; }
  .arco h2 { font-size: 11px; text-transform: uppercase; letter-spacing: 1px; margin: 0 0 4px; }
  .lados { display: flex; justify-content: space-around; font-size: 9px;
           text-transform: uppercase; letter-spacing: .5px; color: dimgray; margin-bottom: 2px; }
  .arco-tab { width: 100%; border-collapse: collapse; table-layout: fixed; }
  /* Sem bordas: o desenho do dente é a célula. A marcação já se lê pelo símbolo. */
  .dente { text-align: center; padding: 1px 0; vertical-align: middle; }
  .dente.marcado { background: transparent; }
  .num { font-size: 9px; color: dimgray; padding: 2px 0; }
  /* Proporções dos viewBox: oclusal 36x36 (quadrado), vestibular 36x64. */
  .oclusal { width: 26px; height: 26px; display: block; margin: 0 auto; }
  .vestibular { width: 24px; height: 43px; display: block; margin: 0 auto; }
  .linha-media { width: 6px; border: 0; border-left: 2px solid black; }
  .paineis { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-top: 6px; }
  .painel { border: 1px solid black; padding: 10px 12px; }
  .painel h3 { font-size: 10px; text-transform: uppercase; letter-spacing: 1px; margin: 0 0 8px; }
  .painel ul { margin: 0; padding-left: 0; list-style: none; font-size: 11px; }
  .painel li { margin-bottom: 3px; }
  .sim { display: inline-block; width: 16px; font-weight: bold; }
  .obs-lista li { margin-bottom: 2px; }
  .obs-livre { font-size: 11px; margin: 8px 0 0; padding-top: 8px; border-top: 1px dashed dimgray; white-space: pre-wrap; }
  .vazio { font-size: 11px; color: dimgray; margin: 0; }
  table.resumo { width: 100%; border-collapse: collapse; font-size: 11px; }
  table.resumo td { padding: 2px 0; }
  table.resumo td.n { text-align: right; font-weight: bold; }
  .sign { margin-top: 48px; text-align: center; }
  .sign-line { width: 280px; margin: 0 auto; border-top: 1px solid black; padding-top: 6px; font-size: 12px; }
  .sign-sub { font-size: 10px; color: dimgray; }
  .foot { margin-top: 20px; font-size: 9px; color: gray; text-align: center; }
  @media print { body { margin: 12mm; } .painel, .dente { break-inside: avoid; } }
</style>
</head>
<body>
  <h1>ORTOGRAMA</h1>

  <div class="cab">
    ${campo("Paciente", cab.paciente)}
    ${campo("Data de nascimento", cab.nascimento)}
    ${campo("Prontuário", cab.prontuario)}
    ${campo("Data", cab.data)}
    ${campo("Profissional", cab.profissional)}
    ${campo("CRO", cab.cro)}
  </div>

  ${arco("Arco superior", ARCO_SUPERIOR, marcas)}
  ${arco("Arco inferior", ARCO_INFERIOR, marcas)}

  <div class="paineis">
    <div class="painel">
      <h3>Legenda</h3>
      <ul>${legenda}</ul>
    </div>
    <div class="painel">
      <h3>Resumo</h3>
      <table class="resumo"><tbody>${linhasResumo}</tbody></table>
    </div>
  </div>

  <div class="painel" style="margin-top:14px">
    <h3>Observações / Anotações</h3>
    ${auto}
    ${livre}
  </div>

  <div class="sign">
    <div class="sign-line">
      ${esc(limpo(cab.profissional) || "Profissional responsável")}
      <div class="sign-sub">Assinatura e carimbo${
        limpo(cab.cro) ? ` — ${esc(cab.cro)}` : " (CRO)"
      }</div>
    </div>
  </div>

  <div class="foot">Documento gerado eletronicamente pelo agicare.</div>
</body>
</html>`;
}

/** Abre o ortograma numa janela nova e dispara a impressão (só o documento). */
export function imprimirOrtograma(
  cab: CabecalhoOrtograma,
  marcas: Marca[],
  notes: string,
): void {
  const win = window.open("", "_blank", "width=900,height=1040");
  if (!win) {
    toast.error("Permita pop-ups para imprimir o ortograma.");
    return;
  }
  win.document.write(montarDocumento(cab, marcas, notes));
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 150);
}

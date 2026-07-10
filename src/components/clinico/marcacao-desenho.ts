/**
 * Desenho de cada marcação SOBRE o dente — dados PUROS, sem React.
 *
 * No ortograma impresso a marcação não é um ícone ao lado do dente: ela ALTERA
 * o desenho. O X da extração risca a face; a cárie é um ponto na coroa; o
 * implante troca a raiz por um parafuso; a prótese removível envolve o dente
 * numa caixa tracejada. É o que se lê de relance, sem consultar a legenda.
 *
 * Cada marcação diz em QUAL vista ela aparece — algumas nas duas:
 *   OCLUSAL     viewBox 36x36 — cárie, canal, extração, restauração, selante
 *   VESTIBULAR  viewBox 36x64 — implante, prótese fixa/removível, coroa
 *
 * As coordenadas são fixas (não dependem do dente): a marcação precisa ficar
 * igual em todos os 32, senão o dentista tem de reaprender a lê-la a cada
 * posição. A COR vem de `MARCACAO_CORES`; aqui só há forma — no papel, em preto
 * e branco, é a forma que carrega a informação.
 */

import type { Marcacao } from "@/lib/clinico/ortograma.shared";

/** Um traço do desenho. `fill: true` preenche com a cor da marcação. */
export type Traco = {
  d: string;
  /** Preenchido (mancha, ponto) em vez de contornado. */
  fill?: boolean;
  /** Espessura do traço (ignorada quando `fill`). */
  width?: number;
  /** Tracejado, no padrão do SVG. */
  dash?: string;
  /** Não escala com o dente: usado no parafuso do implante. */
  cap?: "round" | "butt";
};

// ── Vista oclusal (36x36) ────────────────────────────────────────
export const DESENHO_OCLUSAL: Partial<Record<Marcacao, Traco[]>> = {
  // Risca a face inteira: o dente será extraído.
  extracao_indicada: [
    { d: "M8 8 L28 28", width: 2.2 },
    { d: "M28 8 L8 28", width: 2.2 },
  ],
  // Uma diagonal (hachura) marcando o material restaurador.
  restauracao: [{ d: "M11 25 L25 11", width: 2.2 }],
  // Ponto sólido: a lesão.
  carie: [
    {
      d: "M18 13.5 A4.5 4.5 0 1 1 17.99 13.5 Z",
      fill: true,
    },
  ],
  // Mancha alongada seguindo o canal radicular.
  tratamento_canal: [
    {
      d: "M18 12 C21.5 12 23.5 14.5 23.5 18 C23.5 22 20.5 25 18 25 C15.5 25 12.5 22 12.5 18 C12.5 14.5 14.5 12 18 12 Z",
      fill: true,
    },
  ],
  // Selante: película cobrindo os sulcos (traço largo horizontal).
  selante: [{ d: "M9 18 H27", width: 2.6, cap: "round" }],
  // Asterisco: qualquer outra ocorrência.
  outros: [
    { d: "M18 10 V26", width: 1.6 },
    { d: "M11 14 L25 22", width: 1.6 },
    { d: "M25 14 L11 22", width: 1.6 },
  ],
};

// ── Vista vestibular (36x64) ─────────────────────────────────────
// Atenção: os paths nascem com a COROA em cima (y 0..30) e a RAIZ embaixo
// (y 30..64). O arco superior é espelhado na vertical pelo componente, então a
// marcação acompanha o dente automaticamente.
export const DESENHO_VESTIBULAR: Partial<Record<Marcacao, Traco[]>> = {
  // Coroa protética: capuz cobrindo toda a coroa natural. Precisa ser mais largo
  // que o MAIOR dente (o 46 vai de x=5.4 a x=30.6), senão a coroa real aparece
  // por fora do capuz — foi o que o teste de cobertura apontou.
  coroa: [
    {
      d: "M4.6 29.5 C3.6 20 5 11.5 8.5 6 C11 2.5 25 2.5 27.5 6 C31 11.5 32.4 20 31.4 29.5 Z",
      width: 2,
    },
  ],
  // Implante: pino + roscas no lugar da raiz.
  implante: [
    { d: "M18 30 V56", width: 2.4 },
    { d: "M13 35 H23", width: 1.6, cap: "round" },
    { d: "M13.5 39 H22.5", width: 1.6, cap: "round" },
    { d: "M14 43 H22", width: 1.6, cap: "round" },
    { d: "M14.5 47 H21.5", width: 1.6, cap: "round" },
    { d: "M15 51 H21", width: 1.6, cap: "round" },
  ],
  // Prótese fixa: barra atravessando o colo (no impresso liga dentes vizinhos).
  protese_fixa: [{ d: "M4 30.5 H32", width: 2.6, cap: "round" }],
  // Prótese removível: caixa tracejada envolvendo o dente.
  protese_removivel: [
    { d: "M4 3 H32 V61 H4 Z", width: 1.4, dash: "3 2.5" },
  ],
  // Extração indicada também risca a vista de frente, como no impresso.
  extracao_indicada: [
    { d: "M8 8 L28 26", width: 2 },
    { d: "M28 8 L8 26", width: 2 },
  ],
};

/**
 * O implante ocupa o lugar da raiz — desenhar os dois sobrepõe um parafuso a
 * uma raiz natural, que é justamente o que o implante substitui.
 */
export function substituiRaiz(marcacoes: Marcacao[]): boolean {
  return marcacoes.includes("implante");
}

/**
 * A coroa protética recobre a coroa natural: escondemos os sulcos, senão eles
 * "vazam" através do capuz.
 */
export function ocultaSulcos(marcacoes: Marcacao[]): boolean {
  return marcacoes.includes("coroa");
}

/** A marcação desenha alguma coisa na vista oclusal? */
export function temDesenhoOclusal(m: Marcacao): boolean {
  return (DESENHO_OCLUSAL[m]?.length ?? 0) > 0;
}

/** A marcação desenha alguma coisa na vista vestibular? */
export function temDesenhoVestibular(m: Marcacao): boolean {
  return (DESENHO_VESTIBULAR[m]?.length ?? 0) > 0;
}

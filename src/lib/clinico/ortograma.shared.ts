/**
 * Ortograma (odontograma) — parte PURA, sem dependências de servidor.
 *
 * Notação FDI (ISO 3950): o primeiro dígito é o quadrante (1=sup. direito,
 * 2=sup. esquerdo, 3=inf. esquerdo, 4=inf. direito) e o segundo é a posição,
 * de 1 (incisivo central) a 8 (terceiro molar). Cada quadrante tem os 8 dentes,
 * sem buracos.
 *
 * "Hígido" NÃO é uma marcação: é a ausência de marcações no dente. Guardar
 * hígido como marca criaria dois jeitos de dizer a mesma coisa e o Resumo
 * passaria a poder contar errado.
 */

export const MARCACOES = [
  "ausente",
  "extracao_indicada",
  "restauracao",
  "carie",
  "tratamento_canal",
  "coroa",
  "protese_fixa",
  "implante",
  "protese_removivel",
  "selante",
  "outros",
] as const;

export type Marcacao = (typeof MARCACOES)[number];

/** Rótulo PT-BR exibido na legenda e nas observações auto-geradas. */
export const MARCACAO_LABELS: Record<Marcacao, string> = {
  ausente: "Ausente",
  extracao_indicada: "Extração indicada",
  restauracao: "Restauração",
  carie: "Cárie",
  tratamento_canal: "Tratamento de canal",
  coroa: "Coroa",
  protese_fixa: "Prótese fixa",
  implante: "Implante",
  protese_removivel: "Prótese removível",
  selante: "Selante",
  outros: "Outros",
};

/**
 * "Ausente" é EXCLUSIVA: um dente que não existe não tem cárie nem coroa.
 * Aplicá-la remove as demais marcações do dente; aplicar qualquer outra num
 * dente ausente remove a ausência. A regra vive aqui (uma só definição) e é
 * aplicada tanto no clique da tela quanto na normalização do servidor.
 */
export const MARCACAO_EXCLUSIVA: Marcacao = "ausente";

/**
 * Cor de cada marcação. DEZ cores distintas, uma por marcação: um dente pode
 * ter várias marcações ao mesmo tempo, e duas marcações da mesma cor no mesmo
 * dente seriam indistinguíveis no desenho — que é justamente o que o ortograma
 * existe para comunicar.
 *
 * Cor NUNCA é o único canal: cada marcação também tem um símbolo próprio (ver
 * `MARCACAO_SIMBOLOS`), para leitura em impressão P&B e por daltônicos.
 */
export const MARCACAO_CORES: Record<Marcacao, string> = {
  ausente: "#475569", // ardósia (dente que não existe)
  extracao_indicada: "#e5484d", // vermelho
  restauracao: "#d6409f", // magenta
  carie: "#c62828", // vermelho escuro
  tratamento_canal: "#30a46c", // verde
  coroa: "#8e4ec6", // roxo
  protese_fixa: "#f5a524", // âmbar
  implante: "#3b82f6", // azul
  protese_removivel: "#0d9488", // teal
  selante: "#0ea5e9", // ciano
  outros: "#6b7280", // cinza
};

/**
 * Símbolo de cada marcação, espelhando a legenda do ortograma impresso. É o
 * canal REDUNDANTE à cor — sozinho já distingue as marcações em preto e branco.
 */
export const MARCACAO_SIMBOLOS: Record<Marcacao, string> = {
  ausente: "∅",
  extracao_indicada: "✕",
  restauracao: "╱",
  carie: "●",
  tratamento_canal: "▲",
  coroa: "♛",
  protese_fixa: "⌒",
  implante: "⌷",
  protese_removivel: "▢",
  selante: "▬",
  outros: "✳",
};

// ── Dentes (FDI permanente) ──────────────────────────────────────
/** Arco superior, da direita do paciente para a esquerda (como se vê de frente). */
export const ARCO_SUPERIOR: number[] = [
  18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28,
];

/** Arco inferior, mesma orientação. */
export const ARCO_INFERIOR: number[] = [
  48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38,
];

export const TODOS_OS_DENTES: number[] = [...ARCO_SUPERIOR, ...ARCO_INFERIOR];

/** O dente pertence à dentição permanente (FDI)? Sem buracos no quadrante. */
export function denteValido(tooth: number): boolean {
  return TODOS_OS_DENTES.includes(tooth);
}

// ── Modelo em memória ────────────────────────────────────────────
export type Marca = { tooth: number; marking: Marcacao; note?: string | null };

/** Marcações de um dente, na ordem canônica de `MARCACOES`. */
export function marcasDoDente(marcas: Marca[], tooth: number): Marcacao[] {
  const doDente = marcas.filter((m) => m.tooth === tooth).map((m) => m.marking);
  return MARCACOES.filter((m) => doDente.includes(m));
}

/** Dente sem nenhuma marcação = hígido. Um dente AUSENTE não é hígido. */
export function isHigido(marcas: Marca[], tooth: number): boolean {
  return !marcas.some((m) => m.tooth === tooth);
}

/** O dente foi marcado como ausente (não existe na boca do paciente)? */
export function isAusente(marcas: Marca[], tooth: number): boolean {
  return marcas.some(
    (m) => m.tooth === tooth && m.marking === MARCACAO_EXCLUSIVA,
  );
}

/**
 * Aplica (ou remove, se já existir) uma marcação num dente, respeitando a
 * exclusividade de "Ausente". Função PURA: a tela usa no clique e o servidor
 * usa para normalizar o payload — as duas bordas não podem discordar.
 */
export function aplicarMarcacao(
  marcas: Marca[],
  tooth: number,
  marking: Marcacao,
): Marca[] {
  const jaTem = marcas.some(
    (m) => m.tooth === tooth && m.marking === marking,
  );
  if (jaTem) {
    return marcas.filter((m) => !(m.tooth === tooth && m.marking === marking));
  }
  // "Ausente" zera o dente; qualquer outra marcação expulsa a ausência.
  const semConflito =
    marking === MARCACAO_EXCLUSIVA
      ? marcas.filter((m) => m.tooth !== tooth)
      : marcas.filter(
          (m) => !(m.tooth === tooth && m.marking === MARCACAO_EXCLUSIVA),
        );
  return [...semConflito, { tooth, marking }];
}

/**
 * Garante a invariante de exclusividade num conjunto de marcas vindo de fora
 * (payload do client, que pode estar adulterado): num dente ausente, descarta
 * todas as outras marcações.
 */
export function normalizarMarcas(marcas: Marca[]): Marca[] {
  const ausentes = new Set(
    marcas.filter((m) => m.marking === MARCACAO_EXCLUSIVA).map((m) => m.tooth),
  );
  return marcas.filter(
    (m) => !ausentes.has(m.tooth) || m.marking === MARCACAO_EXCLUSIVA,
  );
}

// ── Resumo ───────────────────────────────────────────────────────
export type Resumo = { higidos: number } & Record<Marcacao, number>;

/**
 * Contagens do quadro "Resumo". `higidos` conta DENTES (sem marcação alguma);
 * as demais contam OCORRÊNCIAS — um dente com canal + coroa soma 1 em cada,
 * já que um mesmo dente pode ter várias marcações.
 */
export function calcularResumo(marcas: Marca[]): Resumo {
  const base = MARCACOES.reduce(
    (acc, m) => ({ ...acc, [m]: 0 }),
    {} as Record<Marcacao, number>,
  );
  for (const m of marcas) {
    if (MARCACOES.includes(m.marking)) base[m.marking] += 1;
  }
  const comMarca = new Set(marcas.map((m) => m.tooth));
  return { ...base, higidos: TODOS_OS_DENTES.length - comMarca.size };
}

// ── Observações auto-geradas ─────────────────────────────────────
/**
 * Linhas "Dente 12: Cárie, Restauração" — uma por dente marcado, na ordem dos
 * arcos. É DERIVADO das marcas, nunca persistido: o texto livre do dentista
 * vive em `dental_charts.notes` e não é sobrescrito por isto.
 */
export function observacoesAutomaticas(marcas: Marca[]): string[] {
  return TODOS_OS_DENTES.filter((t) => !isHigido(marcas, t)).map((tooth) => {
    const rotulos = marcasDoDente(marcas, tooth).map((m) => MARCACAO_LABELS[m]);
    return `Dente ${tooth}: ${rotulos.join(", ")}`;
  });
}

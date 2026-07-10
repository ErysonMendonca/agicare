/**
 * Geometria dos 32 dentes permanentes (notação FDI) — dados PUROS, sem React.
 *
 * Vive separado dos componentes porque dois consumidores muito diferentes usam
 * a mesma anatomia: o React da tela e o gerador de HTML da impressão
 * (`OrtogramaImpressao.ts`, que monta string). Se cada um tivesse seus paths,
 * o documento impresso divergiria da tela na primeira alteração.
 *
 * ── Por que MEDIDAS e não 96 paths escritos à mão ──────────────
 * Cada dente é descrito por suas dimensões reais (largura mésio-distal,
 * comprimento da coroa, comprimento e número de raízes, cúspides), e os paths
 * são construídos a partir delas. Trinta e dois desenhos distintos, cada um
 * conferível pela sua linha de medidas — em vez de dezenas de strings soltas
 * onde um dígito errado passa despercebido.
 *
 * Medidas em milímetros, de Wheeler's Dental Anatomy, convertidas para o
 * viewBox por `MM_X`/`MM_Y`.
 *
 * ── Lados ───────────────────────────────────────────────────────
 * Só os quadrantes DIREITOS (1x e 4x) têm medidas. Os esquerdos (2x e 3x) são
 * a imagem especular do homólogo — é assim na boca e no ortograma impresso
 * (o 28 é o espelho do 18). `espelhado()` diz quando aplicar `scale(-1,1)`.
 *
 * Duas vistas, como no ortograma de referência:
 *   VESTIBULAR  o dente de frente: coroa + raiz(es).  viewBox 36x64
 *   OCLUSAL     a face mastigatória vista de cima.    viewBox 36x36
 */

export type ClasseDente = "incisivo" | "canino" | "premolar" | "molar";

/** Classe anatômica pela posição no quadrante (2º dígito da notação FDI). */
export function classeDoDente(tooth: number): ClasseDente {
  const pos = tooth % 10;
  if (pos <= 2) return "incisivo";
  if (pos === 3) return "canino";
  if (pos <= 5) return "premolar";
  return "molar";
}

/** Arco superior = quadrantes 1 e 2. */
export function isSuperior(tooth: number): boolean {
  return tooth < 30;
}

/** Quadrantes esquerdos (2x, 3x) são espelho horizontal do homólogo direito. */
export function espelhado(tooth: number): boolean {
  const q = Math.floor(tooth / 10);
  return q === 2 || q === 3;
}

/** Homólogo do quadrante direito: 21→11, 37→47. */
function homologo(tooth: number): number {
  const q = Math.floor(tooth / 10);
  const pos = tooth % 10;
  if (q === 2) return 10 + pos;
  if (q === 3) return 40 + pos;
  return tooth;
}

export const VIEWBOX_VESTIBULAR = "0 0 36 64";
export const VIEWBOX_OCLUSAL = "0 0 36 36";

// ── Medidas (mm) ─────────────────────────────────────────────────
type Spec = {
  /** Largura mésio-distal da coroa. */
  md: number;
  /** Comprimento (altura) da coroa. */
  coroa: number;
  /** Comprimento da raiz. */
  raiz: number;
  /** Número de raízes. */
  nRaizes: number;
  /** Cúspides na face vestibular (0 = borda incisal reta). */
  cuspides: number;
};

/** Quadrante superior direito (1x) e inferior direito (4x). */
const SPECS: Record<number, Spec> = {
  // Superiores
  11: { md: 8.5, coroa: 10.5, raiz: 13.0, nRaizes: 1, cuspides: 0 },
  12: { md: 6.5, coroa: 9.0, raiz: 13.0, nRaizes: 1, cuspides: 0 },
  13: { md: 7.5, coroa: 10.0, raiz: 17.0, nRaizes: 1, cuspides: 1 },
  14: { md: 7.0, coroa: 8.5, raiz: 14.0, nRaizes: 2, cuspides: 2 },
  // O 2º pré-molar superior é levemente menor que o 1º e tem raiz única.
  15: { md: 6.8, coroa: 8.2, raiz: 14.5, nRaizes: 1, cuspides: 2 },
  16: { md: 10.0, coroa: 7.5, raiz: 13.0, nRaizes: 3, cuspides: 4 },
  17: { md: 9.0, coroa: 7.0, raiz: 12.0, nRaizes: 3, cuspides: 4 },
  18: { md: 8.5, coroa: 6.5, raiz: 11.0, nRaizes: 2, cuspides: 3 },
  // Inferiores
  41: { md: 5.0, coroa: 9.0, raiz: 12.5, nRaizes: 1, cuspides: 0 },
  42: { md: 5.5, coroa: 9.5, raiz: 14.0, nRaizes: 1, cuspides: 0 },
  43: { md: 7.0, coroa: 11.0, raiz: 16.0, nRaizes: 1, cuspides: 1 },
  44: { md: 7.0, coroa: 8.5, raiz: 14.0, nRaizes: 1, cuspides: 2 },
  45: { md: 7.0, coroa: 8.0, raiz: 14.5, nRaizes: 1, cuspides: 2 },
  46: { md: 11.0, coroa: 7.5, raiz: 14.0, nRaizes: 2, cuspides: 5 },
  47: { md: 10.5, coroa: 7.0, raiz: 13.0, nRaizes: 2, cuspides: 4 },
  48: { md: 10.0, coroa: 7.0, raiz: 11.0, nRaizes: 2, cuspides: 4 },
};

/** mm → px do viewBox. O colo (base da coroa) fica em y=CERVICAL. */
const MM_X = 2.2;
const MM_Y = 2.0;
const CX = 18;
const CERVICAL = 30;

const n = (v: number) => Math.round(v * 100) / 100;

/** Medidas do dente, resolvendo o homólogo dos quadrantes esquerdos. */
function spec(tooth: number): Spec {
  return SPECS[homologo(tooth)];
}

// ── Vista vestibular ─────────────────────────────────────────────
/**
 * Contorno da coroa, do colo até a borda oclusal/incisal. As cúspides são
 * geradas a partir de `cuspides`: 0 = borda reta (incisivos), 1 = ponta única
 * (caninos), 2+ = cúspides alternando vale e pico (pré-molares e molares).
 */
export function coroaPath(tooth: number): string {
  const s = spec(tooth);
  const meia = (s.md * MM_X) / 2;
  const alt = s.coroa * MM_Y;
  const topo = CERVICAL - alt;
  // A coroa é nitidamente mais estreita no colo que na face oclusal, e as faces
  // laterais são CONVEXAS (maior contorno a ~1/3 da altura). Sem isso o dente
  // lê como um retângulo — foi o que a rasterização mostrou.
  const meiaColo = meia * 0.72;
  const bojo = meia * 1.04;

  const esqColo = n(CX - meiaColo);
  const dirColo = n(CX + meiaColo);
  const esqTopo = n(CX - meia);
  const dirTopo = n(CX + meia);
  const yMaior = n(topo + alt * 0.34);

  // Sobe do colo estufando para fora (bojo) e recolhe até o canto oclusal.
  const subida = `C${n(CX - bojo)} ${n(topo + alt * 0.78)} ${n(CX - bojo)} ${yMaior} ${esqTopo} ${n(topo + alt * 0.2)}`;
  const descida = `C${n(CX + bojo)} ${yMaior} ${n(CX + bojo)} ${n(topo + alt * 0.78)} ${dirColo} ${CERVICAL}`;

  let oclusal: string;
  if (s.cuspides === 0) {
    // Borda incisal reta com cantos arredondados.
    oclusal = `C${esqTopo} ${n(topo + 1.2)} ${n(esqTopo + 1)} ${n(topo)} ${n(esqTopo + 1.8)} ${n(topo)} L${n(dirTopo - 1.8)} ${n(topo)} C${n(dirTopo - 1)} ${n(topo)} ${dirTopo} ${n(topo + 1.2)} ${dirTopo} ${n(topo + alt * 0.2)}`;
  } else if (s.cuspides === 1) {
    // Cúspide única, ápice no centro.
    oclusal = `L${CX} ${n(topo)} L${dirTopo} ${n(topo + alt * 0.2)}`;
  } else {
    // n cúspides: picos no topo, vales entre eles (~35% da altura da cúspide).
    const passo = (dirTopo - esqTopo) / s.cuspides;
    const vale = n(topo + alt * 0.3);
    const partes: string[] = [];
    for (let i = 0; i < s.cuspides; i++) {
      const pico = n(esqTopo + passo * (i + 0.5));
      const fim = n(esqTopo + passo * (i + 1));
      partes.push(`L${pico} ${n(topo)}`);
      // O último "vale" é a própria descida para a face distal.
      partes.push(`L${fim} ${i === s.cuspides - 1 ? n(topo + alt * 0.2) : vale}`);
    }
    oclusal = partes.join(" ");
  }

  return `M${esqColo} ${CERVICAL} ${subida} ${oclusal} ${descida} Z`;
}

/**
 * Raízes como silhuetas fechadas que afinam até o ápice — no ortograma impresso
 * a raiz tem espessura e ponta, não é um risco. Distribuídas sob a coroa.
 */
export function raizesPaths(tooth: number): string[] {
  const s = spec(tooth);
  const meia = (s.md * MM_X) / 2;
  const comp = s.raiz * MM_Y;
  const apice = n(CERVICAL + comp);

  // Largura de cada raiz no colo: divide o colo entre elas, com folga.
  const larguraColo = (meia * 2 * 0.86) / s.nRaizes;
  const larg = larguraColo * (s.nRaizes === 1 ? 0.62 : 0.72);

  const out: string[] = [];
  for (let i = 0; i < s.nRaizes; i++) {
    const centro = CX - meia * 0.86 + larguraColo * (i + 0.5);
    // Raízes laterais divergem para fora; a única/central desce reta.
    const divergencia =
      s.nRaizes === 1 ? 0 : (centro - CX) * 0.35;
    const apx = n(centro + divergencia);
    const e = n(centro - larg / 2);
    const d = n(centro + larg / 2);
    const meioY = n(CERVICAL + comp * 0.55);

    out.push(
      `M${e} ${CERVICAL} ` +
        `C${n(e + divergencia * 0.4)} ${meioY} ${n(apx - larg * 0.16)} ${n(apice - comp * 0.12)} ${n(apx - 0.5)} ${n(apice - 0.6)} ` +
        `C${n(apx)} ${apice} ${n(apx)} ${apice} ${n(apx + 0.5)} ${n(apice - 0.6)} ` +
        `C${n(apx + larg * 0.16)} ${n(apice - comp * 0.12)} ${n(d + divergencia * 0.4)} ${meioY} ${d} ${CERVICAL} Z`,
    );
  }
  return out;
}

/** Sulcos que descem das cúspides. Incisivos não têm. */
export function coroaSulcos(tooth: number): string[] {
  const s = spec(tooth);
  if (s.cuspides === 0) return [];
  const meia = (s.md * MM_X) / 2;
  const alt = s.coroa * MM_Y;
  const topo = CERVICAL - alt;
  const esqTopo = CX - meia;
  const passo = (meia * 2) / s.cuspides;
  const fim = n(topo + alt * 0.62);

  if (s.cuspides === 1) return [`M${CX} ${n(topo + 1)} V${fim}`];
  // Um sulco em cada vale entre cúspides.
  const out: string[] = [];
  for (let i = 1; i < s.cuspides; i++) {
    const x = n(esqTopo + passo * i);
    out.push(`M${x} ${n(topo + alt * 0.28)} V${fim}`);
  }
  return out;
}

// ── Vista oclusal ────────────────────────────────────────────────
/** Contorno da face mastigatória. Anteriores são estreitos; molares, quadrangulares. */
export function oclusalPath(tooth: number): string {
  const s = spec(tooth);
  const classe = classeDoDente(tooth);
  const rx = n((s.md * MM_X) / 2);
  // Profundidade vestíbulo-lingual: anteriores são achatados.
  const ry = n(classe === "molar" ? rx * 0.95 : classe === "premolar" ? rx * 1.05 : rx * 1.35);
  const t = 18;

  if (classe === "molar") {
    // Quadrangular de cantos arredondados.
    const r = 4;
    return (
      `M${n(t - rx + r)} ${n(t - ry)} H${n(t + rx - r)} A${r} ${r} 0 0 1 ${n(t + rx)} ${n(t - ry + r)} ` +
      `V${n(t + ry - r)} A${r} ${r} 0 0 1 ${n(t + rx - r)} ${n(t + ry)} H${n(t - rx + r)} ` +
      `A${r} ${r} 0 0 1 ${n(t - rx)} ${n(t + ry - r)} V${n(t - ry + r)} A${r} ${r} 0 0 1 ${n(t - rx + r)} ${n(t - ry)} Z`
    );
  }
  // Elipse (incisivos/caninos achatados, pré-molares quase circulares).
  return (
    `M${t} ${n(t - ry)} C${n(t + rx * 0.75)} ${n(t - ry)} ${n(t + rx)} ${n(t - ry * 0.5)} ${n(t + rx)} ${t} ` +
    `C${n(t + rx)} ${n(t + ry * 0.5)} ${n(t + rx * 0.75)} ${n(t + ry)} ${t} ${n(t + ry)} ` +
    `C${n(t - rx * 0.75)} ${n(t + ry)} ${n(t - rx)} ${n(t + ry * 0.5)} ${n(t - rx)} ${t} ` +
    `C${n(t - rx)} ${n(t - ry * 0.5)} ${n(t - rx * 0.75)} ${n(t - ry)} ${t} ${n(t - ry)} Z`
  );
}

/** Sulcos da face oclusal — o que diferencia as faces entre si. */
export function oclusalSulcos(tooth: number): string[] {
  const s = spec(tooth);
  const classe = classeDoDente(tooth);
  const rx = (s.md * MM_X) / 2;
  const ry = classe === "molar" ? rx * 0.95 : classe === "premolar" ? rx * 1.05 : rx * 1.35;
  const t = 18;

  switch (classe) {
    case "incisivo":
      // Borda incisal: uma linha atravessando.
      return [`M${n(t - rx * 0.8)} ${t} H${n(t + rx * 0.8)}`];
    case "canino":
      // Cúspide única: "V" apontando para vestibular.
      return [`M${n(t - rx * 0.7)} ${n(t + ry * 0.45)} L${t} ${n(t - ry * 0.45)} L${n(t + rx * 0.7)} ${n(t + ry * 0.45)}`];
    case "premolar":
      // Sulco central entre as duas cúspides.
      return [
        `M${t} ${n(t - ry * 0.75)} V${n(t + ry * 0.75)}`,
        `M${n(t - rx * 0.55)} ${n(t - ry * 0.28)} L${t} ${t} L${n(t + rx * 0.55)} ${n(t - ry * 0.28)}`,
      ];
    case "molar": {
      // Sulco central + sulcos radiais, um por cúspide.
      const out = [`M${t} ${n(t - ry * 0.85)} V${n(t + ry * 0.85)}`];
      out.push(`M${n(t - rx * 0.85)} ${n(t - ry * 0.35)} L${t} ${n(t - ry * 0.05)} L${n(t + rx * 0.85)} ${n(t - ry * 0.35)}`);
      out.push(`M${n(t - rx * 0.85)} ${n(t + ry * 0.45)} L${t} ${n(t + ry * 0.15)} L${n(t + rx * 0.85)} ${n(t + ry * 0.45)}`);
      if (s.cuspides >= 5) {
        // O 5º cúspide do 1º molar inferior (cúspide distal).
        out.push(`M${t} ${n(t + ry * 0.15)} L${n(t + rx * 0.5)} ${n(t + ry * 0.8)}`);
      }
      return out;
    }
  }
}

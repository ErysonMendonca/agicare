/**
 * Dente anatômico do Ortograma (vista vestibular: coroa + raízes). Puro (sem
 * estado/eventos) — pode ser renderizado por Server ou Client Component.
 *
 * A geometria dos 32 dentes vive em `dente-paths.ts`, compartilhada com o
 * gerador do documento impresso — assim a tela e o papel nunca divergem.
 *
 * As cores vêm por prop (não de `currentColor`) porque coroa e traço mudam de
 * forma independente: o traço segue a 1ª marcação do dente, o preenchimento só
 * acende quando há marcação.
 */

import { MARCACAO_CORES, type Marcacao } from "@/lib/clinico/ortograma.shared";
import {
  VIEWBOX_VESTIBULAR,
  coroaPath,
  coroaSulcos,
  espelhado,
  isSuperior,
  raizesPaths,
} from "./dente-paths";
import {
  DESENHO_VESTIBULAR,
  ocultaSulcos,
  substituiRaiz,
} from "./marcacao-desenho";

export interface DenteSvgProps {
  tooth: number;
  className?: string;
  /** Cor do contorno (coroa + raízes). */
  stroke: string;
  /** Preenchimento da coroa. `none` para dente hígido. */
  fill?: string;
  /**
   * Dente marcado como AUSENTE (não existe na boca). Desenhado esmaecido e com
   * traço pontilhado: um dente ausente não pode ler como um dente são, e a
   * distinção precisa sobreviver ao P&B — por isso é o traço, não só a cor.
   */
  ausente?: boolean;
  /** Marcações do dente: desenhadas SOBRE ele, cada uma na sua cor. */
  marcacoes?: Marcacao[];
}

export function DenteSvg({
  tooth,
  className,
  stroke,
  fill = "none",
  ausente = false,
  marcacoes = [],
}: DenteSvgProps) {
  const superior = isSuperior(tooth);
  const tracejado = ausente ? "2.5 2" : undefined;
  const semRaiz = !ausente && substituiRaiz(marcacoes);
  const semSulcos = ocultaSulcos(marcacoes);

  // Os paths nascem com a coroa em cima e a raiz embaixo, no quadrante direito.
  // Na boca, é o arco SUPERIOR que tem as raízes para cima (ancoradas no
  // maxilar) — por isso é ele que se espelha na vertical. Os quadrantes
  // esquerdos (2x, 3x) são a imagem especular do homólogo direito.
  const transformacoes = [
    superior ? "scale(1,-1) translate(0,-64)" : "",
    espelhado(tooth) ? "scale(-1,1) translate(-36,0)" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <svg
      viewBox={VIEWBOX_VESTIBULAR}
      className={className}
      fill="none"
      opacity={ausente ? 0.45 : undefined}
      aria-hidden
      focusable="false"
    >
      <g transform={transformacoes || undefined}>
        {/* O implante ocupa o lugar da raiz — não desenhamos as duas. */}
        {!semRaiz &&
          raizesPaths(tooth).map((d) => (
            <path
              key={d}
              d={d}
              stroke={stroke}
              strokeWidth="1.3"
              strokeLinejoin="round"
              strokeDasharray={tracejado}
            />
          ))}
        <path
          d={coroaPath(tooth)}
          fill={ausente ? "none" : fill}
          stroke={stroke}
          strokeWidth="1.5"
          strokeLinejoin="round"
          strokeDasharray={tracejado}
        />
        {/* Sulcos: só com dente presente e sem coroa protética por cima. */}
        {!ausente &&
          !semSulcos &&
          coroaSulcos(tooth).map((d) => (
            <path key={d} d={d} stroke={stroke} strokeWidth="0.9" opacity="0.7" />
          ))}

        {/* Marcações dentro do grupo: acompanham o espelhamento do dente, e é o
            que faz o parafuso do implante descer no sentido da raiz. */}
        {!ausente &&
          marcacoes.map((m) =>
            (DESENHO_VESTIBULAR[m] ?? []).map((t, i) => (
              <path
                key={`${m}-${i}`}
                d={t.d}
                fill={t.fill ? MARCACAO_CORES[m] : "none"}
                stroke={t.fill ? "none" : MARCACAO_CORES[m]}
                strokeWidth={t.width ?? 1.6}
                strokeLinecap={t.cap ?? "round"}
                strokeLinejoin="round"
                strokeDasharray={t.dash}
              />
            )),
          )}
      </g>
    </svg>
  );
}

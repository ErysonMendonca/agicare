/**
 * Face oclusal do dente (vista de cima, com os sulcos) — a fileira que fica
 * junto ao número no ortograma impresso, onde vão os símbolos das marcações.
 *
 * A geometria dos 32 dentes vem de `dente-paths.ts`, a mesma do documento
 * impresso e da vista vestibular: tela e papel não podem divergir.
 */

import { MARCACAO_CORES, type Marcacao } from "@/lib/clinico/ortograma.shared";
import {
  VIEWBOX_OCLUSAL,
  espelhado,
  oclusalPath,
  oclusalSulcos,
} from "./dente-paths";
import { DESENHO_OCLUSAL } from "./marcacao-desenho";

export interface DenteOclusalSvgProps {
  tooth: number;
  className?: string;
  /** Cor do contorno e dos sulcos. */
  stroke: string;
  /** Preenchimento da face. `none` para dente hígido. */
  fill?: string;
  /** Dente ausente: esmaecido e pontilhado — não pode ler como dente são. */
  ausente?: boolean;
  /** Marcações do dente: desenhadas SOBRE a face, cada uma na sua cor. */
  marcacoes?: Marcacao[];
}

export function DenteOclusalSvg({
  tooth,
  className,
  stroke,
  fill = "none",
  ausente = false,
  marcacoes = [],
}: DenteOclusalSvgProps) {
  const tracejado = ausente ? "2.5 2" : undefined;
  // Quadrantes esquerdos são a imagem especular do homólogo direito.
  const transformacao = espelhado(tooth)
    ? "scale(-1,1) translate(-36,0)"
    : undefined;

  return (
    <svg
      viewBox={VIEWBOX_OCLUSAL}
      className={className}
      fill="none"
      opacity={ausente ? 0.45 : undefined}
      aria-hidden
      focusable="false"
    >
      <g transform={transformacao}>
        <path
          d={oclusalPath(tooth)}
          fill={ausente ? "none" : fill}
          stroke={stroke}
          strokeWidth="1.5"
          strokeLinejoin="round"
          strokeDasharray={tracejado}
        />
        {/* Sulcos: somem no dente ausente (não há face oclusal a descrever). */}
        {!ausente &&
          oclusalSulcos(tooth).map((d) => (
            <path
              key={d}
              d={d}
              stroke={stroke}
              strokeWidth="1"
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity="0.75"
            />
          ))}
      </g>

      {/* Marcações POR CIMA e FORA do grupo espelhado: um X espelhado continua
          um X, mas a assimetria de outras formas se perderia. */}
      {!ausente &&
        marcacoes.map((m) =>
          (DESENHO_OCLUSAL[m] ?? []).map((t, i) => (
            <path
              key={`${m}-${i}`}
              d={t.d}
              fill={t.fill ? MARCACAO_CORES[m] : "none"}
              stroke={t.fill ? "none" : MARCACAO_CORES[m]}
              strokeWidth={t.width ?? 1.6}
              strokeLinecap={t.cap ?? "round"}
              strokeDasharray={t.dash}
            />
          )),
        )}
    </svg>
  );
}

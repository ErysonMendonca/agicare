import { cn } from "@/lib/utils";

export interface SparklineProps {
  /** Pontos da série (ordem cronológica). Precisa de ≥2 p/ desenhar a linha. */
  data: number[];
  /** Classe utilitária (cor herdada via `currentColor`, altura, etc.). */
  className?: string;
  /** Desenha a área sutil sob a linha (default: true). */
  area?: boolean;
}

/**
 * Mini-gráfico de tendência (SVG puro, Server Component — sem dependências).
 * A cor vem de `currentColor`: aplique o tom no elemento pai/`className`.
 * `viewBox` 100×28 com `preserveAspectRatio="none"` p/ esticar na largura;
 * `vector-effect="non-scaling-stroke"` mantém o traço fino ao esticar.
 * Puramente decorativo → `aria-hidden`.
 */
export function Sparkline({ data, className, area = true }: SparklineProps) {
  if (!data || data.length < 2) return null;

  const W = 100;
  const H = 28;
  const PAD = 2; // respiro vertical p/ o traço não tocar as bordas

  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1; // evita divisão por zero (série constante)
  const stepX = W / (data.length - 1);

  const points = data.map((v, i) => {
    const x = i * stepX;
    // normaliza min→max no eixo Y invertido (SVG: 0 = topo)
    const y = PAD + (H - PAD * 2) * (1 - (v - min) / span);
    return [x, y] as const;
  });

  const line = points.map(([x, y]) => `${x},${y}`).join(" ");
  const first = points[0];
  const last = points[points.length - 1];
  const areaPath = [
    `M ${first[0]},${H}`,
    ...points.map(([x, y]) => `L ${x},${y}`),
    `L ${last[0]},${H}`,
    "Z",
  ].join(" ");

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
      className={cn("block", className)}
    >
      {area && (
        <path d={areaPath} fill="currentColor" fillOpacity={0.12} stroke="none" />
      )}
      <polyline
        points={line}
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

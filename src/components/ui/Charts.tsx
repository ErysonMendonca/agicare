"use client";

/** Gráficos leves em SVG (sem dependências), no estilo do Figma (teal). */

import { useState } from "react";

export type Serie = {
  /** Rótulo exibido no tooltip/legenda. */
  name: string;
  /** Cor da linha/preenchimento (hex). */
  color: string;
  /** Valores, um por label. */
  values: number[];
};

/**
 * Topo do eixo dividido em 4 intervalos de incremento "redondo".
 * Escolhe o menor passo cujo passo×4 cubra o valor → rótulos como 0/150/300/450/600.
 */
function niceMax(value: number, intervals = 4): number {
  if (value <= 0) return intervals;
  const steps = [1, 2, 5, 10, 20, 25, 50, 100, 150, 200, 250, 500, 1000, 2000, 5000];
  for (const s of steps) {
    if (s * intervals >= value) return s * intervals;
  }
  const mag = Math.pow(10, Math.floor(Math.log10(value)));
  const s = Math.ceil(value / intervals / mag) * mag;
  return s * intervals;
}

export function AreaChart({
  series,
  labels,
}: {
  series: Serie[];
  labels: string[];
}) {
  const [active, setActive] = useState<number | null>(null);

  const n = labels.length;
  const allValues = series.flatMap((s) => s.values);
  const max = niceMax(Math.max(...allValues, 0) * 1.05);

  // Coordenadas em 0–100 (mapeadas linearmente sobre a área de plotagem).
  const xAt = (i: number) => (n > 1 ? (i / (n - 1)) * 100 : 50);
  const yAt = (v: number) => 100 - (v / max) * 100;

  const ticks = [1, 0.75, 0.5, 0.25, 0];

  return (
    // Altura fixa (h-64) + gutters: esquerda p/ eixo Y, baixo p/ eixo X.
    <div className="relative h-64 w-full text-[11px]">
      {/* Rótulos do eixo Y (gutter esquerdo) */}
      <div className="absolute bottom-6 left-0 top-2 w-9">
        {ticks.map((t) => (
          <span
            key={t}
            className="absolute right-1 -translate-y-1/2 text-[#9aa1ad]"
            style={{ top: `${(1 - t) * 100}%` }}
          >
            {Math.round(max * t)}
          </span>
        ))}
      </div>

      {/* Área de plotagem */}
      <div className="absolute bottom-6 left-9 right-2 top-2">
        <svg
          className="absolute inset-0 h-full w-full"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          role="img"
          aria-label="Atendimentos mensais"
        >
          <defs>
            {series.map((s, si) => (
              <linearGradient
                key={si}
                id={`areaFill-${si}`}
                x1="0"
                y1="0"
                x2="0"
                y2="1"
              >
                <stop offset="0%" stopColor={s.color} stopOpacity="0.22" />
                <stop offset="100%" stopColor={s.color} stopOpacity="0" />
              </linearGradient>
            ))}
          </defs>

          {/* Gridlines horizontais */}
          {ticks.map((t) => (
            <line
              key={t}
              x1="0"
              x2="100"
              y1={(1 - t) * 100}
              y2={(1 - t) * 100}
              stroke="#eceef2"
              vectorEffect="non-scaling-stroke"
            />
          ))}

          {/* Áreas + linhas (1ª série desenhada por último → fica por cima) */}
          {[...series].reverse().map((s, ri) => {
            const si = series.length - 1 - ri;
            const pts = s.values.map((v, i) => [xAt(i), yAt(v)] as const);
            const line = pts
              .map((p, i) => `${i ? "L" : "M"}${p[0]},${p[1]}`)
              .join(" ");
            const area = `${line} L${pts[pts.length - 1][0]},100 L${pts[0][0]},100 Z`;
            return (
              <g key={si}>
                <path d={area} fill={`url(#areaFill-${si})`} />
                <path
                  d={line}
                  fill="none"
                  stroke={s.color}
                  strokeWidth="2.5"
                  vectorEffect="non-scaling-stroke"
                  strokeLinejoin="round"
                />
              </g>
            );
          })}

          {/* Linha-guia vertical do ponto ativo */}
          {active !== null && (
            <line
              x1={xAt(active)}
              x2={xAt(active)}
              y1="0"
              y2="100"
              stroke="#cbd5e1"
              strokeDasharray="3 3"
              vectorEffect="non-scaling-stroke"
            />
          )}
        </svg>

        {/* Marcadores (HTML, sem distorção) */}
        {active !== null &&
          series.map((s) => (
            <span
              key={s.name}
              className="pointer-events-none absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-[2px] bg-white"
              style={{
                left: `${xAt(active)}%`,
                top: `${yAt(s.values[active])}%`,
                borderColor: s.color,
              }}
            />
          ))}

        {/* Zonas de hover (uma por ponto) */}
        {labels.map((l, i) => (
          <button
            key={`hit-${i}`}
            type="button"
            aria-label={`${l}: ${series.map((s) => `${s.name} ${s.values[i]}`).join(", ")}`}
            className="absolute top-0 h-full -translate-x-1/2 cursor-default"
            style={{ left: `${xAt(i)}%`, width: `${100 / n}%` }}
            onMouseEnter={() => setActive(i)}
            onMouseLeave={() => setActive((a) => (a === i ? null : a))}
            onFocus={() => setActive(i)}
            onBlur={() => setActive((a) => (a === i ? null : a))}
          />
        ))}

        {/* Tooltip (HTML) */}
        {active !== null && (
          <div
            className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-[calc(100%+8px)] rounded-xl border border-line bg-white px-3 py-2 shadow-md"
            style={{
              left: `${xAt(active)}%`,
              top: `${yAt(Math.max(...series.map((s) => s.values[active])))}%`,
            }}
          >
            <div className="mb-1 text-xs font-semibold text-ink">
              {labels[active]}
            </div>
            {series.map((s) => (
              <div
                key={s.name}
                className="whitespace-nowrap text-xs"
                style={{ color: s.color }}
              >
                {s.name} : {s.values[active]}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Rótulos do eixo X */}
      <div className="absolute bottom-0 left-9 right-2 h-5">
        {labels.map((l, i) => (
          <span
            key={`xlabel-${i}`}
            className="absolute -translate-x-1/2 text-[#6b7280]"
            style={{ left: `${xAt(i)}%` }}
          >
            {l}
          </span>
        ))}
      </div>
    </div>
  );
}

export function BarChart({
  series,
  labels,
  height = 240,
}: {
  series: number[];
  labels: string[];
  height?: number;
}) {
  const w = 600;
  const h = height;
  const pad = 24;
  // Guarda contra série vazia ou toda-zero (ex.: indicador novo ainda sem dado):
  // Math.max(...[]) = -Infinity e divisão por 0 produziam NaN no y/height das barras.
  const rawMax = series.length ? Math.max(...series) : 0;
  const max = rawMax > 0 ? rawMax * 1.15 : 1;
  const slot = (w - pad * 2) / Math.max(1, series.length);
  const bw = slot * 0.5;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-60 w-full">
      <defs>
        <linearGradient id="barFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#0be0ae" />
          <stop offset="100%" stopColor="#0db8c2" />
        </linearGradient>
      </defs>
      {series.map((v, i) => {
        const bh = (v / max) * (h - pad * 2);
        return (
          <rect
            key={i}
            x={pad + i * slot + (slot - bw) / 2}
            y={h - pad - bh}
            width={bw}
            height={bh}
            rx="4"
            fill="url(#barFill)"
          />
        );
      })}
      {labels.map((l, i) => (
        <text
          key={`blabel-${i}`}
          x={pad + i * slot + slot / 2}
          y={h - 6}
          textAnchor="middle"
          className="fill-[#6b7280] text-[10px]"
        >
          {l}
        </text>
      ))}
    </svg>
  );
}

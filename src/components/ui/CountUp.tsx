"use client";

import { useEffect, useRef, useState } from "react";
import { animate, useInView } from "framer-motion";

type Parsed = {
  prefix: string;
  suffix: string;
  target: number;
  decimals: number;
  grouping: boolean;
};

/** Interpreta valores como "2.847", "R$ 182.4K", "87.5%", "R$ 1.980,00", 24. */
function parseValue(raw: string | number): Parsed | null {
  const s = String(raw).trim();
  const m = s.match(/^([^\d-]*)(-?[\d.,]+)(.*)$/);
  if (!m) return null;
  const prefix = m[1];
  const numStr = m[2];
  const suffix = m[3];
  const hasDot = numStr.includes(".");
  const hasComma = numStr.includes(",");

  let normalized = numStr;
  let decimals = 0;
  let grouping = false;

  if (hasDot && hasComma) {
    // pt-BR: "." milhar, "," decimal → 1.980,00
    normalized = numStr.replace(/\./g, "").replace(",", ".");
    decimals = (normalized.split(".")[1] ?? "").length;
    grouping = true;
  } else if (hasComma) {
    normalized = numStr.replace(",", ".");
    decimals = (normalized.split(".")[1] ?? "").length;
  } else if (hasDot) {
    const after = numStr.split(".")[1] ?? "";
    const suffixIsScale = /^\s*[KMB]/i.test(suffix);
    if (!suffixIsScale && after.length === 3) {
      // "2.847" → milhar
      normalized = numStr.replace(".", "");
      grouping = true;
      decimals = 0;
    } else {
      // "182.4", "87.5" → decimal
      decimals = after.length;
    }
  } else {
    decimals = 0;
    if (Number(numStr) >= 1000) grouping = true;
  }

  const target = parseFloat(normalized);
  if (Number.isNaN(target)) return null;
  return { prefix, suffix, target, decimals, grouping };
}

function format(value: number, p: Parsed): string {
  const fmt = new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: p.decimals,
    maximumFractionDigits: p.decimals,
    useGrouping: p.grouping,
  });
  return `${p.prefix}${fmt.format(value)}${p.suffix}`;
}

/**
 * Anima um número de 0 até o valor alvo ao entrar em view (a cada navegação).
 * A animação roda para todos os usuários. Se o valor não for numérico, renderiza como veio.
 */
export function CountUp({
  value,
  duration = 1.1,
}: {
  value: string | number;
  duration?: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const parsed = parseValue(value);
  const [display, setDisplay] = useState(() =>
    parsed ? format(0, parsed) : String(value),
  );

  useEffect(() => {
    if (!parsed || !inView) return;
    const controls = animate(0, parsed.target, {
      duration,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => setDisplay(format(v, parsed)),
    });
    return () => controls.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inView, value, duration]);

  const content = !parsed ? value : display;
  return <span ref={ref}>{content}</span>;
}

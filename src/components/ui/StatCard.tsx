"use client";

import { type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { CountUp } from "./CountUp";
import { Sparkline } from "./Sparkline";

/**
 * Tons SEMÂNTICOS do KPI (cor = significado), via tokens `--color-kpi-*`
 * (claro + dark em globals.css). Use os nomes semânticos:
 *   neutral=contagem/total · success=positivo/financeiro · info=tempo/agendado
 *   · warn=atenção · danger=crítico.
 * Visual "cor forte": o card recebe a tinta saturada (`*-bg`), o ícone é um
 * chip SÓLIDO vívido (`*-solid`) com glifo branco, e o NÚMERO grande vai na
 * cor do tom (`*` fg). Badge `change` fica em `bg-surface` p/ destacar.
 * Os nomes antigos (brand/blue/green/orange/purple/red) são aliases
 * retrocompatíveis — prefira os semânticos em código novo.
 */
type KpiTone = "neutral" | "success" | "info" | "warn" | "danger";
type LegacyTone = "brand" | "blue" | "green" | "orange" | "purple" | "red";

export function StatCard({
  icon,
  value,
  label,
  change,
  tone = "neutral",
  series,
  onClick,
  active = false,
}: {
  icon: ReactNode;
  value: ReactNode;
  label: string;
  change?: { value: string; positive?: boolean };
  tone?: KpiTone | LegacyTone;
  /** Série opcional de tendência → renderiza um mini-gráfico (Sparkline). */
  series?: number[];
  /** Se fornecido, o card vira um botão clicável (ex.: filtrar tabela). */
  onClick?: () => void;
  /** Realça o card como selecionado (use com onClick). */
  active?: boolean;
}) {
  // Fundo saturado do card (tinta semântica forte).
  const cardBg: Record<KpiTone, string> = {
    neutral: "bg-[var(--color-kpi-neutral-bg)]",
    success: "bg-[var(--color-kpi-success-bg)]",
    info: "bg-[var(--color-kpi-info-bg)]",
    warn: "bg-[var(--color-kpi-warn-bg)]",
    danger: "bg-[var(--color-kpi-danger-bg)]",
  };
  // Chip do ícone: cor SÓLIDA vívida + glifo branco.
  const iconSolid: Record<KpiTone, string> = {
    neutral: "bg-[var(--color-kpi-neutral-solid)] text-white",
    success: "bg-[var(--color-kpi-success-solid)] text-white",
    info: "bg-[var(--color-kpi-info-solid)] text-white",
    warn: "bg-[var(--color-kpi-warn-solid)] text-white",
    danger: "bg-[var(--color-kpi-danger-solid)] text-white",
  };
  // Cor (fg) do número e do texto do badge.
  const toneText: Record<KpiTone, string> = {
    neutral: "text-[var(--color-kpi-neutral)]",
    success: "text-[var(--color-kpi-success)]",
    info: "text-[var(--color-kpi-info)]",
    warn: "text-[var(--color-kpi-warn)]",
    danger: "text-[var(--color-kpi-danger)]",
  };
  // aliases legados → tom semântico
  const legacy: Record<LegacyTone, KpiTone> = {
    brand: "neutral",
    blue: "info",
    green: "success",
    orange: "warn",
    purple: "info",
    red: "danger",
  };
  // Ring de "selecionado": cor sólida do tom.
  const ringActive: Record<KpiTone, string> = {
    neutral: "ring-2 ring-offset-1 ring-[var(--color-kpi-neutral-solid)]",
    success: "ring-2 ring-offset-1 ring-[var(--color-kpi-success-solid)]",
    info: "ring-2 ring-offset-1 ring-[var(--color-kpi-info-solid)]",
    warn: "ring-2 ring-offset-1 ring-[var(--color-kpi-warn-solid)]",
    danger: "ring-2 ring-offset-1 ring-[var(--color-kpi-danger-solid)]",
  };
  const resolved: KpiTone =
    tone in legacy ? legacy[tone as LegacyTone] : (tone as KpiTone);

  const baseClasses = cn(
    "rounded-2xl border border-line p-5 shadow-[var(--shadow-card)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md ring-offset-surface",
    cardBg[resolved],
    active && ringActive[resolved],
    active && "shadow-md",
  );

  const inner = (
    <>
      <div className="flex items-start justify-between">
        <span
          className={cn(
            "inline-flex h-10 w-10 items-center justify-center rounded-xl shadow-[var(--shadow-card)]",
            iconSolid[resolved],
          )}
        >
          {icon}
        </span>
        {change && (
          <span
            className={cn(
              "rounded-full bg-surface px-2 py-0.5 text-xs font-semibold shadow-[var(--shadow-card)]",
              change.positive ? toneText.success : toneText.danger,
            )}
          >
            {change.positive ? "↑" : "↓"} {change.value}
          </span>
        )}
      </div>
      <div className={cn("mt-4 text-2xl font-bold", toneText[resolved])}>
        {typeof value === "string" || typeof value === "number" ? (
          <CountUp value={value} />
        ) : (
          value
        )}
      </div>
      <div className="mt-1 text-sm font-medium text-ink/70">{label}</div>
      {series && series.length > 1 && (
        <Sparkline
          data={series}
          className={cn("mt-3 h-7 w-full opacity-80", toneText[resolved])}
        />
      )}
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-pressed={active}
        className={cn(
          baseClasses,
          "w-full cursor-pointer text-left",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-brand-400",
        )}
      >
        {inner}
      </button>
    );
  }

  return <div className={baseClasses}>{inner}</div>;
}

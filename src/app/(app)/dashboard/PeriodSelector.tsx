"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";
import { CalendarDays } from "lucide-react";

const PERIODOS = [
  { key: "30d", label: "Últimos 30 Dias" },
  { key: "this_month", label: "Este Mês" },
  { key: "last_month", label: "Mês Passado" },
  { key: "90d", label: "Últimos 3 Meses" },
  { key: "12m", label: "Últimos 12 Meses" },
  { key: "custom", label: "Customizado" },
] as const;

export function PeriodSelector() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const period = searchParams.get("period") || "30d";
  const de = searchParams.get("de") || "";
  const ate = searchParams.get("ate") || "";
  const isCustom = period === "custom";

  const navigate = useCallback(
    (params: Record<string, string>) => {
      const sp = new URLSearchParams(searchParams.toString());
      for (const [k, v] of Object.entries(params)) {
        if (v) sp.set(k, v);
        else sp.delete(k);
      }
      router.push(`/dashboard?${sp.toString()}`);
    },
    [router, searchParams],
  );

  const handlePeriodChange = useCallback(
    (newPeriod: string) => {
      if (newPeriod === "custom") {
        navigate({ period: "custom" });
      } else {
        navigate({ period: newPeriod, de: "", ate: "" });
      }
    },
    [navigate],
  );

  return (
    <div className="flex items-center gap-2">
      <div className="relative">
        <select
          value={period}
          onChange={(e) => handlePeriodChange(e.target.value)}
          className="h-9 appearance-none rounded-lg border border-line bg-white pl-3 pr-8 text-sm text-ink focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
        >
          {PERIODOS.map((p) => (
            <option key={p.key} value={p.key}>
              {p.label}
            </option>
          ))}
        </select>
        <CalendarDays className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
      </div>

      {isCustom && (
        <>
          <input
            type="date"
            value={de}
            onChange={(e) => navigate({ de: e.target.value })}
            className="h-9 rounded-lg border border-line bg-white px-3 text-sm text-ink focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
            aria-label="Data início"
          />
          <span className="text-sm text-muted">até</span>
          <input
            type="date"
            value={ate}
            onChange={(e) => navigate({ ate: e.target.value })}
            className="h-9 rounded-lg border border-line bg-white px-3 text-sm text-ink focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
            aria-label="Data fim"
          />
        </>
      )}
    </div>
  );
}

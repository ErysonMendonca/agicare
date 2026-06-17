import { type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Card } from "./Card";
import { CountUp } from "./CountUp";

export function StatCard({
  icon,
  value,
  label,
  change,
  tone = "brand",
}: {
  icon: ReactNode;
  value: ReactNode;
  label: string;
  change?: { value: string; positive?: boolean };
  tone?: "brand" | "blue" | "green" | "orange" | "purple";
}) {
  const tones: Record<string, string> = {
    brand: "bg-brand-50 text-brand-600",
    blue: "bg-blue-50 text-blue-600",
    green: "bg-green-50 text-green-600",
    orange: "bg-orange-50 text-orange-600",
    purple: "bg-purple-50 text-purple-600",
  };
  return (
    <Card interactive className="p-5">
      <div className="flex items-start justify-between">
        <span
          className={cn(
            "inline-flex h-10 w-10 items-center justify-center rounded-xl",
            tones[tone],
          )}
        >
          {icon}
        </span>
        {change && (
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-xs font-medium",
              change.positive
                ? "bg-green-50 text-green-600"
                : "bg-red-50 text-red-600",
            )}
          >
            {change.positive ? "↑" : "↓"} {change.value}
          </span>
        )}
      </div>
      <div className="mt-4 text-2xl font-bold text-ink">
        {typeof value === "string" || typeof value === "number" ? (
          <CountUp value={value} />
        ) : (
          value
        )}
      </div>
      <div className="mt-1 text-sm text-muted">{label}</div>
    </Card>
  );
}

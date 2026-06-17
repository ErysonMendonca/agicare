import { type HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export type Status =
  | "wait" // Aguardando (azul)
  | "active" // Chamado / Em atendimento (teal)
  | "ok" // Ativo / Finalizado (verde)
  | "danger" // Urgente (vermelho)
  | "warn"; // Preferencial (laranja)

const styles: Record<Status, string> = {
  wait: "bg-blue-50 text-blue-600",
  active: "bg-brand-50 text-brand-600",
  ok: "bg-green-50 text-green-600",
  danger: "bg-red-50 text-red-600",
  warn: "bg-orange-50 text-orange-600",
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  status?: Status;
}

export function Badge({ status = "active", className, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium",
        styles[status],
        className,
      )}
      {...props}
    />
  );
}

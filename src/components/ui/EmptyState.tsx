import { type ReactNode } from "react";
import { type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Estado vazio padronizado — usado quando uma lista/coleção não tem itens.
 *
 * Centralizado, com ícone (lucide) em um círculo suave, título em destaque,
 * descrição opcional e uma ação opcional (ex.: um `<Button>` de "novo X").
 * Usa apenas tokens do design system.
 *
 * @example
 * <EmptyState
 *   icon={Users}
 *   title="Nenhum paciente encontrado"
 *   description="Cadastre o primeiro paciente para começar."
 *   action={<Button>Novo paciente</Button>}
 * />
 */
export interface EmptyStateProps {
  /** Ícone lucide (componente, ex.: `Users`). */
  icon: LucideIcon;
  /** Título principal do estado vazio. */
  title: string;
  /** Texto de apoio opcional. */
  description?: string;
  /** Ação opcional (geralmente um Button). */
  action?: ReactNode;
  /** Classes extras no container externo. */
  className?: string;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center px-6 py-16 text-center",
        className,
      )}
    >
      <div
        className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-muted-surface text-muted"
        aria-hidden
      >
        <Icon className="h-7 w-7" />
      </div>
      <h3 className="text-base font-semibold text-ink">{title}</h3>
      {description && (
        <p className="mt-1.5 max-w-sm text-sm text-muted">{description}</p>
      )}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

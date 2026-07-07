import { type HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Ativa hover-lift (elevação + sombra) para cards clicáveis/interativos. */
  interactive?: boolean;
}

export function Card({ className, interactive, ...props }: CardProps) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-line bg-surface shadow-[var(--shadow-card)] transition-all duration-200 ease-out",
        interactive &&
          "cursor-pointer will-change-transform hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-md active:translate-y-0 active:shadow-sm active:duration-75 motion-reduce:transition-none motion-reduce:hover:translate-y-0",
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-5 pb-0", className)} {...props} />;
}

export function CardBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-5", className)} {...props} />;
}

export function CardFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-5 pt-0 flex items-center", className)} {...props} />;
}

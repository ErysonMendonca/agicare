import { type HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/**
 * Placeholder de carregamento (loading skeleton).
 *
 * Bloco neutro com `bg-muted-surface` e um shimmer sutil (gradiente que desliza
 * via `background-position`, só compositando opacity/transform). Respeita
 * `prefers-reduced-motion`: sem o brilho deslizante, cai para um `pulse` leve de
 * opacidade — e, se o usuário pediu menos movimento, fica estático.
 *
 * Os keyframes do shimmer são definidos uma única vez aqui (escopo do
 * componente, sem tocar no globals.css) — duplicação inofensiva caso vários
 * skeletons montem juntos.
 *
 * @example
 * <Skeleton className="h-4 w-32" />
 * <Skeleton className="h-10 w-10 rounded-full" />
 */
export interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {
  /** Classes de tamanho/raio (ex.: "h-4 w-32", "h-10 w-10 rounded-full"). */
  className?: string;
}

const SHIMMER_KEYFRAMES = `@keyframes agicare-skeleton-shimmer{100%{background-position:-200% 0}}`;

export function Skeleton({ className, ...props }: SkeletonProps) {
  return (
    <div
      aria-hidden
      className={cn(
        "relative overflow-hidden rounded bg-muted-surface",
        // Movimento normal: só o shimmer desliza. prefers-reduced-motion: estático e levemente esmaecido (sem animação).
        "motion-reduce:opacity-70",
        // Faixa de brilho (desliga em motion-reduce).
        "before:absolute before:inset-0 before:bg-[linear-gradient(90deg,transparent_0%,rgba(255,255,255,0.55)_50%,transparent_100%)] before:bg-[length:200%_100%] before:[animation:agicare-skeleton-shimmer_1.6s_ease-in-out_infinite] motion-reduce:before:hidden",
        className,
      )}
      {...props}
    >
      <style dangerouslySetInnerHTML={{ __html: SHIMMER_KEYFRAMES }} />
    </div>
  );
}

export interface SkeletonTextProps extends HTMLAttributes<HTMLDivElement> {
  /** Quantidade de linhas. Padrão: 3. */
  lines?: number;
  /** Classe aplicada a cada linha (altura/raio). Padrão: "h-3.5". */
  lineClassName?: string;
}

/**
 * Bloco de linhas de texto esqueléticas. A última linha sai mais curta (~60%)
 * para imitar o fim de um parágrafo.
 *
 * @example
 * <SkeletonText lines={4} />
 */
export function SkeletonText({
  lines = 3,
  lineClassName,
  className,
  ...props
}: SkeletonTextProps) {
  return (
    <div className={cn("space-y-2", className)} {...props}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className={cn(
            "h-3.5 w-full",
            i === lines - 1 && lines > 1 && "w-3/5",
            lineClassName,
          )}
        />
      ))}
    </div>
  );
}

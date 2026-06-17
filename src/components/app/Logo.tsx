import { cn } from "@/lib/utils";

/** Logo AGIcare: "AGI" forte + "care" leve, com swoosh sob "care". */
export function Logo({
  className,
  onDark = false,
}: {
  className?: string;
  onDark?: boolean;
}) {
  return (
    <span className={cn("inline-flex items-end font-bold tracking-tight", className)}>
      <span className={onDark ? "text-white" : "text-ink"}>AGI</span>
      <span className="relative font-light">
        <span className={onDark ? "text-white/90" : "text-brand-600"}>care</span>
        <span
          className={cn(
            "absolute -bottom-0.5 left-0 h-[2px] w-full rounded-full",
            onDark ? "bg-accent" : "bg-brand-400",
          )}
        />
      </span>
    </span>
  );
}

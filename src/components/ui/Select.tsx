import { forwardRef, type SelectHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  /** Mensagem de erro: pinta a borda de vermelho e exibe abaixo do campo. */
  error?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, label, id, error, children, ...props }, ref) => {
    const select = (
      <select
        ref={ref}
        id={id}
        aria-invalid={error ? true : undefined}
        className={cn(
          "h-10 w-full appearance-none rounded-lg border border-line bg-white px-3 text-sm text-ink focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100",
          error && "border-red-500 focus:border-red-500 focus:ring-red-100",
          className,
        )}
        {...props}
      >
        {children}
      </select>
    );
    const errEl = error ? (
      <span className="mt-1 block text-xs text-red-500 font-medium">{error}</span>
    ) : null;
    if (!label) {
      return error ? (
        <span className="block">
          {select}
          {errEl}
        </span>
      ) : (
        select
      );
    }
    return (
      <label htmlFor={id} className="block">
        <span className="mb-1.5 block text-sm font-medium text-ink">{label}</span>
        {select}
        {errEl}
      </label>
    );
  },
);
Select.displayName = "Select";

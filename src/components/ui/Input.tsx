import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  /** Texto de apoio exibido abaixo do campo. */
  hint?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, hint, id, ...props }, ref) => {
    const input = (
      <input
        ref={ref}
        id={id}
        className={cn(
          "h-10 w-full rounded-lg border border-line bg-white px-3 text-sm text-ink placeholder:text-muted focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100",
          className,
        )}
        {...props}
      />
    );
    const hintEl = hint ? (
      <span className="mt-1 block text-xs text-muted">{hint}</span>
    ) : null;
    if (!label) {
      return hintEl ? (
        <span className="block">
          {input}
          {hintEl}
        </span>
      ) : (
        input
      );
    }
    return (
      <label htmlFor={id} className="block">
        <span className="mb-1.5 block text-sm font-medium text-ink">{label}</span>
        {input}
        {hintEl}
      </label>
    );
  },
);
Input.displayName = "Input";

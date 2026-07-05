import type { ReactNode } from "react";

export function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted">
      {children}
    </h3>
  );
}

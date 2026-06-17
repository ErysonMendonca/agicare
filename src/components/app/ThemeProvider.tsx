"use client";

import { useEffect } from "react";

/**
 * White-label — sincroniza o tema (claro/escuro/auto) com a classe `.dark`
 * no <html>, mantendo o modo "auto" reativo às mudanças do sistema operacional
 * (prefers-color-scheme) sem recarregar a página.
 *
 * O 1º paint já vem com a classe correta via <ThemeScript> (anti-FOUC); este
 * provider apenas RECONCILIA após a hidratação e escuta o matchMedia no "auto".
 */
export function ThemeProvider({
  mode,
  children,
}: {
  /** Valor de clinic_settings.branding.theme: "claro" | "escuro" | "auto". */
  mode: string;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const root = document.documentElement;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");

    const apply = () => {
      const dark = mode === "escuro" || (mode === "auto" && mq.matches);
      root.classList.toggle("dark", dark);
    };

    apply();

    if (mode === "auto") {
      mq.addEventListener("change", apply);
      return () => mq.removeEventListener("change", apply);
    }
  }, [mode]);

  return <>{children}</>;
}

"use client";

import { usePathname } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { type ReactNode } from "react";

const ease = [0.22, 1, 0.36, 1] as const;

/**
 * Transição suave entre rotas do app.
 * - `AnimatePresence mode="wait"` garante que a saída termine antes da entrada,
 *   evitando sobreposição/“pulo” de layout durante a navegação.
 * - `key={pathname}` dispara enter/exit a cada mudança de rota.
 * - Respeita `prefers-reduced-motion`: anima só opacidade (sem deslocamento).
 * Anima apenas transform/opacity (GPU-friendly).
 */
export function PageTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const reduceMotion = useReducedMotion();

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={pathname}
        initial={{ opacity: 0, y: reduceMotion ? 0 : 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: reduceMotion ? 0 : -6 }}
        transition={{ duration: reduceMotion ? 0.2 : 0.32, ease }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}

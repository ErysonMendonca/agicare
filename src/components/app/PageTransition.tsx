"use client";

import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { type ReactNode } from "react";

/** Transição suave (fade + slide) entre rotas do app. */
export function PageTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return (
    <motion.div
      key={pathname}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}

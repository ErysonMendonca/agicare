"use client";

import { useEffect, useId, type ReactNode } from "react";
import { X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "@/lib/utils";

// Pilha global de modais abertos. Permite empilhar modais (ex.: cadastro do
// avulso por cima do check-in): só o do TOPO responde ao ESC, e o scroll do
// fundo só é reabilitado quando o ÚLTIMO modal fecha.
const modalStack: string[] = [];

/** Modal reutilizável (dialog) com entrada/saída animadas (spring). */
export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  const id = useId();
  useEffect(() => {
    if (!open) return;
    modalStack.push(id);
    // Só o modal do topo da pilha reage ao ESC (não fecha os de baixo junto).
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && modalStack[modalStack.length - 1] === id) {
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      const i = modalStack.lastIndexOf(id);
      if (i !== -1) modalStack.splice(i, 1);
      // Reabilita o scroll só quando não há mais nenhum modal aberto.
      if (modalStack.length === 0) document.body.style.overflow = "";
    };
  }, [open, onClose, id]);

  return (
    <AnimatePresence>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label={title}
        >
          <motion.div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          />
          <motion.div
            className={cn(
              "relative z-10 max-h-[95vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-surface shadow-xl",
              className,
            )}
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ type: "spring", stiffness: 320, damping: 28 }}
          >
            <div className="flex items-start justify-between border-b border-line p-5">
              <div>
                <h2 className="text-lg font-semibold text-ink">{title}</h2>
                {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Fechar"
                className="text-muted transition-colors hover:text-ink"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-5">{children}</div>
            {footer && (
              <div className="flex justify-end gap-2 border-t border-line p-5">
                {footer}
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

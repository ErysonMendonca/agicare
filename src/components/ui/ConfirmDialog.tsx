"use client";

import { Modal } from "./Modal";
import { Button } from "./Button";
import { useConfirmStore } from "@/lib/store/confirm";

/**
 * Diálogo de confirmação global. Montado UMA vez no layout do app; reage ao
 * store `useConfirmStore`. Substitui o `window.confirm` nativo por um modal
 * estilizado (mesmo Modal do resto do sistema). Ver `useConfirm()`.
 */
export function ConfirmDialog() {
  const { open, options, close } = useConfirmStore();

  return (
    <Modal
      open={open}
      onClose={() => close(false)}
      title={options?.title ?? "Confirmar"}
      className="max-w-md"
      footer={
        <>
          <Button variant="ghost" onClick={() => close(false)}>
            {options?.cancelLabel ?? "Cancelar"}
          </Button>
          <Button
            variant={options?.danger ? "danger" : "primary"}
            onClick={() => close(true)}
            autoFocus
          >
            {options?.confirmLabel ?? "Confirmar"}
          </Button>
        </>
      }
    >
      <p className="text-sm text-ink">{options?.message}</p>
    </Modal>
  );
}

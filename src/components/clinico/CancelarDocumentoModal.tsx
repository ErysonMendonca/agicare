"use client";

import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";

export interface CancelarDocumentoModalProps {
  open: boolean;
  onClose: () => void;
  /** Recebe o motivo (já validado, com ao menos 3 caracteres). */
  onConfirm: (motivo: string) => void;
  /** Desabilita os botões enquanto a action roda. */
  pending?: boolean;
  /** Título do modal. Default: "Cancelar documento". */
  titulo?: string;
}

const MIN_LEN = 3;

/**
 * Modal que coleta o MOTIVO do cancelamento de um documento do prontuário.
 * Não executa nenhuma action — só valida (motivo obrigatório, min 3 chars) e
 * repassa o motivo via `onConfirm`. O cancelamento é NÃO destrutivo.
 */
export function CancelarDocumentoModal({
  open,
  onClose,
  onConfirm,
  pending = false,
  titulo = "Cancelar documento",
}: CancelarDocumentoModalProps) {
  const [motivo, setMotivo] = useState("");
  const [tocado, setTocado] = useState(false);

  // Limpa o estado ao (re)abrir para não vazar motivo de um cancelamento anterior.
  useEffect(() => {
    if (open) {
      setMotivo("");
      setTocado(false);
    }
  }, [open]);

  const motivoLimpo = motivo.trim();
  const invalido = motivoLimpo.length < MIN_LEN;

  function handleConfirm() {
    setTocado(true);
    if (invalido || pending) return;
    onConfirm(motivoLimpo);
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={titulo}
      subtitle="Esta ação não pode ser desfeita pela lista."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Voltar
          </Button>
          <Button
            variant="danger"
            onClick={handleConfirm}
            disabled={pending || (tocado && invalido)}
          >
            {pending ? "Cancelando…" : "Cancelar documento"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex gap-3 rounded-xl border border-orange-200 bg-orange-50 p-3 text-sm text-orange-800">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
          <p>
            O documento{" "}
            <strong>não será apagado</strong> — ficará marcado como{" "}
            <strong>Cancelado</strong> e não poderá ser editado, visualizado ou
            impresso.
          </p>
        </div>

        <div>
          <label
            htmlFor="motivo-cancelamento"
            className="mb-1.5 block text-sm font-medium text-ink"
          >
            Motivo do cancelamento
          </label>
          <textarea
            id="motivo-cancelamento"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            onBlur={() => setTocado(true)}
            rows={3}
            disabled={pending}
            aria-invalid={tocado && invalido}
            aria-describedby={
              tocado && invalido ? "motivo-cancelamento-erro" : undefined
            }
            placeholder="Descreva por que este documento está sendo cancelado…"
            className="w-full resize-none rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 disabled:opacity-50"
          />
          {tocado && invalido && (
            <p
              id="motivo-cancelamento-erro"
              className="mt-1 text-xs text-status-danger"
            >
              Informe um motivo com ao menos {MIN_LEN} caracteres.
            </p>
          )}
        </div>
      </div>
    </Modal>
  );
}

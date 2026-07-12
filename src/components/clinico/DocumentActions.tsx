"use client";

import { Ban, Eye, Pencil, Printer } from "lucide-react";
import { motion } from "framer-motion";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/utils";

export interface DocumentActionsProps {
  /** Documento cancelado → read-only total (só exibe o selo "Cancelado"). */
  cancelled: boolean;
  /** Motivo do cancelamento (exibido como tooltip no selo). */
  cancelReason?: string | null;
  /** Handlers — o botão só aparece se o handler correspondente for passado. */
  onView?: () => void;
  onEdit?: () => void;
  onPrint?: () => void;
  onCancel?: () => void;
  /** Tamanho dos botões. Default: "sm". */
  size?: "sm" | "md";
  /** Desabilita todas as ações (ex.: durante uma transição/salvamento). */
  pending?: boolean;
}

/**
 * Barra padrão de ações de um documento do prontuário: Visualizar, Editar,
 * Imprimir e Cancelar. Cancelar é NÃO destrutivo — quando `cancelled` é true o
 * documento continua visível, mas vira read-only: nenhum botão é exibido, só o
 * selo "Cancelado" (com o motivo em tooltip, se houver).
 */
export function DocumentActions({
  cancelled,
  cancelReason,
  onView,
  onEdit,
  onPrint,
  onCancel,
  size = "sm",
  pending = false,
}: DocumentActionsProps) {
  if (cancelled) {
    return (
      <div className="flex items-center">
        <Badge
          status="danger"
          title={cancelReason ? `Motivo: ${cancelReason}` : undefined}
          className="gap-1"
        >
          <Ban className="h-3.5 w-3.5" aria-hidden />
          Cancelado
        </Badge>
      </div>
    );
  }

  const iconCls = size === "sm" ? "h-4 w-4" : "h-[18px] w-[18px]";
  const btnCls =
    size === "sm" ? "h-8 w-8 rounded-lg" : "h-9 w-9 rounded-lg";

  const items: {
    key: string;
    label: string;
    icon: typeof Eye;
    onClick?: () => void;
    danger?: boolean;
  }[] = [
    { key: "view", label: "Visualizar", icon: Eye, onClick: onView },
    { key: "edit", label: "Editar", icon: Pencil, onClick: onEdit },
    { key: "print", label: "Imprimir", icon: Printer, onClick: onPrint },
    {
      key: "cancel",
      label: "Cancelar documento",
      icon: Ban,
      onClick: onCancel,
      danger: true,
    },
  ];

  const visible = items.filter((i) => i.onClick);
  if (visible.length === 0) return null;

  return (
    <div className="flex items-center gap-1">
      {visible.map(({ key, label, icon: Icon, onClick, danger }) => (
        <motion.button
          key={key}
          type="button"
          onClick={onClick}
          disabled={pending}
          title={label}
          aria-label={label}
          whileTap={{ scale: 0.92 }}
          className={cn(
            "inline-flex items-center justify-center transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-1",
            "disabled:opacity-40 disabled:pointer-events-none",
            "motion-reduce:transition-none",
            btnCls,
            danger
              ? "text-status-danger hover:bg-red-50"
              : "text-muted hover:bg-black/5 hover:text-ink",
          )}
        >
          <Icon className={iconCls} aria-hidden />
        </motion.button>
      ))}
    </div>
  );
}

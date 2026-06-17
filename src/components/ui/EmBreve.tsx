import { type HTMLAttributes } from "react";
import { Clock } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Aviso visual padronizado para integrações externas ainda não conectadas
 * (e-mail/SMS/WhatsApp, PSP de pagamento, XML TISS oficial ANS, CadSus, 2FA,
 * backup). Comunica ao usuário que a funcionalidade existe na interface, mas a
 * conexão real será habilitada em breve — sem prometer comportamento que ainda
 * não acontece.
 *
 * - `badge` (padrão): selo inline, para colar ao lado de um botão/rótulo.
 * - `banner`: faixa de aviso, para o topo de um bloco/aba.
 */
type EmBreveVariant = "badge" | "banner";

const MESSAGE_DEFAULT = "Em breve — atualização e implementação";

export interface EmBreveProps extends HTMLAttributes<HTMLDivElement> {
  variant?: EmBreveVariant;
  /** Texto alternativo (ex.: "Em breve — envio real de SMS"). */
  label?: string;
}

export function EmBreve({
  variant = "badge",
  label,
  className,
  ...props
}: EmBreveProps) {
  const text = label ?? MESSAGE_DEFAULT;

  if (variant === "banner") {
    return (
      <div
        role="status"
        className={cn(
          "flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800",
          className,
        )}
        {...props}
      >
        <Clock className="mt-0.5 size-4 shrink-0 text-amber-600" aria-hidden />
        <span>{text}</span>
      </div>
    );
  }

  return (
    <span
      role="status"
      className={cn(
        "inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 ring-1 ring-inset ring-amber-200",
        className,
      )}
      {...props}
    >
      <Clock className="size-3" aria-hidden />
      {text}
    </span>
  );
}

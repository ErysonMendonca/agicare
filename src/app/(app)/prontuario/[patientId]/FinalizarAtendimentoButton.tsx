"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { finalizarAtendimento } from "@/lib/actions/atendimento";

/**
 * Botão "Finalizar Atendimento" exibido no cabeçalho da aba Procedimentos
 * (via `actions` do PageHeader). Só aparece durante o atendimento
 * (`em_atendimento`); ao finalizar, o atendimento vai à recepção para pagamento.
 */
export function FinalizarAtendimentoButton({
  queueEntryId,
  statusRaw,
}: {
  queueEntryId: string;
  statusRaw: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  if (statusRaw !== "em_atendimento") return null;

  function finalizar() {
    startTransition(async () => {
      const res = await finalizarAtendimento(queueEntryId);
      if (res?.ok) {
        toast.success("Atendimento finalizado. Encaminhado à recepção para pagamento.");
        router.refresh();
      } else {
        toast.error(res?.error ?? "Não foi possível finalizar o atendimento.");
      }
    });
  }

  return (
    <Button onClick={finalizar} disabled={pending}>
      <CheckCircle2 className="h-4 w-4" /> Finalizar Atendimento
    </Button>
  );
}

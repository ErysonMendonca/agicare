"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { XCircle } from "lucide-react";
import { toast } from "sonner";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { type FilaItem } from "@/lib/data/queue";
import { desistirPaciente } from "@/lib/actions/queue";
import { PacienteResumo } from "./PacienteResumo";

export function DesistenciaModal({
  item,
  open,
  onClose,
  onStatusChange,
}: {
  item: FilaItem;
  open: boolean;
  onClose: () => void;
  onStatusChange: (statusRaw: string) => void;
}) {
  const [motivo, setMotivo] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function handleConfirmar() {
    if (!motivo.trim()) {
      toast.error("Informe o motivo da desistência.");
      return;
    }
    startTransition(async () => {
      const res = await desistirPaciente(item.id, motivo);
      if (res?.ok) {
        toast.success("Desistência registrada.");
        onStatusChange("desistencia");
        setMotivo("");
        router.refresh();
        onClose();
      } else {
        toast.error(res?.error ?? "Não foi possível registrar a desistência.");
      }
    });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Desistência do Paciente"
      subtitle="Informe o motivo da desistência do paciente"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button variant="danger" onClick={handleConfirmar} disabled={pending}>
            <XCircle className="h-4 w-4" />
            Confirmar Desistência
          </Button>
        </>
      }
    >
      <PacienteResumo item={item} />

      <label htmlFor="motivo-desistencia" className="mt-5 block">
        <span className="mb-1.5 block text-sm font-medium text-ink">
          Motivo da desistência <span className="text-red-500">*</span>
        </span>
        <textarea
          id="motivo-desistencia"
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          rows={4}
          autoFocus
          className="w-full resize-none rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
      </label>
    </Modal>
  );
}

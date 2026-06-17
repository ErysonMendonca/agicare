"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Monitor, UserCheck, Eye, UserX } from "lucide-react";
import { toast } from "sonner";
import { Modal } from "@/components/ui/Modal";
import { type FilaItem } from "@/lib/data/queue";
import { chamarPaciente, atenderPaciente } from "@/lib/actions/queue";
import { PacienteResumo } from "./PacienteResumo";
import { tocarBeep } from "./sound";

const TERMINAIS = ["finalizado", "desistencia"];

export function AcoesPacienteModal({
  item,
  open,
  onClose,
  onStatusChange,
  onAtender,
  onDesistir,
}: {
  item: FilaItem;
  open: boolean;
  onClose: () => void;
  onStatusChange: (statusRaw: string) => void;
  onAtender: () => void;
  onDesistir: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const podeChamar = item.statusRaw === "aguardando";
  const podeAtender = !["em_atendimento", ...TERMINAIS].includes(item.statusRaw);
  const podeDesistir = !TERMINAIS.includes(item.statusRaw);

  function handleChamar() {
    // Toca o beep imediatamente (o clique conta como gesto do usuário).
    tocarBeep();
    startTransition(async () => {
      const res = await chamarPaciente(item.id);
      if (res?.ok) {
        toast.success("Paciente chamado.");
        onStatusChange("chamado");
        router.refresh();
      } else {
        toast.error(res?.error ?? "Não foi possível chamar o paciente.");
      }
    });
  }

  function handleAtender() {
    startTransition(async () => {
      const res = await atenderPaciente(item.id);
      if (res?.ok) {
        onStatusChange("em_atendimento");
        router.refresh();
        onAtender();
      } else {
        toast.error(res?.error ?? "Não foi possível iniciar o atendimento.");
      }
    });
  }

  function handleVisualizar() {
    onClose();
    // Abre o resumo 360º do paciente (sem alterar o status da fila).
    if (item.patientId) router.push(`/prontuario/${item.patientId}`);
    else router.push("/prontuario");
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Ações do Paciente"
      subtitle="Selecione a ação que deseja realizar para este paciente"
    >
      <PacienteResumo item={item} />

      <div className="mt-5 grid grid-cols-2 gap-3">
        <ActionButton
          onClick={handleChamar}
          disabled={pending || !podeChamar}
          icon={<Monitor className="h-5 w-5" />}
          label="Chamar"
          className="bg-brand-500 text-white hover:bg-brand-600 disabled:hover:bg-brand-500"
        />
        <ActionButton
          onClick={handleAtender}
          disabled={pending || !podeAtender}
          icon={<UserCheck className="h-5 w-5" />}
          label="Atender"
          className="bg-[#10b981] text-white hover:bg-[#059669] disabled:hover:bg-[#10b981]"
        />
        <ActionButton
          onClick={handleVisualizar}
          disabled={pending}
          icon={<Eye className="h-5 w-5" />}
          label="Visualizar"
          className="border border-line bg-white text-ink hover:bg-muted-surface"
        />
        <ActionButton
          onClick={onDesistir}
          disabled={pending || !podeDesistir}
          icon={<UserX className="h-5 w-5" />}
          label="Desistência"
          className="border border-red-300 bg-white text-red-600 hover:bg-red-50"
        />
      </div>
    </Modal>
  );
}

function ActionButton({
  onClick,
  disabled,
  icon,
  label,
  className,
}: {
  onClick: () => void;
  disabled?: boolean;
  icon: React.ReactNode;
  label: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex h-24 flex-col items-center justify-center gap-2 rounded-xl text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${className ?? ""}`}
    >
      {icon}
      {label}
    </button>
  );
}

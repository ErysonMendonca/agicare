"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Monitor, UserCheck, Eye, UserX, Stethoscope } from "lucide-react";
import { toast } from "sonner";
import { Modal } from "@/components/ui/Modal";
import { type FilaItem } from "@/lib/data/queue";
import {
  DEFAULT_STAGES,
  actionsForEntry,
  type FlowStage,
} from "@/lib/data/attendance-flow.shared";
import {
  chamarPaciente,
  atenderPaciente,
  atenderRecepcao,
} from "@/lib/actions/queue";
import { PacienteResumo } from "./PacienteResumo";
import { tocarBeep } from "./sound";

const TERMINAIS = ["finalizado", "desistencia"];

export function AcoesPacienteModal({
  item,
  stages = DEFAULT_STAGES,
  open,
  onClose,
  onStatusChange,
  onTriar,
  onAtender,
  onDesistir,
  isMedico = false,
}: {
  item: FilaItem;
  stages?: FlowStage[];
  open: boolean;
  onClose: () => void;
  onStatusChange: (statusRaw: string) => void;
  onTriar: () => void;
  onAtender: () => void;
  onDesistir: () => void;
  /** Médico: ao Atender vai direto ao prontuário do paciente (não abre o modal admin). */
  isMedico?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  // Ações disponíveis conforme o fluxo configurado da clínica (recepcao →
  // [triagem] → atendimento). O motor decide o que cabe a partir do status atual.
  const acoes = actionsForEntry(item.statusRaw, stages);
  const podeChamar = acoes.includes("chamar");
  const podeTriar = acoes.includes("triar");
  // 'atender' do motor cobre tanto chamar→atender quanto a chamada final.
  const podeAtender = acoes.includes("atender");
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
    const status = item.statusRaw;

    // Recepção inicia o atendimento administrativo: aguardando → na_recepcao
    // e abre o modal "Dados de Atendimento". Conclui (→ aguardando atendimento)
    // ao Salvar nesse modal.
    if (status === "aguardando") {
      startTransition(async () => {
        const res = await atenderRecepcao(item.id);
        if (res?.ok) {
          onStatusChange("na_recepcao");
          router.refresh();
          onAtender();
        } else {
          toast.error(res?.error ?? "Não foi possível iniciar a recepção.");
        }
      });
      return;
    }

    // Já em recepção: reabre o "Dados de Atendimento" para continuar/concluir.
    if (status === "na_recepcao") {
      onAtender();
      return;
    }

    // Profissional inicia o atendimento clínico: → em_atendimento. Médico vai
    // direto ao prontuário; demais papéis só atualizam a fila.
    startTransition(async () => {
      const res = await atenderPaciente(item.id);
      if (res?.ok) {
        onStatusChange("em_atendimento");
        if (isMedico && item.patientId) {
          onClose();
          router.push(`/prontuario/${item.patientId}`);
          return;
        }
        router.refresh();
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
        {podeTriar && (
          <ActionButton
            onClick={onTriar}
            disabled={pending}
            icon={<Stethoscope className="h-5 w-5" />}
            label="Triar"
            className="bg-amber-500 text-white hover:bg-amber-600 disabled:hover:bg-amber-500"
          />
        )}
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

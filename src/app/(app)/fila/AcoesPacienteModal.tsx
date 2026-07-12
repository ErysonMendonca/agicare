"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Monitor, UserCheck, Eye, UserX, Stethoscope, Printer, Wallet, FileText } from "lucide-react";
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
import { FichaImpressao } from "./FichaImpressao";
import { tocarBeep } from "./sound";

type Prioridade = "normal" | "preferencial" | "urgente";

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
  onFechar,
  isMedico = false,
  totemEnabled = true,
}: {
  item: FilaItem;
  stages?: FlowStage[];
  open: boolean;
  onClose: () => void;
  onStatusChange: (statusRaw: string) => void;
  onTriar: () => void;
  onAtender: () => void;
  onDesistir: () => void;
  /** Fechamento (recepção): recebe pagamento e finaliza. */
  onFechar: () => void;
  /** Médico: ao Atender vai direto ao prontuário do paciente (não abre o modal admin). */
  isMedico?: boolean;
  /** Totem ligado: mostra "Chamar" e "Reimprimir Ficha" (senha). Desligado: oculta. */
  totemEnabled?: boolean;
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
  // O "Atender" nos passos da recepção (aguardando/na_recepcao) abre os Dados de
  // Atendimento. Nos demais status, ele INICIA o atendimento CLÍNICO (→
  // em_atendimento), que é do médico — some para os demais papéis na fila.
  const atenderClinico =
    item.statusRaw !== "aguardando" && item.statusRaw !== "na_recepcao";
  const mostrarAtender = podeAtender && (!atenderClinico || isMedico);
  // Recepção fecha o atendimento quando está aguardando pagamento.
  const podeFechar = item.statusRaw === "aguardando_pagamento";
  // Status clínicos: paciente já passou do "Detalhe de Atendimento" e está com o
  // profissional (aguardando/triagem/chamado/em atendimento).
  const CLINICOS = [
    "aguardando_atendimento",
    "triagem",
    "chamado",
    "em_atendimento",
  ];
  // Após o atendimento do médico (aguardando pagamento) não cabe desistência.
  // Nos status clínicos também não faz sentido a recepção dar desistência.
  const podeDesistir =
    !TERMINAIS.includes(item.statusRaw) &&
    item.statusRaw !== "aguardando_pagamento" &&
    !CLINICOS.includes(item.statusRaw);
  // Reimprimir documentos do atendimento (ficha + termos) dos pacientes já
  // com o profissional: recepção reabre o Detalhe em modo reimpressão.
  const podeReimprimirDocs = CLINICOS.includes(item.statusRaw) && !!item.id;

  function handleReimprimirDocs() {
    onClose();
    router.push(`/fila/atendimento/${item.id}?reimprimir=1`);
  }

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

  // Reimprime a ficha de atendimento (senha + nº de atendimento) do paciente já
  // na fila, sem refazer o check-in. Os dados já vêm no FilaItem carregado.
  const podeReimprimir = !!item.codigo;
  function handleReimprimir() {
    window.print();
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

      {/* Ficha oculta na tela (visível só na impressão) — só no modo totem. */}
      {totemEnabled && podeReimprimir && (
        <FichaImpressao
          senha={item.codigo}
          item={item}
          prioridade={(item.priorityRaw as Prioridade) ?? "normal"}
        />
      )}

      <div className="mt-5 grid grid-cols-2 gap-3">
        {/* "Chamar" (painel/senha) só existe no modo totem. */}
        {totemEnabled && (
          <ActionButton
            onClick={handleChamar}
            disabled={pending || !podeChamar}
            icon={<Monitor className="h-5 w-5" />}
            label="Chamar"
            className="bg-brand-500 text-white hover:bg-brand-600 disabled:hover:bg-brand-500"
          />
        )}
        {podeTriar && (
          <ActionButton
            onClick={onTriar}
            disabled={pending}
            icon={<Stethoscope className="h-5 w-5" />}
            label="Triar"
            className="bg-amber-500 text-white hover:bg-amber-600 disabled:hover:bg-amber-500"
          />
        )}
        {mostrarAtender && (
          <ActionButton
            onClick={handleAtender}
            disabled={pending || !podeAtender}
            icon={<UserCheck className="h-5 w-5" />}
            label="Atender"
            className="bg-[#10b981] text-white hover:bg-[#059669] disabled:hover:bg-[#10b981]"
          />
        )}
        {podeFechar && (
          <ActionButton
            onClick={() => {
              onClose();
              onFechar();
            }}
            disabled={pending}
            icon={<Wallet className="h-5 w-5" />}
            label="Faturamento"
            className="bg-brand-500 text-white hover:bg-brand-600 disabled:hover:bg-brand-500"
          />
        )}
        {podeReimprimirDocs && (
          <ActionButton
            onClick={handleReimprimirDocs}
            disabled={pending}
            icon={<FileText className="h-5 w-5" />}
            label="Reimprimir documentos"
            className="border border-line bg-white text-ink hover:bg-muted-surface"
          />
        )}
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
        {totemEnabled && (
          <ActionButton
            onClick={handleReimprimir}
            disabled={pending || !podeReimprimir}
            icon={<Printer className="h-5 w-5" />}
            label="Reimprimir Ficha"
            className="border border-line bg-white text-ink hover:bg-muted-surface"
          />
        )}
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

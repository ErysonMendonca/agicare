"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Printer, Ticket, UserCheck } from "lucide-react";
import { toast } from "sonner";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { type FilaItem } from "@/lib/data/queue";
import { checkInTotem } from "@/lib/actions/queue";
import { FichaImpressao } from "./FichaImpressao";

type Prioridade = "normal" | "preferencial" | "urgente";

const PRIORIDADES: { value: Prioridade; label: string; classe: string }[] = [
  {
    value: "normal",
    label: "Normal",
    classe: "data-[on=true]:border-brand-500 data-[on=true]:bg-brand-50 data-[on=true]:text-brand-600",
  },
  {
    value: "preferencial",
    label: "Preferencial",
    classe:
      "data-[on=true]:border-orange-400 data-[on=true]:bg-orange-50 data-[on=true]:text-orange-600",
  },
  {
    value: "urgente",
    label: "Urgente",
    classe:
      "data-[on=true]:border-red-400 data-[on=true]:bg-red-50 data-[on=true]:text-red-600",
  },
];

/** Normaliza placeholders ("—") para null antes de enviar ao backend. */
function limpar(v: string | null | undefined): string | null {
  if (!v || v === "—") return null;
  return v;
}

export function CheckInModal({
  agendado,
  open,
  onClose,
}: {
  agendado: FilaItem | null;
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [prioridade, setPrioridade] = useState<Prioridade>("normal");
  const [senha, setSenha] = useState<string | null>(null);
  const [emitidoEm, setEmitidoEm] = useState<Date | null>(null);

  // O componente é montado a cada abertura (com key no pai), então o estado
  // inicial já nasce limpo — sem necessidade de reset via efeito.
  if (!agendado) return null;

  function confirmar() {
    if (!agendado) return;
    startTransition(async () => {
      const res = await checkInTotem({
        appointmentId: agendado.appointmentId ?? undefined,
        patientId: agendado.patientId,
        patientName: agendado.paciente,
        priority: prioridade,
        specialty: limpar(agendado.especialidade),
        insurance: limpar(agendado.convenio),
      });

      if (res?.ticketCode) {
        setSenha(res.ticketCode);
        setEmitidoEm(new Date());
        toast.success(`Check-in realizado. Senha ${res.ticketCode}.`);
        // Atualiza as listas (paciente sai de "agendados" e entra na fila).
        router.refresh();
      } else {
        toast.error(res?.error ?? "Não foi possível realizar o check-in.");
      }
    });
  }

  function concluir() {
    onClose();
  }

  const emitida = senha !== null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={emitida ? "Senha emitida" : "Check-in do Paciente"}
      subtitle={
        emitida
          ? "Imprima a ficha e oriente o paciente a aguardar a chamada."
          : "Confirme a prioridade para emitir a senha de atendimento."
      }
      footer={
        emitida ? (
          <>
            <Button variant="ghost" onClick={concluir}>
              Concluir
            </Button>
            <Button variant="primary" onClick={() => window.print()}>
              <Printer className="h-4 w-4" />
              Imprimir Ficha
            </Button>
          </>
        ) : (
          <>
            <Button variant="ghost" onClick={onClose} disabled={pending}>
              Cancelar
            </Button>
            <Button variant="primary" onClick={confirmar} disabled={pending}>
              <UserCheck className="h-4 w-4" />
              {pending ? "Emitindo…" : "Confirmar e Emitir Senha"}
            </Button>
          </>
        )
      }
    >
      {/* Resumo do agendado */}
      <div className="rounded-xl border border-line bg-muted-surface p-4">
        <p className="truncate font-semibold text-ink">{agendado.paciente}</p>
        <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted">
          <span>
            Especialidade:{" "}
            <span className="font-medium text-ink">{agendado.especialidade}</span>
          </span>
          <span>
            Profissional:{" "}
            <span className="font-medium text-ink">{agendado.medico}</span>
          </span>
          <span>
            Convênio:{" "}
            <span className="font-medium text-ink">{agendado.convenio}</span>
          </span>
        </div>
      </div>

      {!emitida ? (
        <fieldset className="mt-5">
          <legend className="mb-2 text-sm font-medium text-ink">Prioridade</legend>
          <div className="grid grid-cols-3 gap-2">
            {PRIORIDADES.map((p) => (
              <button
                key={p.value}
                type="button"
                data-on={prioridade === p.value}
                aria-pressed={prioridade === p.value}
                onClick={() => setPrioridade(p.value)}
                className={`h-10 rounded-lg border border-line bg-white text-sm font-semibold text-muted transition-colors hover:bg-muted-surface ${p.classe}`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </fieldset>
      ) : (
        <div className="mt-5 flex flex-col items-center rounded-xl border border-brand-200 bg-brand-50 py-6">
          <span className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-brand-600">
            <Ticket className="h-4 w-4" /> Senha
          </span>
          <span className="mt-1 text-6xl font-extrabold tracking-tight text-brand-700">
            {senha}
          </span>
        </div>
      )}

      {/* Ficha (oculta na tela, visível só na impressão) */}
      {emitida && senha && (
        <FichaImpressao
          senha={senha}
          item={agendado}
          prioridade={prioridade}
          emitidoEm={emitidoEm ?? undefined}
        />
      )}
    </Modal>
  );
}

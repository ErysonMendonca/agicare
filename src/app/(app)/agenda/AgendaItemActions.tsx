"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, X, Save, Ban } from "lucide-react";
import { toast } from "sonner";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { type Atendimento } from "@/lib/data/appointments";
import { type Profissional } from "@/lib/data/professionals";
import {
  remarcarAppointment,
  trocarProfissional,
  cancelAppointment,
} from "@/lib/actions/appointments";

type Aberto = "editar" | "cancelar" | null;

/** Status que ainda podem ser remarcados/cancelados. */
const ENCERRADOS = new Set(["concluido", "cancelado"]);

/**
 * Ações de manutenção de um agendamento (Editar / Cancelar), ligadas às
 * Server Actions existentes. Após sucesso, router.refresh revalida a lista.
 */
export function AgendaItemActions({
  atendimento,
  profissionais,
}: {
  atendimento: Atendimento;
  profissionais: Profissional[];
}) {
  const router = useRouter();
  const [aberto, setAberto] = useState<Aberto>(null);
  const [pending, startTransition] = useTransition();

  const [data, setData] = useState(atendimento.dataISO);
  const [hora, setHora] = useState(atendimento.hora === "—" ? "" : atendimento.hora);
  const [profissionalId, setProfissionalId] = useState(atendimento.profissionalId);
  const [motivo, setMotivo] = useState("");

  const especialidades = useMemo(
    () =>
      Array.from(
        new Set(
          profissionais
            .map((p) => p.especialidade)
            .filter((e) => e && e !== "—"),
        ),
      ),
    [profissionais],
  );

  const encerrado = ENCERRADOS.has(atendimento.status);
  const profEscolhido = profissionais.find((p) => p.id === profissionalId) ?? null;

  function resetEditar() {
    setData(atendimento.dataISO);
    setHora(atendimento.hora === "—" ? "" : atendimento.hora);
    setProfissionalId(atendimento.profissionalId);
  }

  function abrirEditar() {
    resetEditar();
    setAberto("editar");
  }

  function salvarEdicao() {
    if (!data || !hora) {
      toast.error("Informe a nova data e horário.");
      return;
    }
    startTransition(async () => {
      // 1) Troca de profissional (quando alterado e há vínculo selecionado).
      if (profissionalId && profissionalId !== atendimento.profissionalId) {
        const tr = await trocarProfissional({
          id: atendimento.id,
          professional_id: profissionalId,
          specialty: profEscolhido?.especialidade ?? "",
        });
        if (!tr?.ok) {
          toast.error(tr?.error ?? "Não foi possível trocar o profissional.");
          return;
        }
      }
      // 2) Remarcação de data/hora.
      const rm = await remarcarAppointment({
        id: atendimento.id,
        date: data,
        time: hora,
      });
      if (rm?.ok) {
        toast.success("Agendamento atualizado.");
        setAberto(null);
        router.refresh();
      } else {
        toast.error(rm?.error ?? "Não foi possível remarcar o agendamento.");
      }
    });
  }

  function confirmarCancelamento() {
    startTransition(async () => {
      const res = await cancelAppointment(atendimento.id, motivo);
      if (res?.ok) {
        toast.success("Agendamento cancelado.");
        setAberto(null);
        setMotivo("");
        router.refresh();
      } else {
        toast.error(res?.error ?? "Não foi possível cancelar o agendamento.");
      }
    });
  }

  return (
    <>
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="sm"
          onClick={abrirEditar}
          disabled={encerrado}
          title={encerrado ? "Agendamento encerrado" : "Editar agendamento"}
        >
          <Pencil className="h-3.5 w-3.5" />
          Editar
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setAberto("cancelar")}
          disabled={encerrado}
          title={encerrado ? "Agendamento encerrado" : "Cancelar agendamento"}
        >
          <X className="h-3.5 w-3.5" />
          Cancelar
        </Button>
      </div>

      {/* Editar: remarcar data/hora + trocar profissional/especialidade */}
      <Modal
        open={aberto === "editar"}
        onClose={() => setAberto(null)}
        title="Editar Agendamento"
        subtitle={atendimento.paciente}
        footer={
          <>
            <Button variant="ghost" onClick={() => setAberto(null)}>
              Fechar
            </Button>
            <Button variant="primary" onClick={salvarEdicao} disabled={pending}>
              <Save className="h-4 w-4" />
              {pending ? "Salvando..." : "Salvar Alterações"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              label="Nova Data"
              type="date"
              value={data}
              onChange={(e) => setData(e.target.value)}
            />
            <Input
              label="Novo Horário"
              type="time"
              value={hora}
              onChange={(e) => setHora(e.target.value)}
            />
          </div>
          <Select
            label="Profissional"
            value={profissionalId}
            onChange={(e) => setProfissionalId(e.target.value)}
          >
            <option value="">Manter profissional atual</option>
            {profissionais.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
                {p.especialidade && p.especialidade !== "—"
                  ? ` · ${p.especialidade}`
                  : ""}
              </option>
            ))}
          </Select>
          {especialidades.length > 0 && profEscolhido && (
            <p className="text-xs text-muted">
              Especialidade:{" "}
              <span className="font-medium text-ink">
                {profEscolhido.especialidade}
              </span>
            </p>
          )}
        </div>
      </Modal>

      {/* Cancelar: confirmação + motivo */}
      <Modal
        open={aberto === "cancelar"}
        onClose={() => setAberto(null)}
        title="Cancelar Agendamento"
        subtitle={atendimento.paciente}
        footer={
          <>
            <Button variant="ghost" onClick={() => setAberto(null)}>
              Voltar
            </Button>
            <Button
              variant="danger"
              onClick={confirmarCancelamento}
              disabled={pending}
            >
              <Ban className="h-4 w-4" />
              {pending ? "Cancelando..." : "Confirmar Cancelamento"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-muted">
            Esta ação marca o agendamento de{" "}
            <span className="font-medium text-ink">{atendimento.paciente}</span> em{" "}
            <span className="font-medium text-ink">
              {atendimento.data} às {atendimento.hora}
            </span>{" "}
            como cancelado.
          </p>
          <Input
            label="Motivo (opcional)"
            placeholder="Ex.: Solicitação do paciente"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
          />
        </div>
      </Modal>
    </>
  );
}

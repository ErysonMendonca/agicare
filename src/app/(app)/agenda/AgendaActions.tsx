"use client";

import { useState, useTransition } from "react";
import { Plus, CalendarRange, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { type Paciente } from "@/lib/data/patients";
import { type Profissional } from "@/lib/data/professionals";
import { type Escala } from "@/lib/data/schedules";
import { type Procedimento } from "@/lib/data/procedures";
import { type AttendanceOption } from "@/lib/data/attendance-options.shared";
import { NovoAgendamentoModal } from "./NovoAgendamentoModal";
import { EscalaHorariosModal } from "./EscalaHorariosModal";
import { EscalaListaModal } from "./EscalaListaModal";
import { Modal } from "@/components/ui/Modal";
import { toast } from "sonner";
import { deleteAllAppointments } from "@/lib/actions/appointments";

type ModalKind = "agendamento" | "escala-lista" | "escala-form" | "apagar-todos" | null;

/**
 * Ações do cabeçalho da Agenda: abre o wizard de Novo Agendamento e a gestão
 * de Escalas (listar/filtrar → criar ou editar). Dados vêm do servidor por props.
 */
export function AgendaActions({
  pacientes,
  profissionais,
  escalas,
  procedimentos,
  especialidades,
  isAdmin,
}: {
  pacientes: Paciente[];
  profissionais: Profissional[];
  escalas: Escala[];
  procedimentos: Procedimento[];
  especialidades: AttendanceOption[];
  isAdmin?: boolean;
}) {
  const [modal, setModal] = useState<ModalKind>(null);
  // Escala em edição; undefined → o form de escala abre em modo criação.
  const [escalaEdit, setEscalaEdit] = useState<Escala | undefined>(undefined);
  // Muda a cada abertura p/ forçar remont do form (estado inicializa das props).
  const [formKey, setFormKey] = useState(0);
  const [pending, startTransition] = useTransition();

  function abrirCriacao() {
    setEscalaEdit(undefined);
    setFormKey((k) => k + 1);
    setModal("escala-form");
  }

  function abrirEdicao(escala: Escala) {
    setEscalaEdit(escala);
    setFormKey((k) => k + 1);
    setModal("escala-form");
  }

  function confirmarApagarTodos() {
    startTransition(async () => {
      const res = await deleteAllAppointments();
      if (res?.ok) {
        toast.success("Todos os agendamentos foram apagados.");
        setModal(null);
      } else {
        toast.error(res?.error ?? "Erro ao apagar agendamentos.");
      }
    });
  }

  return (
    <>
      {isAdmin && (
        <Button variant="danger" onClick={() => setModal("apagar-todos")}>
          <Trash2 className="h-4 w-4" /> Apagar Todos
        </Button>
      )}
      <Button variant="outline" onClick={() => setModal("escala-lista")}>
        <CalendarRange className="h-4 w-4" /> Escala de Horários
      </Button>
      <Button variant="primary" onClick={() => setModal("agendamento")}>
        <Plus className="h-4 w-4" /> Novo Agendamento
      </Button>

      {/* Modal Apagar Todos */}
      {isAdmin && (
        <Modal
          open={modal === "apagar-todos"}
          onClose={() => setModal(null)}
          title="Apagar Todos os Agendamentos"
          subtitle="Essa ação é irreversível"
          footer={
            <>
              <Button variant="ghost" onClick={() => setModal(null)} disabled={pending}>
                Cancelar
              </Button>
              <Button variant="danger" onClick={confirmarApagarTodos} disabled={pending}>
                <Trash2 className="h-4 w-4" />
                {pending ? "Apagando..." : "Sim, apagar todos"}
              </Button>
            </>
          }
        >
          <div className="space-y-4 text-sm text-ink">
            <p>
              Você está prestes a apagar <strong>TODOS</strong> os agendamentos do sistema. Isso inclui todo o histórico, check-ins no totem, chamadas e registros de prontuários atrelados a esses agendamentos.
            </p>
            <p className="font-semibold text-danger">
              Tem certeza de que deseja continuar?
            </p>
          </div>
        </Modal>
      )}

      <NovoAgendamentoModal
        open={modal === "agendamento"}
        onClose={() => setModal(null)}
        pacientes={pacientes}
        profissionais={profissionais}
        especialidades={especialidades}
        procedimentos={procedimentos}
      />

      <EscalaListaModal
        open={modal === "escala-lista"}
        onClose={() => setModal(null)}
        escalas={escalas}
        especialidades={especialidades}
        onNova={abrirCriacao}
        onEditar={abrirEdicao}
      />

      <EscalaHorariosModal
        key={formKey}
        open={modal === "escala-form"}
        onClose={() => setModal(null)}
        especialidades={especialidades}
        procedimentos={procedimentos}
        profissionais={profissionais}
        escalas={escalas}
        escalaParaEditar={escalaEdit}
      />
    </>
  );
}

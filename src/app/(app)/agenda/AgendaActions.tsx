"use client";

import { useState } from "react";
import { Plus, CalendarRange } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { type Paciente } from "@/lib/data/patients";
import { type Profissional } from "@/lib/data/professionals";
import { type Escala } from "@/lib/data/schedules";
import { type Procedimento } from "@/lib/data/procedures";
import { type AttendanceOption } from "@/lib/data/attendance-options.shared";
import { NovoAgendamentoModal } from "./NovoAgendamentoModal";
import { EscalaHorariosModal } from "./EscalaHorariosModal";
import { EscalaListaModal } from "./EscalaListaModal";

type ModalKind = "agendamento" | "escala-lista" | "escala-form" | null;

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
}: {
  pacientes: Paciente[];
  profissionais: Profissional[];
  escalas: Escala[];
  procedimentos: Procedimento[];
  especialidades: AttendanceOption[];
}) {
  const [modal, setModal] = useState<ModalKind>(null);
  // Escala em edição; undefined → o form de escala abre em modo criação.
  const [escalaEdit, setEscalaEdit] = useState<Escala | undefined>(undefined);
  // Muda a cada abertura p/ forçar remont do form (estado inicializa das props).
  const [formKey, setFormKey] = useState(0);

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

  return (
    <>
      <Button variant="outline" onClick={() => setModal("escala-lista")}>
        <CalendarRange className="h-4 w-4" /> Escala de Horários
      </Button>
      <Button variant="primary" onClick={() => setModal("agendamento")}>
        <Plus className="h-4 w-4" /> Novo Agendamento
      </Button>

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
        escalas={escalas}
        escalaParaEditar={escalaEdit}
      />
    </>
  );
}

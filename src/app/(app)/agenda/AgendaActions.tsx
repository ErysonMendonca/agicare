"use client";

import { useState } from "react";
import { Plus, CalendarRange } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { type Paciente } from "@/lib/data/patients";
import { type Profissional } from "@/lib/data/professionals";
import { NovoAgendamentoModal } from "./NovoAgendamentoModal";
import { EscalaHorariosModal } from "./EscalaHorariosModal";

type ModalKind = "agendamento" | "escala" | null;

/**
 * Ações do cabeçalho da Agenda: abre o wizard de Novo Agendamento e a
 * configuração de Escala de Horários. Recebe os dados do servidor por props.
 */
export function AgendaActions({
  pacientes,
  profissionais,
}: {
  pacientes: Paciente[];
  profissionais: Profissional[];
}) {
  const [modal, setModal] = useState<ModalKind>(null);

  return (
    <>
      <Button variant="outline" onClick={() => setModal("escala")}>
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
      />
      <EscalaHorariosModal
        open={modal === "escala"}
        onClose={() => setModal(null)}
        profissionais={profissionais}
      />
    </>
  );
}

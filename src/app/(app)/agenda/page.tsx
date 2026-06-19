import { PageHeader } from "@/components/app/PageHeader";
import { listAppointments, countByStatus } from "@/lib/data/appointments";
import { listPatients } from "@/lib/data/patients";
import { listProfessionals } from "@/lib/data/professionals";
import { listSchedules } from "@/lib/data/schedules";
import { requireView } from "@/lib/permissions";
import { AgendaActions } from "./AgendaActions";
import { AgendaList } from "./AgendaList";

export default async function AgendaPage() {
  await requireView("agenda");
  const [atendimentos, pacientes, profissionais, escalas] = await Promise.all([
    listAppointments(),
    listPatients(),
    listProfessionals(),
    listSchedules(),
  ]);
  const kpis = countByStatus(atendimentos);

  return (
    <>
      <PageHeader
        title="Agenda de Atendimentos"
        subtitle="Gerencie e acompanhe todos os agendamentos da clínica"
        actions={
          <AgendaActions
            pacientes={pacientes}
            profissionais={profissionais}
            escalas={escalas}
          />
        }
      />

      <AgendaList
        atendimentos={atendimentos}
        profissionais={profissionais}
        kpis={kpis}
      />
    </>
  );
}

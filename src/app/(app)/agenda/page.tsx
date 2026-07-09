import { PageHeader } from "@/components/app/PageHeader";
import { listAppointments, countByStatus } from "@/lib/data/appointments";
import { listPatients } from "@/lib/data/patients";
import { listProfessionals } from "@/lib/data/professionals";
import { listSchedules } from "@/lib/data/schedules";
import { listProcedures } from "@/lib/data/procedures";
import { listAttendanceOptions } from "@/lib/data/attendance-options";
import { requireView } from "@/lib/permissions";
import { getRole } from "@/lib/auth";
import { AgendaActions } from "./AgendaActions";
import { AgendaList } from "./AgendaList";

export default async function AgendaPage() {
  await requireView("agenda");
  const role = await getRole();
  const isAdmin = role === "admin";
  const [
    atendimentos,
    pacientes,
    profissionais,
    escalas,
    procedimentos,
    attendanceOptions,
  ] = await Promise.all([
    listAppointments(),
    listPatients(),
    listProfessionals(),
    listSchedules(),
    listProcedures(),
    listAttendanceOptions(),
  ]);
  const kpis = countByStatus(atendimentos);
  // Catálogo de especialidades (mesma fonte do cadastro de profissional).
  const especialidades = attendanceOptions.especialidade ?? [];

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
            procedimentos={procedimentos}
            especialidades={especialidades}
            isAdmin={isAdmin}
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

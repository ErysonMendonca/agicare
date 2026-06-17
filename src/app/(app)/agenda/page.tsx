import {
  CalendarDays,
  Clock,
  CheckCircle2,
  Activity,
  CheckCheck,
} from "lucide-react";
import { PageHeader } from "@/components/app/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { Stagger, FadeInUp } from "@/components/ui/Motion";
import { listAppointments, countByStatus } from "@/lib/data/appointments";
import { listPatients } from "@/lib/data/patients";
import { listProfessionals } from "@/lib/data/professionals";
import { requireView } from "@/lib/permissions";
import { AgendaActions } from "./AgendaActions";
import { AgendaList } from "./AgendaList";

export default async function AgendaPage() {
  await requireView("agenda");
  const [atendimentos, pacientes, profissionais] = await Promise.all([
    listAppointments(),
    listPatients(),
    listProfessionals(),
  ]);
  const kpis = countByStatus(atendimentos);

  return (
    <>
      <PageHeader
        title="Agenda de Atendimentos"
        subtitle="Gerencie e acompanhe todos os agendamentos da clínica"
        actions={
          <AgendaActions pacientes={pacientes} profissionais={profissionais} />
        }
      />

      <Stagger className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <FadeInUp>
          <StatCard
            icon={<CalendarDays className="h-5 w-5" />}
            value={kpis.total}
            label="Total de Agendamentos"
            tone="brand"
          />
        </FadeInUp>
        <FadeInUp>
          <StatCard
            icon={<Clock className="h-5 w-5" />}
            value={kpis.agendados}
            label="Agendados"
            tone="blue"
          />
        </FadeInUp>
        <FadeInUp>
          <StatCard
            icon={<CheckCircle2 className="h-5 w-5" />}
            value={kpis.confirmados}
            label="Confirmados"
            tone="green"
          />
        </FadeInUp>
        <FadeInUp>
          <StatCard
            icon={<Activity className="h-5 w-5" />}
            value={kpis.emAtendimento}
            label="Em Atendimento"
            tone="orange"
          />
        </FadeInUp>
        <FadeInUp>
          <StatCard
            icon={<CheckCheck className="h-5 w-5" />}
            value={kpis.finalizados}
            label="Finalizados"
            tone="purple"
          />
        </FadeInUp>
      </Stagger>

      <AgendaList atendimentos={atendimentos} profissionais={profissionais} />
    </>
  );
}

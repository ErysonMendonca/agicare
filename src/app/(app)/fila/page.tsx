import { PageHeader } from "@/components/app/PageHeader";
import { listQueue, listAgendadosHoje } from "@/lib/data/queue";
import { listAttendanceOptions } from "@/lib/data/attendance-options";
import { requireView } from "@/lib/permissions";
import { FilaClient } from "./FilaClient";

export default async function FilaPage() {
  await requireView("fila");
  const [fila, agendados, attendanceOptions] = await Promise.all([
    listQueue(),
    listAgendadosHoje(),
    listAttendanceOptions(),
  ]);

  const aguardando = fila.filter((i) => i.status.label === "Aguardando").length;
  const chamados = fila.filter((i) => i.status.label === "Chamado").length;
  const emAtendimento = fila.filter(
    (i) => i.status.label === "Em Atendimento",
  ).length;
  const total = fila.length;

  return (
    <>
      <PageHeader
        title="Fila de Atendimento"
        subtitle="Gerencie a fila de pacientes e controle os atendimentos"
      />

      <FilaClient
        fila={fila}
        agendados={agendados}
        attendanceOptions={attendanceOptions}
        kpis={{ aguardando, chamados, emAtendimento, total }}
      />
    </>
  );
}

import { PageHeader } from "@/components/app/PageHeader";
import { listQueue, listAgendadosHoje } from "@/lib/data/queue";
import { getAttendanceFlow } from "@/lib/data/attendance-flow";
import { requireView } from "@/lib/permissions";
import { FilaClient } from "./FilaClient";

export default async function FilaPage() {
  await requireView("fila");
  const [fila, agendados, stages] = await Promise.all([
    listQueue(),
    listAgendadosHoje(),
    getAttendanceFlow(),
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
        stages={stages}
        kpis={{ aguardando, chamados, emAtendimento, total }}
      />
    </>
  );
}

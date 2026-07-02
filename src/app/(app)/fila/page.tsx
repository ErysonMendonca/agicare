import { PageHeader } from "@/components/app/PageHeader";
import { listQueue, listAgendadosHoje } from "@/lib/data/queue";
import { getAttendanceFlow } from "@/lib/data/attendance-flow";
import { listAttendanceOptions } from "@/lib/data/attendance-options";
import { requireView } from "@/lib/permissions";
import { getRole } from "@/lib/auth";
import { FilaClient } from "./FilaClient";

/** Data local de hoje em yyyy-mm-dd (coerente com <input type="date">). */
function hojeISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

export default async function FilaPage({
  searchParams,
}: {
  // Next.js 16: searchParams é assíncrono.
  searchParams: Promise<{ data?: string }>;
}) {
  await requireView("fila");

  // Médico: o botão "Atender" leva direto ao prontuário do paciente.
  const isMedico = (await getRole()) === "medico";

  // Dia selecionado (default = hoje). A fila lista só as entradas desse dia,
  // evitando poluir a tela com pacientes de dias que já passaram.
  // `data=todos` desliga o filtro de data e mostra a fila do período inteiro.
  const sp = await searchParams;
  const hoje = hojeISO();
  const dataParam = sp.data?.trim() || "";
  const todoPeriodo = dataParam === "todos";
  const dataSelecionada = todoPeriodo ? "" : dataParam || hoje;
  const isHoje = !todoPeriodo && dataSelecionada === hoje;

  const [fila, agendados, stages, attendanceOptions] = await Promise.all([
    listQueue(todoPeriodo ? {} : { date: dataSelecionada }),
    // "Aguardando chegada": agendados (sem check-in) do DIA selecionado — não só
    // hoje, p/ enxergar avulsos/agendados de datas futuras. No modo "todos"
    // (período inteiro) fica vazio: seria uma lista sem recorte de dia.
    todoPeriodo
      ? Promise.resolve([])
      : listAgendadosHoje({ date: dataSelecionada }),
    getAttendanceFlow(),
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
        stages={stages}
        attendanceOptions={attendanceOptions}
        kpis={{ aguardando, chamados, emAtendimento, total }}
        dataSelecionada={dataSelecionada}
        isHoje={isHoje}
        todoPeriodo={todoPeriodo}
        isMedico={isMedico}
      />
    </>
  );
}

import {
  FileText,
  Clock,
  Activity,
  CheckCircle2,
  CalendarClock,
  Stethoscope,
} from "lucide-react";
import { PageHeader } from "@/components/app/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { Stagger, FadeInUp } from "@/components/ui/Motion";
import { FilaClient } from "@/app/(app)/fila/FilaClient";
import { listQueue, listAgendadosHoje } from "@/lib/data/queue";
import { getMySpecialty, listAtendimentosPorData } from "@/lib/data/prontuario";
import { getCurrentUser, getRole } from "@/lib/auth";
import { getSettings } from "@/lib/data/settings";
import { requireView } from "@/lib/permissions";

/** Data local de hoje em yyyy-mm-dd (coerente com <input type="date">). */
function hojeISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

export default async function ProntuarioPage({
  searchParams,
}: {
  // Next 16: searchParams é assíncrono.
  searchParams: Promise<{ data?: string; especialidade?: string }>;
}) {
  await requireView("prontuario");
  const sp = await searchParams;

  // Especialidade-base do profissional logado (null em demo / não-clínico).
  const especialidadeBase = await getMySpecialty();
  const souProfissional = especialidadeBase != null;
  // Médico opera a partir do Prontuário (não tem mais a Fila): "Atender" leva
  // ao prontuário do paciente, igual à Fila.
  const isMedico = (await getRole()) === "medico";
  const { totemEnabled } = await getSettings();
  // Nome do médico logado p/ o default "meus atendimentos" (só se for clínico).
  const myName = souProfissional
    ? ((await getCurrentUser())?.profile?.full_name ?? null)
    : null;

  // Especialidade efetiva (default do profissional; filtro por URL sobrepõe).
  const selectedEsp = sp.especialidade ?? especialidadeBase ?? "todas";
  const queueSpecialty = selectedEsp === "todas" ? null : selectedEsp;

  // Data (mesma convenção da Fila, controlada pelos filtros do FilaClient):
  //  • ausente/hoje → fila viva de hoje;
  //  • `data=todos` (botão "Todo o período") → todos os atendimentos salvos;
  //  • data específica → aquele dia (histórico).
  const hoje = hojeISO();
  const dataParam = sp.data?.trim() || "";
  const todoPeriodo = dataParam === "todos";
  const dataSelecionada = todoPeriodo ? "" : dataParam || hoje;
  const isHoje = !todoPeriodo && dataSelecionada === hoje;

  const base = isHoje
    ? await listQueue({ specialty: queueSpecialty })
    : await listAtendimentosPorData(todoPeriodo ? null : dataSelecionada, {
        specialty: queueSpecialty,
      });

  // Mostra os atendimentos do médico logado E os SEM profissional ("—") da sua
  // especialidade (o listQueue já escopou a query p/ specialty==minha/null e
  // professional_id==null/eu). Assim um agendamento feito só por especialidade
  // aparece para TODOS os médicos dela até que um clique em "Atender" e o
  // reivindique (`atenderPaciente`), sumindo da lista dos demais.
  let filtrada = base;
  if (souProfissional && myName) {
    filtrada = filtrada.filter(
      (i) => i.medico === myName || i.medico === "—",
    );
  }

  // "Agendados": pacientes com agendamento de HOJE que ainda não chegaram — só
  // faz sentido na visão de hoje (no histórico não há agenda futura a contar).
  let agendadosBase = isHoje
    ? await listAgendadosHoje({ specialty: queueSpecialty })
    : [];
  // Agendados (pré-chegada): mantém só os do próprio médico. Os "livres por
  // especialidade" (sem profissional) só entram na lista principal DEPOIS do
  // check-in/recepção (via listQueue, que escopa por especialidade) — evita
  // vazar agendados de outras especialidades, já que listAgendadosHoje não
  // filtra por especialidade.
  if (souProfissional && myName) {
    agendadosBase = agendadosBase.filter((i) => i.medico === myName);
  }
  const agendados = agendadosBase.length;

  const todos = filtrada.length;
  const aguardando = filtrada.filter(
    (i) =>
      i.statusRaw === "aguardando" ||
      i.statusRaw === "aguardando_atendimento" ||
      i.statusRaw === "chamado",
  ).length;
  const emAtendimento = filtrada.filter(
    (i) => i.statusRaw === "em_atendimento",
  ).length;
  const realizados = filtrada.filter(
    (i) => i.statusRaw === "finalizado",
  ).length;

  return (
    <>
      <PageHeader
        title="Prontuário Eletrônico Atendimento Ambulatorial"
        subtitle="Gerencie os atendimentos e abra o prontuário dos pacientes"
      />

      {/* Especialidade / escopo aplicado */}
      <div className="mb-4 inline-flex items-center gap-2 rounded-lg border border-brand-200 bg-brand-50 px-3 py-1.5 text-sm text-brand-700">
        <Stethoscope className="h-4 w-4" />
        Exibindo:{" "}
        <span className="font-semibold">
          {selectedEsp === "todas" ? "Todas as especialidades" : selectedEsp}
        </span>
        {souProfissional && myName && (
          <span className="text-brand-600">· seus atendimentos</span>
        )}
      </div>

      {/* KPIs */}
      <Stagger className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <FadeInUp>
          <StatCard icon={<FileText className="h-5 w-5" />} value={String(todos)} label="Todos" tone="neutral" />
        </FadeInUp>
        <FadeInUp>
          <StatCard icon={<CalendarClock className="h-5 w-5" />} value={String(agendados)} label="Agendados" tone="info" />
        </FadeInUp>
        <FadeInUp>
          <StatCard icon={<Clock className="h-5 w-5" />} value={String(aguardando)} label="Aguardando Atendimento" tone="info" />
        </FadeInUp>
        <FadeInUp>
          <StatCard icon={<Activity className="h-5 w-5" />} value={String(emAtendimento)} label="Em Atendimento" tone="info" />
        </FadeInUp>
        <FadeInUp>
          <StatCard icon={<CheckCircle2 className="h-5 w-5" />} value={String(realizados)} label="Atendimentos Realizados" tone="success" />
        </FadeInUp>
      </Stagger>

      {/* Lista de pacientes — busca, filtro de data (default hoje / "Todo o
          período") e status ficam DENTRO do FilaClient, logo abaixo das KPIs.
          Sempre renderizado para que os filtros continuem acessíveis mesmo com
          a lista vazia (o FilaClient tem seu próprio estado-vazio). */}
      <h3 className="mb-1 font-semibold text-ink">
        Lista de Pacientes <span className="text-muted">({todos} registros)</span>
      </h3>
      <FilaClient
        fila={filtrada}
        isMedico={isMedico}
        totemEnabled={totemEnabled}
        dataSelecionada={dataSelecionada}
        isHoje={isHoje}
        todoPeriodo={todoPeriodo}
      />
    </>
  );
}

import { Clock, PhoneCall, Users } from "lucide-react";
import { PageHeader } from "@/components/app/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { Stagger, FadeInUp } from "@/components/ui/Motion";
import { listQueue, listAgendadosHoje } from "@/lib/data/queue";
import { requireView } from "@/lib/permissions";
import { FilaClient } from "./FilaClient";

export default async function FilaPage() {
  await requireView("fila");
  const [fila, agendados] = await Promise.all([
    listQueue(),
    listAgendadosHoje(),
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

      <Stagger className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <FadeInUp>
          <StatCard
            icon={<Clock className="h-5 w-5" />}
            value={String(aguardando)}
            label="Aguardando"
            tone="blue"
          />
        </FadeInUp>
        <FadeInUp>
          <StatCard
            icon={<PhoneCall className="h-5 w-5" />}
            value={String(chamados)}
            label="Chamados"
            tone="brand"
          />
        </FadeInUp>
        <FadeInUp>
          <StatCard
            icon={<Users className="h-5 w-5" />}
            value={String(emAtendimento)}
            label="Em Atendimento"
            tone="green"
          />
        </FadeInUp>
        <FadeInUp>
          <StatCard
            icon={<Users className="h-5 w-5" />}
            value={String(total)}
            label="Total"
            tone="purple"
          />
        </FadeInUp>
      </Stagger>

      <FilaClient fila={fila} agendados={agendados} />
    </>
  );
}

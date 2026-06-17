import { getResumo } from "@/lib/data/prontuario";
import { listEvolucoes } from "@/lib/data/evolucao";
import { SecaoClinica } from "../SecaoClinica";
import { EvolucaoClient } from "./EvolucaoClient";

export default async function EvolucaoPage({
  params,
}: {
  params: Promise<{ patientId: string }>;
}) {
  const { patientId } = await params;
  const [resumo, evolucoes] = await Promise.all([
    getResumo(patientId),
    listEvolucoes(patientId),
  ]);

  return (
    <SecaoClinica
      patientId={patientId}
      identificacao={resumo?.identificacao ?? null}
      title="Evolução Clínica"
      subtitle="Registre a evolução do atendimento e os sinais vitais"
    >
      <EvolucaoClient patientId={patientId} evolucoes={evolucoes} />
    </SecaoClinica>
  );
}

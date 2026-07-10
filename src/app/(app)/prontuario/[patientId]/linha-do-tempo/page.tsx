import { getResumo } from "@/lib/data/prontuario";
import { getHistoricoAtendimentos } from "@/lib/data/historico-atendimentos";
import { SecaoClinica } from "../SecaoClinica";
import { LinhaDoTempoClient } from "./LinhaDoTempoClient";

export default async function LinhaDoTempoPage({
  params,
}: {
  params: Promise<{ patientId: string }>;
}) {
  const { patientId } = await params;
  const [resumo, atendimentos] = await Promise.all([
    getResumo(patientId),
    getHistoricoAtendimentos(patientId),
  ]);

  return (
    <SecaoClinica
      patientId={patientId}
      identificacao={resumo?.identificacao ?? null}
      title="Linha do Tempo"
      subtitle="Histórico de documentos por atendimento"
    >
      <LinhaDoTempoClient patientId={patientId} atendimentos={atendimentos} />
    </SecaoClinica>
  );
}

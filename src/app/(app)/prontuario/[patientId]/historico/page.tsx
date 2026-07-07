import { getResumo } from "@/lib/data/prontuario";
import { listScannedRecords } from "@/lib/data/historico";
import { SecaoClinica } from "../SecaoClinica";
import { HistoricoClient } from "./HistoricoClient";

export default async function HistoricoPage({
  params,
}: {
  params: Promise<{ patientId: string }>;
}) {
  const { patientId } = await params;
  const [resumo, historicos] = await Promise.all([
    getResumo(patientId),
    listScannedRecords(patientId),
  ]);

  return (
    <SecaoClinica
      patientId={patientId}
      identificacao={resumo?.identificacao ?? null}
      title="Histórico Escaneado"
      subtitle="Anexe arquivos e prontuários antigos do paciente"
    >
      <HistoricoClient patientId={patientId} historicos={historicos} />
    </SecaoClinica>
  );
}

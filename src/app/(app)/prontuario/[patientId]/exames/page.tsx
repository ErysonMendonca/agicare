import { getResumo } from "@/lib/data/prontuario";
import { listExamOrders } from "@/lib/data/exames";
import { SecaoClinica } from "../SecaoClinica";
import { ExamesClient } from "./ExamesClient";

export default async function ExamesPage({
  params,
}: {
  params: Promise<{ patientId: string }>;
}) {
  const { patientId } = await params;
  const [resumo, exames] = await Promise.all([
    getResumo(patientId),
    listExamOrders(patientId),
  ]);

  return (
    <SecaoClinica
      patientId={patientId}
      identificacao={resumo?.identificacao ?? null}
      title="Pedidos de Exames"
      subtitle="Solicite exames laboratoriais e de imagem e acompanhe o status"
    >
      <ExamesClient patientId={patientId} exames={exames} />
    </SecaoClinica>
  );
}

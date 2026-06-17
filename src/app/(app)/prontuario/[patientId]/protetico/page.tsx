import { getResumo } from "@/lib/data/prontuario";
import { listPedidosProteticos } from "@/lib/data/protetico";
import { SecaoClinica } from "../SecaoClinica";
import { ProteticoClient } from "./ProteticoClient";

export default async function ProteticoPage({
  params,
}: {
  params: Promise<{ patientId: string }>;
}) {
  const { patientId } = await params;
  const [resumo, pedidos] = await Promise.all([
    getResumo(patientId),
    listPedidosProteticos(patientId),
  ]);

  return (
    <SecaoClinica
      patientId={patientId}
      identificacao={resumo?.identificacao ?? null}
      title="Fluxo Protético"
      subtitle="Solicite trabalhos ao laboratório de prótese e anexe scans, fotos e radiografias"
    >
      <ProteticoClient patientId={patientId} pedidos={pedidos} />
    </SecaoClinica>
  );
}

import { getResumo } from "@/lib/data/prontuario";
import { getSettings } from "@/lib/data/settings";
import { listPedidosProteticos } from "@/lib/data/protetico";
import { SecaoClinica } from "../SecaoClinica";
import { ProteticoClient } from "./ProteticoClient";

export default async function ProteticoPage({
  params,
}: {
  params: Promise<{ patientId: string }>;
}) {
  const { patientId } = await params;
  const [resumo, settings, pedidos] = await Promise.all([
    getResumo(patientId),
    getSettings(),
    listPedidosProteticos(patientId),
  ]);

  const identificacao = resumo?.identificacao ?? null;

  return (
    <SecaoClinica
      patientId={patientId}
      identificacao={identificacao}
      title="Fluxo Protético"
      subtitle="Solicite trabalhos ao laboratório de prótese e anexe scans, fotos e radiografias"
    >
      <ProteticoClient
        patientId={patientId}
        clinica={{
          nome: settings.clinicName,
          cnpj: settings.cnpj,
          endereco: settings.address,
          telefone: settings.phone,
        }}
        paciente={{
          nome: identificacao?.nome ?? "—",
          registro: identificacao?.registro ?? "—",
          idade: identificacao?.idade ?? "—",
          convenio: identificacao?.convenio ?? "—",
        }}
        pedidos={pedidos}
      />
    </SecaoClinica>
  );
}

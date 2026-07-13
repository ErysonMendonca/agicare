import { getResumo } from "@/lib/data/prontuario";
import { getSettings } from "@/lib/data/settings";
import { listExamOrders } from "@/lib/data/exames";
import { SecaoClinica } from "../SecaoClinica";
import { ExamesClient } from "./ExamesClient";

export default async function ExamesPage({
  params,
}: {
  params: Promise<{ patientId: string }>;
}) {
  const { patientId } = await params;
  const [resumo, settings, exames] = await Promise.all([
    getResumo(patientId),
    getSettings(),
    listExamOrders(patientId),
  ]);

  const identificacao = resumo?.identificacao ?? null;

  return (
    <SecaoClinica
      patientId={patientId}
      identificacao={identificacao}
      title="Pedidos de Exames"
      subtitle="Solicite exames laboratoriais e de imagem e acompanhe o status"
    >
      <ExamesClient
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
        exames={exames}
      />
    </SecaoClinica>
  );
}

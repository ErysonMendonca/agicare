import { getResumo } from "@/lib/data/prontuario";
import { getSettings } from "@/lib/data/settings";
import { listEvolucoes } from "@/lib/data/evolucao";
import { SecaoClinica } from "../SecaoClinica";
import { EvolucaoClient } from "./EvolucaoClient";

export default async function EvolucaoPage({
  params,
}: {
  params: Promise<{ patientId: string }>;
}) {
  const { patientId } = await params;
  const [resumo, settings, evolucoes] = await Promise.all([
    getResumo(patientId),
    getSettings(),
    listEvolucoes(patientId),
  ]);

  const identificacao = resumo?.identificacao ?? null;

  return (
    <SecaoClinica
      patientId={patientId}
      identificacao={identificacao}
      title="Evolução Clínica"
      subtitle="Registre a evolução do atendimento e os sinais vitais"
    >
      <EvolucaoClient
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
        evolucoes={evolucoes}
      />
    </SecaoClinica>
  );
}

import { getResumo, getMySpecialty } from "@/lib/data/prontuario";
import { getSettings } from "@/lib/data/settings";
import { listAnamneses } from "@/lib/data/anamnese";
import { listAnamneseTemplates } from "@/lib/data/anamnese-templates";
import { SecaoClinica } from "../SecaoClinica";
import { AnamneseClient } from "./AnamneseClient";

export default async function AnamnesePage({
  params,
}: {
  params: Promise<{ patientId: string }>;
}) {
  const { patientId } = await params;
  const [resumo, settings, anamneses, minhaEspecialidade, templates] =
    await Promise.all([
      getResumo(patientId),
      getSettings(),
      listAnamneses(patientId),
      getMySpecialty(),
      listAnamneseTemplates(),
    ]);

  const identificacao = resumo?.identificacao ?? null;

  return (
    <SecaoClinica
      patientId={patientId}
      identificacao={identificacao}
      title="Anamnese"
      subtitle="Anamnese dinâmica por especialidade com consentimento LGPD"
    >
      <AnamneseClient
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
        anamneses={anamneses}
        minhaEspecialidade={minhaEspecialidade}
        templates={templates}
      />
    </SecaoClinica>
  );
}

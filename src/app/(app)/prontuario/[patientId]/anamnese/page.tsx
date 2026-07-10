import { getResumo, getMySpecialty } from "@/lib/data/prontuario";
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
  const [resumo, anamneses, minhaEspecialidade, templates] = await Promise.all([
    getResumo(patientId),
    listAnamneses(patientId),
    getMySpecialty(),
    listAnamneseTemplates(),
  ]);

  return (
    <SecaoClinica
      patientId={patientId}
      identificacao={resumo?.identificacao ?? null}
      title="Anamnese"
      subtitle="Anamnese dinâmica por especialidade com consentimento LGPD"
    >
      <AnamneseClient
        patientId={patientId}
        anamneses={anamneses}
        minhaEspecialidade={minhaEspecialidade}
        templates={templates}
      />
    </SecaoClinica>
  );
}

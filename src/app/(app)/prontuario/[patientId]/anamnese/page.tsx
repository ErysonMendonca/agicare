import { getResumo, getMySpecialty } from "@/lib/data/prontuario";
import { listAnamneses } from "@/lib/data/anamnese";
import { SecaoClinica } from "../SecaoClinica";
import { AnamneseClient } from "./AnamneseClient";

export default async function AnamnesePage({
  params,
}: {
  params: Promise<{ patientId: string }>;
}) {
  const { patientId } = await params;
  const [resumo, anamneses, minhaEspecialidade] = await Promise.all([
    getResumo(patientId),
    listAnamneses(patientId),
    getMySpecialty(),
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
      />
    </SecaoClinica>
  );
}

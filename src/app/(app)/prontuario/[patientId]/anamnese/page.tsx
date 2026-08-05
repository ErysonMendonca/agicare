import { getResumo, getMySpecialty } from "@/lib/data/prontuario";
import { getSettings } from "@/lib/data/settings";
import { listAnamneses } from "@/lib/data/anamnese";
import { listAnamneseTemplates } from "@/lib/data/anamnese-templates";
import { listEspecialidades } from "@/lib/data/especialidades";
import { SecaoClinica } from "../SecaoClinica";
import { AnamneseClient } from "./AnamneseClient";

export default async function AnamnesePage({
  params,
}: {
  params: Promise<{ patientId: string }>;
}) {
  const { patientId } = await params;
  const [resumo, settings, anamneses, minhaEspecialidade, templates, especialidadesRaw] =
    await Promise.all([
      getResumo(patientId),
      getSettings(),
      listAnamneses(patientId),
      getMySpecialty(),
      listAnamneseTemplates(),
      listEspecialidades(),
    ]);

  const especialidades = especialidadesRaw.filter(e => e.active).map(e => e.label);
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
          logo: settings.branding.logoUrl,
          cnpj: settings.cnpj,
          endereco: settings.address,
          telefone: settings.phone,
        }}
        paciente={{
          nome: identificacao?.nome ?? "—",
          registro: identificacao?.registro ?? "—",
          idade: identificacao?.idade ?? "—",
          convenio: identificacao?.convenio ?? "—",
          plano: identificacao?.plano ?? "—",
          dataAdmissao: identificacao?.dataAdmissao ?? "—",
          nascimento: identificacao?.nascimento ?? "—",
          sexo: identificacao?.genero ?? "—",
          nomeMae: identificacao?.nomeMae ?? "—",
        }}
        anamneses={anamneses}
        minhaEspecialidade={minhaEspecialidade}
        templates={templates}
        especialidades={especialidades}
      />
    </SecaoClinica>
  );
}

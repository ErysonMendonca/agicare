import { getResumo } from "@/lib/data/prontuario";
import { getSettings } from "@/lib/data/settings";
import {
  listSinaisVitais,
  listAnotacoes,
  listCuidados,
  getBalancoHidrico,
  listEvolucoes,
  listEscalas,
  listProcedimentosEnfermagem,
  listSae,
  nextAnotacaoCode,
  type OpcaoPaciente,
} from "@/lib/data/enfermagem";
import { SecaoClinica } from "../SecaoClinica";
import { EnfermagemProntuarioClient } from "./EnfermagemProntuarioClient";

// Guard de módulo herdado de `[patientId]/layout.tsx` (requireView("prontuario")).
export default async function EnfermagemProntuarioPage({
  params,
}: {
  params: Promise<{ patientId: string }>;
}) {
  const { patientId } = await params;

  const [
    resumo,
    settings,
    sinais,
    anotacoes,
    cuidados,
    balanco,
    evolucoes,
    escalas,
    procedimentos,
    sae,
    proximoCodigo,
  ] = await Promise.all([
    getResumo(patientId),
    getSettings(),
    listSinaisVitais(patientId),
    listAnotacoes(patientId),
    listCuidados(patientId),
    getBalancoHidrico(patientId),
    listEvolucoes(patientId),
    listEscalas(patientId),
    listProcedimentosEnfermagem(patientId),
    listSae(patientId),
    nextAnotacaoCode(patientId),
  ]);

  // Paciente fixo do prontuário → lista de 1 item p/ pré-selecionar nos forms.
  const opcoesPacientes: OpcaoPaciente[] = resumo?.identificacao
    ? [{ id: patientId, nome: resumo.identificacao.nome }]
    : [];

  const identificacao = resumo?.identificacao ?? null;
  const cabecalho = {
    clinica: {
      nome: settings.clinicName,
      cnpj: settings.cnpj,
      endereco: settings.address,
      telefone: settings.phone,
    },
    paciente: {
      nome: identificacao?.nome ?? "—",
      registro: identificacao?.registro ?? "—",
      idade: identificacao?.idade ?? "—",
      convenio: identificacao?.convenio ?? "—",
    },
  };

  return (
    <SecaoClinica
      patientId={patientId}
      identificacao={resumo?.identificacao ?? null}
      title="Enfermagem"
      subtitle="Sinais vitais, cuidados, balanço hídrico, escalas e SAE do paciente"
    >
      <EnfermagemProntuarioClient
        cabecalho={cabecalho}
        pacientes={opcoesPacientes}
        sinais={sinais}
        anotacoes={anotacoes}
        proximoCodigo={proximoCodigo}
        cuidados={cuidados}
        balanco={balanco}
        evolucoes={evolucoes}
        escalas={escalas}
        procedimentos={procedimentos}
        sae={sae}
      />
    </SecaoClinica>
  );
}

import { getResumo } from "@/lib/data/prontuario";
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

  return (
    <SecaoClinica
      patientId={patientId}
      identificacao={resumo?.identificacao ?? null}
      title="Enfermagem"
      subtitle="Sinais vitais, cuidados, balanço hídrico, escalas e SAE do paciente"
    >
      <EnfermagemProntuarioClient
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

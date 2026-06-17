import { getResumo } from "@/lib/data/prontuario";
import { listPrescricoes, listMedicamentos } from "@/lib/data/prescricao";
import { SecaoClinica } from "../SecaoClinica";
import { PrescricaoClient } from "./PrescricaoClient";

export default async function PrescricaoPage({
  params,
}: {
  params: Promise<{ patientId: string }>;
}) {
  const { patientId } = await params;
  const [resumo, prescricoes, medicamentos] = await Promise.all([
    getResumo(patientId),
    listPrescricoes(patientId),
    listMedicamentos(),
  ]);

  return (
    <SecaoClinica
      patientId={patientId}
      identificacao={resumo?.identificacao ?? null}
      title="Prescrição Médica"
      subtitle="Prescreva medicamentos e cuidados; itens com frequência geram checagem"
    >
      <PrescricaoClient
        patientId={patientId}
        prescricoes={prescricoes}
        medicamentos={medicamentos}
      />
    </SecaoClinica>
  );
}

import { getResumo } from "@/lib/data/prontuario";
import { listChecagens } from "@/lib/data/prescricao";
import { SecaoClinica } from "../SecaoClinica";
import { ChecagemClient } from "./ChecagemClient";

export default async function ChecagemPage({
  params,
}: {
  params: Promise<{ patientId: string }>;
}) {
  const { patientId } = await params;
  const [resumo, checagens] = await Promise.all([
    getResumo(patientId),
    listChecagens(patientId),
  ]);

  return (
    <SecaoClinica
      patientId={patientId}
      identificacao={resumo?.identificacao ?? null}
      title="Checagem"
      subtitle="Aprazamentos de medicamentos e cuidados gerados pela prescrição"
    >
      <ChecagemClient patientId={patientId} checagens={checagens} />
    </SecaoClinica>
  );
}

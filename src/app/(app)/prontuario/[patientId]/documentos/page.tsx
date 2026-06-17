import { getResumo } from "@/lib/data/prontuario";
import { listDocumentos } from "@/lib/data/documentos";
import { listPrescricoes } from "@/lib/data/prescricao";
import { SecaoClinica } from "../SecaoClinica";
import { DocumentosClient } from "./DocumentosClient";

export default async function DocumentosPage({
  params,
}: {
  params: Promise<{ patientId: string }>;
}) {
  const { patientId } = await params;
  const [resumo, documentos, prescricoes] = await Promise.all([
    getResumo(patientId),
    listDocumentos(patientId),
    listPrescricoes(patientId),
  ]);

  return (
    <SecaoClinica
      patientId={patientId}
      identificacao={resumo?.identificacao ?? null}
      title="Documentos — Receita, Atestados e Altas"
      subtitle="Emita receitas, atestados (CID-10 opcional) e altas com orientações"
    >
      <DocumentosClient
        patientId={patientId}
        documentos={documentos}
        temReceita={prescricoes.length > 0}
      />
    </SecaoClinica>
  );
}

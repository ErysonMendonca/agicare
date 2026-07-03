import { getResumo } from "@/lib/data/prontuario";
import { listDocumentos } from "@/lib/data/documentos";
import { listPrescricoes } from "@/lib/data/prescricao";
import { listCidCodes } from "@/lib/data/cid";
import { getSettings } from "@/lib/data/settings";
import { SecaoClinica } from "../SecaoClinica";
import { DocumentosClient } from "./DocumentosClient";

export default async function DocumentosPage({
  params,
}: {
  params: Promise<{ patientId: string }>;
}) {
  const { patientId } = await params;
  const [resumo, documentos, prescricoes, cidCodes, settings] = await Promise.all([
    getResumo(patientId),
    listDocumentos(patientId),
    listPrescricoes(patientId),
    listCidCodes(),
    getSettings(),
  ]);

  const identificacao = resumo?.identificacao ?? null;

  return (
    <SecaoClinica
      patientId={patientId}
      identificacao={identificacao}
      title="Documentos — Receita, Atestados e Altas"
      subtitle="Emita receitas, atestados (CID-10 opcional) e altas com orientações"
    >
      <DocumentosClient
        patientId={patientId}
        documentos={documentos}
        temReceita={prescricoes.length > 0}
        cidCodes={cidCodes}
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
      />
    </SecaoClinica>
  );
}

import { getResumo } from "@/lib/data/prontuario";
import { getSettings } from "@/lib/data/settings";
import { listReceituarios, getPacienteEndereco } from "@/lib/data/receituario";
import { listCidCodes } from "@/lib/data/cid";
import { SecaoClinica } from "../SecaoClinica";
import { ReceituarioClient } from "./ReceituarioClient";

export default async function ReceituarioPage({
  params,
}: {
  params: Promise<{ patientId: string }>;
}) {
  const { patientId } = await params;
  const [resumo, settings, endereco, receituarios, cidCodes] = await Promise.all([
    getResumo(patientId),
    getSettings(),
    getPacienteEndereco(patientId),
    listReceituarios(patientId),
    listCidCodes(),
  ]);

  const identificacao = resumo?.identificacao ?? null;

  return (
    <SecaoClinica
      patientId={patientId}
      identificacao={identificacao}
      title="Receituário"
      subtitle="Emita receituários simples ou de controle especial (Portaria 344/98)"
    >
      <ReceituarioClient
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
        endereco={{
          endereco: endereco?.endereco ?? "",
          bairro: endereco?.bairro ?? "",
          cidade: endereco?.cidade ?? "",
          uf: endereco?.uf ?? "",
          cep: endereco?.cep ?? "",
        }}
        receituarios={receituarios}
        cidCodes={cidCodes}
      />
    </SecaoClinica>
  );
}

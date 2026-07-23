import { getResumo } from "@/lib/data/prontuario";
import { getSettings } from "@/lib/data/settings";
import { listReceituarios, getPacienteEndereco } from "@/lib/data/receituario";
import { listCidCodes } from "@/lib/data/cid";
import { getProfissionalAtual } from "@/lib/data/profissional-atual";
import { SecaoClinica } from "../SecaoClinica";
import { ReceituarioClient } from "./ReceituarioClient";

export default async function ReceituarioPage({
  params,
}: {
  params: Promise<{ patientId: string }>;
}) {
  const { patientId } = await params;
  const [resumo, settings, endereco, receituarios, cidCodes, profissional] =
    await Promise.all([
      getResumo(patientId),
      getSettings(),
      getPacienteEndereco(patientId),
      listReceituarios(patientId),
      listCidCodes(),
      getProfissionalAtual(),
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
          cpf: identificacao?.cpf ?? "—",
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
        profissional={{
          nome: profissional?.nome ?? "—",
          conselho: profissional?.conselho ?? "—",
        }}
      />
    </SecaoClinica>
  );
}

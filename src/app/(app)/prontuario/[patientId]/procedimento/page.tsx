import { Card } from "@/components/ui/Card";
import { getResumo } from "@/lib/data/prontuario";
import { getRole } from "@/lib/auth";
import { getSettings } from "@/lib/data/settings";
import { getProfissionalAtual } from "@/lib/data/profissional-atual";
import {
  getAtendimentoAtivo,
  listCatalogoProcedimentos,
  listProcedimentosAtendimento,
  type ProcedimentoCatalogo,
  type ProcedimentoExecutado,
} from "@/lib/data/atendimento";
import {
  listProcedimentoDocs,
  type ProcedimentoDocResumo,
} from "@/lib/data/procedimento-doc";
import { SecaoClinica } from "../SecaoClinica";
import { AtendimentoAtivoCard } from "../AtendimentoAtivoCard";

/** Data/hora legível — formatada no servidor (evita divergir na hidratação). */
function formatarDataHora(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
}

function formatarData(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("pt-BR");
}

export default async function ProcedimentoPage({
  params,
}: {
  params: Promise<{ patientId: string }>;
}) {
  const { patientId } = await params;
  const [resumo, atendimento, role, settings, profissional, documentosBruto] =
    await Promise.all([
      getResumo(patientId),
      getAtendimentoAtivo(patientId),
      getRole(),
      getSettings(),
      getProfissionalAtual(),
      listProcedimentoDocs(patientId),
    ]);
  // Registro/finalização de atendimento é do médico (admin como gestor).
  const isMedico = role === "medico" || role === "admin";

  let catalogo: ProcedimentoCatalogo[] = [];
  let procedimentos: ProcedimentoExecutado[] = [];
  if (atendimento && isMedico) {
    const [cat, procs] = await Promise.all([
      listCatalogoProcedimentos(),
      listProcedimentosAtendimento(atendimento.queueEntryId),
    ]);
    catalogo = cat;
    procedimentos = procs.itens;
  }

  const documentos = (documentosBruto as ProcedimentoDocResumo[]).map((d) => ({
    ...d,
    dataLabel: formatarDataHora(d.createdAt),
  }));

  const cabecalho = {
    clinica: {
      nome: settings.clinicName,
      cnpj: settings.cnpj,
      endereco: settings.address,
      telefone: settings.phone,
    },
    paciente: resumo?.identificacao?.nome ?? "—",
    nascimento: resumo?.identificacao?.nascimento ?? "—",
    prontuario: resumo?.identificacao?.registro ?? "—",
    data: formatarData(new Date().toISOString()),
    profissional: profissional?.nome ?? "—",
    conselho: profissional?.conselho ?? "—",
  };

  return (
    <SecaoClinica
      patientId={patientId}
      identificacao={resumo?.identificacao ?? null}
      title="Procedimentos"
      subtitle="Registre os procedimentos realizados e gere o documento do atendimento"
    >
      {atendimento && isMedico ? (
        <AtendimentoAtivoCard
          patientId={patientId}
          queueEntryId={atendimento.queueEntryId}
          statusRaw={atendimento.statusRaw}
          catalogo={catalogo}
          procedimentos={procedimentos}
          documentos={documentos}
          cabecalho={cabecalho}
        />
      ) : documentos.length > 0 ? (
        // Sem atendimento em curso, mas há documentos: permite ver/imprimir/cancelar.
        <AtendimentoAtivoCard
          patientId={patientId}
          queueEntryId=""
          statusRaw="finalizado"
          catalogo={[]}
          procedimentos={[]}
          documentos={documentos}
          cabecalho={cabecalho}
        />
      ) : (
        <Card className="p-10 text-center text-sm text-muted">
          Nenhum atendimento em andamento para este paciente.
        </Card>
      )}
    </SecaoClinica>
  );
}

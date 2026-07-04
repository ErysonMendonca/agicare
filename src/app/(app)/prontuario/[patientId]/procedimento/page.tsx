import { Card } from "@/components/ui/Card";
import { getResumo } from "@/lib/data/prontuario";
import { getRole } from "@/lib/auth";
import {
  getAtendimentoAtivo,
  listCatalogoProcedimentos,
  listProcedimentosAtendimento,
  type ProcedimentoCatalogo,
  type ProcedimentoExecutado,
} from "@/lib/data/atendimento";
import { SecaoClinica } from "../SecaoClinica";
import { AtendimentoAtivoCard } from "../AtendimentoAtivoCard";
import { FinalizarAtendimentoButton } from "../FinalizarAtendimentoButton";

export default async function ProcedimentoPage({
  params,
}: {
  params: Promise<{ patientId: string }>;
}) {
  const { patientId } = await params;
  const [resumo, atendimento, role] = await Promise.all([
    getResumo(patientId),
    getAtendimentoAtivo(patientId),
    getRole(),
  ]);
  // Registro/finalização de atendimento é do médico (admin como gestor).
  const isMedico = role === "medico" || role === "admin";

  let catalogo: ProcedimentoCatalogo[] = [];
  let procedimentos: ProcedimentoExecutado[] = [];
  let totalLabel = "";
  if (atendimento && isMedico) {
    const [cat, procs] = await Promise.all([
      listCatalogoProcedimentos(),
      listProcedimentosAtendimento(atendimento.queueEntryId),
    ]);
    catalogo = cat;
    procedimentos = procs.itens;
    totalLabel = procs.totalLabel;
  }

  return (
    <SecaoClinica
      patientId={patientId}
      identificacao={resumo?.identificacao ?? null}
      title="Procedimentos"
      subtitle="Registre os procedimentos realizados no atendimento"
      actions={
        atendimento && isMedico ? (
          <FinalizarAtendimentoButton
            queueEntryId={atendimento.queueEntryId}
            statusRaw={atendimento.statusRaw}
          />
        ) : undefined
      }
    >
      {atendimento && isMedico ? (
        <AtendimentoAtivoCard
          queueEntryId={atendimento.queueEntryId}
          statusRaw={atendimento.statusRaw}
          catalogo={catalogo}
          procedimentos={procedimentos}
          totalLabel={totalLabel}
        />
      ) : (
        <Card className="p-10 text-center text-sm text-muted">
          Nenhum atendimento em andamento para este paciente.
        </Card>
      )}
    </SecaoClinica>
  );
}

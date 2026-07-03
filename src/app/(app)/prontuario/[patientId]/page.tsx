import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { PageHeader } from "@/components/app/PageHeader";
import { Card } from "@/components/ui/Card";
import { getResumo } from "@/lib/data/prontuario";
import { logAccess } from "@/lib/audit";
import { ResumoView } from "./ResumoView";

export default async function ProntuarioResumoPage({
  params,
}: {
  params: Promise<{ patientId: string }>;
}) {
  const { patientId } = await params;
  const resumo = await getResumo(patientId);

  // Auditoria LGPD: registra o acesso ao prontuário (best-effort; logAccess
  // jamais lança, então não bloqueia a renderização se a trilha falhar).
  if (resumo) {
    await logAccess({
      patientId,
      patientName: resumo.identificacao.nome,
      module: "prontuario",
      action: "view",
    });
  }

  return (
    <>
      <div className="mb-4">
        <Link
          href="/prontuario"
          className="inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:text-brand-700"
        >
          <ChevronLeft className="h-4 w-4" /> Voltar ao prontuário
        </Link>
      </div>

      <PageHeader
        title="Prontuário do Paciente"
        subtitle="Visão 360º do estado clínico do paciente"
      />

      {resumo ? (
        <ResumoView resumo={resumo} />
      ) : (
        <Card className="p-10 text-center text-sm text-muted">
          Paciente não encontrado ou sem permissão de acesso.
        </Card>
      )}
    </>
  );
}

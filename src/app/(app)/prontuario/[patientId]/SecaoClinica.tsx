import { type ReactNode } from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { PageHeader } from "@/components/app/PageHeader";
import { Card } from "@/components/ui/Card";
import { type Identificacao } from "@/lib/data/prontuario";
import { logAccess } from "@/lib/audit";
import { PacienteCard } from "./PacienteCard";
import { ClinicoNav } from "./ClinicoNav";

/** Chrome compartilhado das seções clínicas: voltar + cabeçalho + paciente + nav. */
export async function SecaoClinica({
  patientId,
  identificacao,
  title,
  subtitle,
  children,
}: {
  patientId: string;
  identificacao: Identificacao | null;
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  // Auditoria LGPD: registra o acesso à seção clínica (best-effort, nunca lança).
  if (identificacao) {
    await logAccess({
      patientId,
      patientName: identificacao.nome,
      module: title,
      action: "view",
    });
  }

  return (
    <>
      <div className="mb-4">
        <Link
          href={`/prontuario/${patientId}`}
          className="inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:text-brand-700"
        >
          <ChevronLeft className="h-4 w-4" /> Voltar ao resumo
        </Link>
      </div>

      <PageHeader title={title} subtitle={subtitle} />

      {identificacao ? (
        <>
          <PacienteCard id={identificacao} />
          <ClinicoNav patientId={patientId} />
          {children}
        </>
      ) : (
        <Card className="p-10 text-center text-sm text-muted">
          Paciente não encontrado ou sem permissão de acesso.
        </Card>
      )}
    </>
  );
}

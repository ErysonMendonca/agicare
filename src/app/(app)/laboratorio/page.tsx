import { PageHeader } from "@/components/app/PageHeader";
import {
  listLabCases,
  listLabFinance,
  resumirFinanceiroLab,
} from "@/lib/data/lab";
import { isGestor } from "@/lib/auth";
import { requireView } from "@/lib/permissions";
import { LaboratorioClient } from "./LaboratorioClient";

export default async function LaboratorioPage() {
  await requireView("laboratorio");
  const [casos, finance, gestor] = await Promise.all([
    listLabCases(),
    listLabFinance(),
    isGestor(),
  ]);

  const resumo = resumirFinanceiroLab(finance);

  const total = casos.length;
  const emAndamento = casos.filter((c) => c.status === "em_andamento").length;
  const pendencias = casos.filter((c) => c.status === "pendente").length;
  const finalizados = casos.filter((c) => c.status === "finalizado").length;
  const urgentes = casos.filter((c) => c.urgente).length;

  return (
    <>
      <PageHeader
        title="Laboratório de Prótese"
        subtitle="Gestão completa de trabalhos protéticos"
      />

      <LaboratorioClient
        casos={casos}
        finance={finance}
        resumo={resumo}
        gestor={gestor}
        kpis={{ total, emAndamento, pendencias, finalizados, urgentes }}
      />
    </>
  );
}

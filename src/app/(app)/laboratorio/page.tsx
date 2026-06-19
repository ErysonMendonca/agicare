import {
  FlaskConical,
  Clock,
  AlertTriangle,
  CheckCircle2,
  TrendingUp,
} from "lucide-react";
import { PageHeader } from "@/components/app/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { Stagger, FadeInUp } from "@/components/ui/Motion";
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

  // KPIs com tom semântico por significado (neutral/info/warn/success/danger).
  const kpis = [
    {
      icon: <FlaskConical className="h-5 w-5" />,
      value: String(total),
      label: "Total de Casos",
      tone: "neutral" as const,
    },
    {
      icon: <Clock className="h-5 w-5" />,
      value: String(emAndamento),
      label: "Em Andamento",
      tone: "info" as const,
    },
    {
      icon: <AlertTriangle className="h-5 w-5" />,
      value: String(pendencias),
      label: "Pendências",
      tone: "warn" as const,
    },
    {
      icon: <CheckCircle2 className="h-5 w-5" />,
      value: String(finalizados),
      label: "Finalizados",
      tone: "success" as const,
    },
    {
      icon: <TrendingUp className="h-5 w-5" />,
      value: String(urgentes),
      label: "Urgentes",
      tone: "danger" as const,
    },
  ];

  return (
    <>
      <PageHeader
        title="Laboratório de Prótese"
        subtitle="Gestão completa de trabalhos protéticos"
      />

      <Stagger className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {kpis.map((kpi) => (
          <FadeInUp key={kpi.label}>
            <StatCard
              icon={kpi.icon}
              value={kpi.value}
              label={kpi.label}
              tone={kpi.tone}
            />
          </FadeInUp>
        ))}
      </Stagger>

      <LaboratorioClient
        casos={casos}
        finance={finance}
        resumo={resumo}
        gestor={gestor}
      />
    </>
  );
}

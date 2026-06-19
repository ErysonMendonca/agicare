import {
  Users,
  CalendarDays,
  DollarSign,
  Activity,
  ChevronRight,
  AlertCircle,
  Lock,
} from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/app/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { AreaChart, BarChart } from "@/components/ui/Charts";
import { Stagger, FadeInUp } from "@/components/ui/Motion";
import {
  getDashboardKpis,
  getConsultasRetornos,
  getReceitaMensal,
} from "@/lib/data/dashboard";
import { listAppointments } from "@/lib/data/appointments";
import { listStockProducts } from "@/lib/data/stock";
import { listBillableEvents } from "@/lib/data/billing";
import { isGestor } from "@/lib/auth";

type AlertaTone = "danger" | "warn" | "info";

export default async function DashboardPage() {
  const gestor = await isGestor();
  const [kpis, serie, receita, atendimentos, estoque, faturas] =
    await Promise.all([
      getDashboardKpis(),
      getConsultasRetornos(),
      // Receita real só é carregada quando o usuário é gestor (dado financeiro).
      gestor
        ? getReceitaMensal()
        : Promise.resolve({ labels: [] as string[], valores: [] as number[] }),
      listAppointments(),
      listStockProducts(),
      listBillableEvents(),
    ]);

  // Receita em milhares (R$ mil) para o gráfico de barras.
  const receitaMil = receita.valores.map((v) => Math.round(v / 1000));

  const proximas = atendimentos.slice(0, 4);

  // Central de Alertas em 3 níveis (vermelho/laranja/azul).
  const alertas: { tone: AlertaTone; text: string }[] = [
    ...estoque
      .filter((p) => p.status.label !== "Adequado")
      .map((p) => ({
        tone: "danger" as const,
        text: `Estoque baixo: ${p.produto} (${p.saldo} ${p.unidade})`,
      })),
    // Pendências financeiras: só para gestor.
    ...(gestor
      ? faturas
          .filter((f) => f.status.label === "Pendente")
          .map((f) => ({
            tone: "warn" as const,
            text: `Fatura pendente: ${f.codigo} — ${f.valor}`,
          }))
      : []),
    ...atendimentos
      .filter((a) => a.status === "agendado")
      .map((a) => ({
        tone: "info" as const,
        text: `Aguardando confirmação: ${a.paciente} (${a.hora})`,
      })),
  ];

  const alertaCor: Record<AlertaTone, string> = {
    danger: "text-status-danger",
    warn: "text-status-warn",
    info: "text-status-wait",
  };

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle="Visão geral dos indicadores e métricas da clínica"
      />

      <Stagger className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <FadeInUp>
          <StatCard
            icon={<Users className="h-5 w-5" />}
            value={kpis.pacientesAtivos}
            label="Pacientes Ativos"
            change={kpis.changes.pacientesAtivos}
            tone="success"
            series={kpis.series?.pacientesAtivos}
          />
        </FadeInUp>
        <FadeInUp>
          <StatCard
            icon={<CalendarDays className="h-5 w-5" />}
            value={kpis.consultasHoje}
            label="Consultas Hoje"
            change={kpis.changes.consultasHoje}
            tone="info"
            series={kpis.series?.consultasHoje}
          />
        </FadeInUp>
        <FadeInUp>
          {gestor ? (
            <StatCard
              icon={<DollarSign className="h-5 w-5" />}
              value={kpis.receitaMensal}
              label="Receita Mensal"
              change={kpis.changes.receitaMensal}
              tone="success"
              series={kpis.series?.receitaMensal}
            />
          ) : (
            <Card className="flex h-full flex-col justify-center p-5">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-muted-surface text-muted">
                <Lock className="h-5 w-5" />
              </span>
              <div className="mt-4 text-sm font-medium text-ink">
                Receita Mensal
              </div>
              <div className="mt-1 text-xs text-muted">Restrito ao gestor</div>
            </Card>
          )}
        </FadeInUp>
        <FadeInUp>
          <StatCard
            icon={<Activity className="h-5 w-5" />}
            value={kpis.taxaOcupacao}
            label="Taxa de Ocupação"
            change={kpis.changes.taxaOcupacao}
            tone="neutral"
            series={kpis.series?.taxaOcupacao}
          />
        </FadeInUp>
      </Stagger>

      <Stagger className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <FadeInUp className="lg:col-span-2">
          <Card className="min-w-0 p-5">
            <div className="mb-4 flex items-start justify-between">
              <div>
                <h3 className="font-semibold text-ink">Atendimentos Mensais</h3>
                <p className="text-sm text-muted">
                  Consultas e retornos nos últimos 6 meses
                </p>
              </div>
              <Link
                href="/relatorios"
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-brand-500 bg-white px-3 text-xs font-medium text-brand-600 transition-colors hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-1"
              >
                Ver detalhes <ChevronRight className="h-4 w-4" />
              </Link>
            </div>
            <AreaChart
              labels={serie.labels}
              series={[
                {
                  name: "Consultas",
                  color: "#0db8c2",
                  values: serie.consultas,
                },
                { name: "Retornos", color: "#7fdfe4", values: serie.retornos },
              ]}
            />
            <div className="mt-2 flex items-center gap-4 text-xs text-muted">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-brand-500" /> Consultas
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-brand-200" /> Retornos
              </span>
            </div>
          </Card>
        </FadeInUp>

        <FadeInUp>
          <Card className="flex min-w-0 flex-col p-5">
            <div className="mb-4">
              <h3 className="font-semibold text-ink">Receita</h3>
              <p className="text-sm text-muted">Últimos 6 meses (mil R$)</p>
            </div>
            {gestor ? (
              <BarChart labels={receita.labels} series={receitaMil} />
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center gap-2 py-10 text-center">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-muted-surface text-muted">
                  <Lock className="h-5 w-5" />
                </span>
                <p className="text-sm font-medium text-ink">Restrito ao gestor</p>
                <p className="text-xs text-muted">
                  Dados financeiros visíveis apenas para o gestor.
                </p>
              </div>
            )}
          </Card>
        </FadeInUp>
      </Stagger>

      <Stagger className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <FadeInUp className="lg:col-span-2">
          <Card className="min-w-0 p-5">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-semibold text-ink">Próximas Consultas</h3>
              <Link
                href="/agenda"
                className="text-sm font-medium text-brand-600 hover:text-brand-700"
              >
                Ver agenda completa
              </Link>
            </div>
            <ul className="divide-y divide-line">
              {proximas.length === 0 && (
                <li className="py-6 text-center text-sm text-muted">
                  Nenhuma consulta agendada.
                </li>
              )}
              {proximas.map((a) => (
                <li
                  key={a.id}
                  className="flex items-center justify-between gap-3 py-3"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-50 text-sm font-semibold text-brand-600">
                      {a.paciente.charAt(0)}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-ink">
                        {a.paciente}
                      </p>
                      <p className="truncate text-xs text-muted">
                        {a.profissional} · {a.especialidade}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className="text-xs font-medium text-muted">
                      {a.hora}
                    </span>
                    <Badge status={a.badge}>{a.statusLabel}</Badge>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        </FadeInUp>

        <FadeInUp>
          <Card className="min-w-0 p-5">
            <h3 className="mb-4 font-semibold text-ink">Alertas</h3>
            <ul className="space-y-3">
              {alertas.length === 0 && (
                <li className="py-6 text-center text-sm text-muted">
                  Nenhum alerta no momento.
                </li>
              )}
              {alertas.map((a, i) => (
                <li key={i} className="flex items-start gap-3">
                  <AlertCircle
                    className={`mt-0.5 h-5 w-5 shrink-0 ${alertaCor[a.tone]}`}
                  />
                  <p className="text-sm text-ink">{a.text}</p>
                </li>
              ))}
            </ul>
          </Card>
        </FadeInUp>
      </Stagger>
    </>
  );
}

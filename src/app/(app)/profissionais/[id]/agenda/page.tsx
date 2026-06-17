import { notFound } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  CalendarDays,
  Clock,
  CheckCircle2,
  Activity,
  CheckCheck,
  CalendarClock,
  User,
  Plus,
} from "lucide-react";
import { PageHeader } from "@/components/app/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Stagger, FadeInUp } from "@/components/ui/Motion";
import {
  listAppointments,
  countByStatus,
  type Atendimento,
} from "@/lib/data/appointments";
import { listProfessionals } from "@/lib/data/professionals";
import { requireView } from "@/lib/permissions";

/**
 * Agenda do profissional (escopo 11.1 — ação "Ver Agenda" do card).
 *
 * Reusa o data layer existente: `listAppointments()` (RLS escopa à clínica
 * ativa e ao papel) e filtra pelo profissional desta rota. Visual no padrão
 * das demais telas (PageHeader + StatCards + Cards de lista). Sem novo fetch
 * dedicado — handoff: se a Agenda ganhar um filtro server-side por profissional,
 * trocar o filtro em memória por query parametrizada.
 */
export default async function AgendaProfissionalPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireView("profissionais");
  const { id } = await params;

  // RLS escopa à clínica ativa; id de outra clínica simplesmente não aparece.
  const profissional = (await listProfessionals()).find((p) => p.id === id);
  if (!profissional) notFound();

  // Reusa a leitura de atendimentos e filtra por este profissional.
  const atendimentos = (await listAppointments()).filter(
    (a) => a.profissionalId === id,
  );
  const kpis = countByStatus(atendimentos);

  // Agrupa por data (ISO) preservando a ordem ascendente já vinda do data layer.
  const porData = new Map<string, Atendimento[]>();
  for (const a of atendimentos) {
    const chave = a.dataISO || a.data;
    const lista = porData.get(chave) ?? [];
    lista.push(a);
    porData.set(chave, lista);
  }
  const grupos = Array.from(porData.entries());

  return (
    <>
      <PageHeader
        title={`Agenda — ${profissional.nome}`}
        subtitle={`${profissional.especialidade} · ${profissional.crm}`}
        actions={
          <div className="flex items-center gap-2">
            <Link
              href={`/agenda?profissional=${profissional.id}`}
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-brand-500 bg-white px-4 text-sm font-medium text-brand-600 transition-colors hover:bg-brand-50"
            >
              <Plus className="h-4 w-4" /> Novo agendamento
            </Link>
            <Link
              href="/profissionais"
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-line bg-white px-4 text-sm font-medium text-ink transition-colors hover:bg-black/5"
            >
              <ArrowLeft className="h-4 w-4" /> Voltar
            </Link>
          </div>
        }
      />

      <Stagger className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <FadeInUp>
          <StatCard
            icon={<CalendarDays className="h-5 w-5" />}
            value={kpis.total}
            label="Total de Agendamentos"
            tone="brand"
          />
        </FadeInUp>
        <FadeInUp>
          <StatCard
            icon={<Clock className="h-5 w-5" />}
            value={kpis.agendados}
            label="Agendados"
            tone="blue"
          />
        </FadeInUp>
        <FadeInUp>
          <StatCard
            icon={<CheckCircle2 className="h-5 w-5" />}
            value={kpis.confirmados}
            label="Confirmados"
            tone="green"
          />
        </FadeInUp>
        <FadeInUp>
          <StatCard
            icon={<Activity className="h-5 w-5" />}
            value={kpis.emAtendimento}
            label="Em Atendimento"
            tone="orange"
          />
        </FadeInUp>
        <FadeInUp>
          <StatCard
            icon={<CheckCheck className="h-5 w-5" />}
            value={kpis.finalizados}
            label="Finalizados"
            tone="purple"
          />
        </FadeInUp>
      </Stagger>

      {atendimentos.length === 0 ? (
        <Stagger className="mt-4">
          <FadeInUp>
            <Card className="flex flex-col items-center justify-center px-5 py-16 text-center">
              <span className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-full bg-muted-surface text-muted">
                <CalendarClock className="h-7 w-7" />
              </span>
              <p className="font-medium text-ink">
                Nenhum agendamento para este profissional
              </p>
              <p className="mt-1 max-w-md text-sm text-muted">
                Quando houver consultas marcadas, elas aparecerão aqui em ordem
                cronológica.
              </p>
            </Card>
          </FadeInUp>
        </Stagger>
      ) : (
        <div className="mt-4 flex flex-col gap-6">
          {grupos.map(([chave, itens]) => (
            <Stagger key={chave}>
              <FadeInUp>
                <Card className="overflow-hidden">
                  <div className="flex items-center gap-2 border-b border-line bg-canvas/40 px-5 py-3">
                    <CalendarDays className="h-4 w-4 text-brand-600" />
                    <h3 className="text-sm font-semibold text-ink">
                      {itens[0]?.data ?? chave}
                    </h3>
                    <span className="text-xs text-muted">
                      · {itens.length}{" "}
                      {itens.length === 1 ? "agendamento" : "agendamentos"}
                    </span>
                  </div>
                  <div>
                    {itens.map((a) => (
                      <div
                        key={a.id}
                        className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4 last:border-0"
                      >
                        <div className="flex items-center gap-4">
                          <div className="flex w-16 flex-none flex-col items-center justify-center rounded-lg bg-brand-50 py-2 text-brand-600">
                            <Clock className="h-4 w-4" />
                            <span className="mt-0.5 text-sm font-semibold">
                              {a.hora}
                            </span>
                          </div>
                          <div>
                            <p className="flex items-center gap-1.5 font-medium text-ink">
                              <User className="h-4 w-4 text-muted" />
                              {a.paciente}
                            </p>
                            <p className="mt-0.5 text-sm text-muted">
                              {a.motivo}
                            </p>
                          </div>
                        </div>
                        <Badge status={a.badge}>{a.statusLabel}</Badge>
                      </div>
                    ))}
                  </div>
                </Card>
              </FadeInUp>
            </Stagger>
          ))}
        </div>
      )}
    </>
  );
}

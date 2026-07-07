"use client";

import { useMemo, useState } from "react";
import {
  Search,
  User,
  Stethoscope,
  CalendarDays,
  DollarSign,
  ClipboardCheck,
  Receipt,
  ShieldCheck,
  Lock,
  Layers,
  Clock,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { StatCard } from "@/components/ui/StatCard";
import { Stagger, FadeInUp } from "@/components/ui/Motion";
import { cn } from "@/lib/utils";
import {
  type Evento,
  type Convenio,
  type GuiaTISS,
  type LoteTISS,
} from "@/lib/data/billing";
import { ConferenciaModal } from "./ConferenciaModal";
import { TissPanel } from "./TissPanel";

type Aba = "eventos" | "tiss";

const tipoFiltros: Convenio[] = ["Convênio", "Particular"];
const statusFiltros = ["Pendentes", "Faturados", "Glosados"] as const;

type StatusFiltro = (typeof statusFiltros)[number];

/** Rótulo plural do filtro → rótulo singular do status do evento. */
const statusFiltroParaLabel: Record<StatusFiltro, string> = {
  Pendentes: "Pendente",
  Faturados: "Faturado",
  Glosados: "Glosado",
};

export function FaturamentoClient({
  eventos,
  guias,
  lotes,
  gestor,
  procedimentos,
  kpis,
  valorTotalLabel,
}: {
  eventos: Evento[];
  guias: GuiaTISS[];
  lotes: LoteTISS[];
  gestor: boolean;
  procedimentos: any[];
  kpis: { total: number; pendentes: number; faturados: number; glosados: number };
  valorTotalLabel: string;
}) {
  const [aba, setAba] = useState<Aba>("eventos");
  const [selected, setSelected] = useState<Evento | null>(null);

  // Filtros client-side: operam sobre os eventos já carregados via props.
  const [busca, setBusca] = useState("");
  const [tipoFiltro, setTipoFiltro] = useState<Convenio | null>(null);
  const [statusFiltro, setStatusFiltro] = useState<StatusFiltro | null>(null);

  const eventosFiltrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return eventos.filter((evt) => {
      if (tipoFiltro && evt.tipo !== tipoFiltro) return false;
      if (statusFiltro && evt.status.label !== statusFiltroParaLabel[statusFiltro]) {
        return false;
      }
      if (
        termo &&
        !`${evt.paciente} ${evt.codigo} ${evt.profissional}`
          .toLowerCase()
          .includes(termo)
      ) {
        return false;
      }
      return true;
    });
  }, [eventos, busca, tipoFiltro, statusFiltro]);

  /** Toggle do filtro de status via KPI (clicar no ativo limpa). */
  const toggleStatus = (f: StatusFiltro) =>
    setStatusFiltro((prev) => (prev === f ? null : f));

  return (
    <>
      {/* KPIs clicáveis → filtram a lista de eventos pelo status. */}
      <Stagger className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <FadeInUp>
          <StatCard
            icon={<Layers className="h-5 w-5" />}
            value={kpis.total}
            label="Total de Eventos"
            tone="neutral"
            onClick={() => setStatusFiltro(null)}
            active={statusFiltro === null}
          />
        </FadeInUp>
        <FadeInUp>
          <StatCard
            icon={<Clock className="h-5 w-5" />}
            value={kpis.pendentes}
            label="Pendentes"
            tone="warn"
            onClick={() => toggleStatus("Pendentes")}
            active={statusFiltro === "Pendentes"}
          />
        </FadeInUp>
        <FadeInUp>
          <StatCard
            icon={<CheckCircle2 className="h-5 w-5" />}
            value={kpis.faturados}
            label="Faturados"
            tone="success"
            onClick={() => toggleStatus("Faturados")}
            active={statusFiltro === "Faturados"}
          />
        </FadeInUp>
        <FadeInUp>
          <StatCard
            icon={<XCircle className="h-5 w-5" />}
            value={kpis.glosados}
            label="Glosados"
            tone="danger"
            onClick={() => toggleStatus("Glosados")}
            active={statusFiltro === "Glosados"}
          />
        </FadeInUp>
        <FadeInUp>
          {gestor ? (
            <StatCard
              icon={<DollarSign className="h-5 w-5" />}
              value={valorTotalLabel}
              label="Valor Total"
              tone="success"
            />
          ) : (
            <Card className="flex flex-col justify-center p-5">
              <div className="flex items-center gap-2 text-sm text-muted">
                <Lock className="h-4 w-4" /> Valor Total
              </div>
              <div className="mt-3 text-base font-medium text-muted">
                Restrito ao gestor
              </div>
            </Card>
          )}
        </FadeInUp>
      </Stagger>

      {/* Abas */}
      <div className="mt-6 inline-flex rounded-xl border border-line bg-surface p-1">
        <button
          type="button"
          onClick={() => setAba("eventos")}
          className={cn(
            "inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors",
            aba === "eventos"
              ? "bg-brand-50 text-brand-700"
              : "text-muted hover:text-ink",
          )}
        >
          <Receipt className="h-4 w-4" /> Eventos & Check-out
        </button>
        <button
          type="button"
          onClick={() => setAba("tiss")}
          className={cn(
            "inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors",
            aba === "tiss"
              ? "bg-brand-50 text-brand-700"
              : "text-muted hover:text-ink",
          )}
        >
          <ShieldCheck className="h-4 w-4" /> Convênios TISS
        </button>
      </div>

      {aba === "eventos" ? (
        <>
          <Card className="mt-4 p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                <Input
                  type="search"
                  placeholder="Buscar por paciente, código ou profissional..."
                  className="pl-9"
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1.5">
                  <Button
                    size="sm"
                    variant={tipoFiltro === null ? "primary" : "ghost"}
                    aria-pressed={tipoFiltro === null}
                    onClick={() => setTipoFiltro(null)}
                  >
                    Todos
                  </Button>
                  {tipoFiltros.map((f) => (
                    <Button
                      key={f}
                      size="sm"
                      variant={tipoFiltro === f ? "primary" : "ghost"}
                      aria-pressed={tipoFiltro === f}
                      onClick={() =>
                        setTipoFiltro((prev) => (prev === f ? null : f))
                      }
                    >
                      {f}
                    </Button>
                  ))}
                </div>
                <span className="hidden h-6 w-px bg-line lg:block" />
                <div className="flex items-center gap-1.5">
                  <Button
                    size="sm"
                    variant={statusFiltro === null ? "primary" : "ghost"}
                    aria-pressed={statusFiltro === null}
                    onClick={() => setStatusFiltro(null)}
                  >
                    Todos
                  </Button>
                  {statusFiltros.map((f) => (
                    <Button
                      key={f}
                      size="sm"
                      variant={statusFiltro === f ? "primary" : "ghost"}
                      aria-pressed={statusFiltro === f}
                      onClick={() =>
                        setStatusFiltro((prev) => (prev === f ? null : f))
                      }
                    >
                      {f}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          </Card>

          {eventosFiltrados.length > 0 ? (
            <Stagger className="mt-4 flex flex-col gap-3">
              {eventosFiltrados.map((evt) => (
                <FadeInUp key={evt.codigo}>
                  <Card className="p-5">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-sm font-semibold text-ink">
                            {evt.codigo}
                          </span>
                          <Badge status={evt.status.tone}>
                            {evt.status.label}
                          </Badge>
                          <span className="inline-flex items-center rounded-full bg-canvas px-2.5 py-0.5 text-xs font-medium uppercase tracking-wide text-muted">
                            {evt.tipo}
                          </span>
                        </div>

                        <div className="mt-3 flex flex-wrap gap-x-8 gap-y-2 text-sm">
                          <div>
                            <div className="flex items-center gap-1.5 text-xs text-muted">
                              <User className="h-3.5 w-3.5" /> Paciente
                            </div>
                            <div className="mt-0.5 font-medium text-ink">
                              {evt.paciente}
                            </div>
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5 text-xs text-muted">
                              <Stethoscope className="h-3.5 w-3.5" /> Profissional
                            </div>
                            <div className="mt-0.5 font-medium text-ink">
                              {evt.profissional}
                            </div>
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5 text-xs text-muted">
                              <CalendarDays className="h-3.5 w-3.5" /> Data
                            </div>
                            <div className="mt-0.5 font-medium text-ink">
                              {evt.data}
                            </div>
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5 text-xs text-muted">
                              <DollarSign className="h-3.5 w-3.5" /> Valor Estimado
                            </div>
                            <div className="mt-0.5 font-semibold text-brand-600">
                              {gestor ? evt.valor : "—"}
                            </div>
                          </div>
                        </div>

                        <div className="mt-3 text-sm text-muted">
                          Serviço:{" "}
                          <span className="text-ink">{evt.servico}</span>
                        </div>
                      </div>

                      {evt.faturavel && (
                        <Button
                          className="flex-none lg:self-start"
                          onClick={() => setSelected(evt)}
                        >
                          <ClipboardCheck className="h-4 w-4" /> Conferir Check-out
                        </Button>
                      )}
                    </div>
                  </Card>
                </FadeInUp>
              ))}
            </Stagger>
          ) : (
            <Card className="mt-4 p-12 text-center text-sm text-muted">
              {eventos.length > 0
                ? "Nenhum evento corresponde aos filtros selecionados."
                : "Nenhum evento faturável no momento."}
            </Card>
          )}
        </>
      ) : (
        <div className="mt-4">
          <TissPanel guias={guias} lotes={lotes} gestor={gestor} />
        </div>
      )}

      {selected && (
        <ConferenciaModal
          evento={selected}
          gestor={gestor}
          procedimentos={procedimentos}
          open={!!selected}
          onClose={() => setSelected(null)}
        />
      )}
    </>
  );
}

"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  FlaskConical,
  AlertTriangle,
  Search,
  SlidersHorizontal,
  DollarSign,
  LayoutGrid,
  List,
  Package,
  CalendarClock,
  Download,
  ArrowDownRight,
  PackageCheck,
  Wrench,
  Sparkles,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Badge, type Status } from "@/components/ui/Badge";
import { Stagger, FadeInUp } from "@/components/ui/Motion";
import { cn } from "@/lib/utils";
import {
  type CasoLab,
  type LabStatus,
  type LabEtapa,
  type LabFinanceRow,
  type LabFinanceResumo,
  type LabPaymentStatus,
} from "@/lib/data/lab";
import { moverEtapaLab } from "./actions";

/** Normaliza um tipo de trabalho para slug (remove acentos, minúsculas). */
function slugTipo(tipo: string): string {
  return tipo
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-");
}

/** Formata em moeda R$ pt-BR (client-safe, sem dependência de servidor). */
function formatLabBRL(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

const statusMap: Record<LabStatus, { tone: Status; label: string }> = {
  em_andamento: { tone: "active", label: "Em Andamento" },
  pendente: { tone: "warn", label: "Pendência" },
  finalizado: { tone: "ok", label: "Finalizado" },
};

const etapas: {
  id: LabEtapa;
  label: string;
  icon: typeof PackageCheck;
  accent: string;
}[] = [
  { id: "entrada", label: "Entrada", icon: PackageCheck, accent: "text-blue-600" },
  {
    id: "processamento",
    label: "Processamento",
    icon: Wrench,
    accent: "text-orange-500",
  },
  {
    id: "refinamento",
    label: "Refinamento",
    icon: Sparkles,
    accent: "text-purple-600",
  },
  {
    id: "conclusao",
    label: "Conclusão",
    icon: CheckCircle2,
    accent: "text-green-600",
  },
];

const pagamentoMap: Record<LabPaymentStatus, { tone: Status; label: string }> = {
  orcado: { tone: "wait", label: "Orçado" },
  aprovado: { tone: "active", label: "Aprovado" },
  faturado: { tone: "warn", label: "Faturado" },
  pago: { tone: "ok", label: "Pago" },
};

function CasoCard({
  caso,
  onMover,
  movendo = false,
  disabledMover = false,
}: {
  caso: CasoLab;
  /** Quando informado, exibe os controles de transição de etapa (Kanban). */
  onMover?: (etapa: LabEtapa) => void;
  movendo?: boolean;
  disabledMover?: boolean;
}) {
  const meta = statusMap[caso.status];
  const idxEtapa = etapas.findIndex((e) => e.id === caso.etapa);
  const anterior = idxEtapa > 0 ? etapas[idxEtapa - 1] : null;
  const proxima = idxEtapa < etapas.length - 1 ? etapas[idxEtapa + 1] : null;
  return (
    <Card interactive className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-xs font-medium text-muted">
            {caso.codigo}
          </p>
          <h3 className="mt-1 truncate text-base font-semibold text-ink">
            {caso.paciente}
          </h3>
        </div>
        {caso.urgente && (
          <Badge status="danger">
            <AlertTriangle className="h-3 w-3" /> Urgente
          </Badge>
        )}
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        <span className="inline-flex items-center gap-1.5 text-sm text-muted">
          <FlaskConical className="h-4 w-4" /> {caso.tipo}
        </span>
        <Badge status={meta.tone}>{meta.label}</Badge>
      </div>

      <div className="mt-3 flex items-center gap-1.5 border-t border-line pt-3 text-sm text-muted">
        <CalendarClock className="h-4 w-4" /> Prazo: {caso.prazo}
      </div>

      {onMover && (
        <div className="mt-3 flex items-center justify-between gap-2 border-t border-line pt-3">
          <Button
            variant="ghost"
            size="sm"
            disabled={!anterior || movendo || disabledMover}
            onClick={() => anterior && onMover(anterior.id)}
            aria-label={
              anterior ? `Mover para ${anterior.label}` : "Primeira etapa"
            }
          >
            <ChevronLeft className="h-4 w-4" />
            {anterior ? anterior.label : "Início"}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={!proxima || movendo || disabledMover}
            onClick={() => proxima && onMover(proxima.id)}
            aria-label={proxima ? `Mover para ${proxima.label}` : "Última etapa"}
          >
            {proxima ? proxima.label : "Concluído"}
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </Card>
  );
}

/** Gera e baixa um CSV do financeiro do laboratório (client-side). */
function exportarCSV(rows: LabFinanceRow[]) {
  const header = [
    "Código",
    "Paciente",
    "Tipo",
    "Valor Base",
    "Adicionais",
    "Descontos",
    "Total",
    "Status",
  ];
  const linhas = rows.map((r) =>
    [
      r.codigo,
      r.paciente,
      r.tipo,
      r.valorBase.toFixed(2),
      r.adicionais.toFixed(2),
      r.descontos.toFixed(2),
      r.total.toFixed(2),
      pagamentoMap[r.statusPagamento].label,
    ].join(";"),
  );
  // ﻿ (BOM) garante acentuação correta ao abrir o CSV no Excel.
  const csv = `﻿${[header.join(";"), ...linhas].join("\n")}`;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "financeiro-laboratorio.csv";
  a.click();
  URL.revokeObjectURL(url);
}

export function LaboratorioClient({
  casos,
  finance,
  resumo,
  gestor,
}: {
  casos: CasoLab[];
  finance: LabFinanceRow[];
  resumo: LabFinanceResumo;
  gestor: boolean;
}) {
  const [view, setView] = useState<"lista" | "kanban">("lista");
  const [financeiroAberto, setFinanceiroAberto] = useState(false);

  // Filtros funcionais — operam client-side sobre os casos carregados via props.
  const [busca, setBusca] = useState("");
  const [statusFiltro, setStatusFiltro] = useState("todos-status");
  const [tipoFiltro, setTipoFiltro] = useState("todos-tipos");
  const [dataInicial, setDataInicial] = useState("");
  const [dataFinal, setDataFinal] = useState("");

  // Transição de etapa no Kanban (grava a etapa via action).
  const [movendoId, setMovendoId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const casosFiltrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return casos.filter((c) => {
      if (
        termo &&
        !`${c.codigo} ${c.paciente} ${c.tipo}`.toLowerCase().includes(termo)
      ) {
        return false;
      }
      if (statusFiltro !== "todos-status") {
        if (statusFiltro === "urgente") {
          if (!c.urgente) return false;
        } else if (statusFiltro === "em-andamento") {
          if (c.status !== "em_andamento") return false;
        } else if (statusFiltro === "pendencia") {
          if (c.status !== "pendente") return false;
        } else if (statusFiltro === "finalizado") {
          if (c.status !== "finalizado") return false;
        }
      }
      if (tipoFiltro !== "todos-tipos" && slugTipo(c.tipo) !== tipoFiltro) {
        return false;
      }
      // Intervalo de prazo (datas ISO comparam como string lexicográfica).
      if ((dataInicial || dataFinal) && !c.prazoIso) return false;
      if (dataInicial && c.prazoIso && c.prazoIso < dataInicial) return false;
      if (dataFinal && c.prazoIso && c.prazoIso > dataFinal) return false;
      return true;
    });
  }, [casos, busca, statusFiltro, tipoFiltro, dataInicial, dataFinal]);

  const filtrosAtivos =
    busca.trim() !== "" ||
    statusFiltro !== "todos-status" ||
    tipoFiltro !== "todos-tipos" ||
    dataInicial !== "" ||
    dataFinal !== "";

  function handleMover(id: string, etapa: LabEtapa) {
    setMovendoId(id);
    startTransition(async () => {
      const res = await moverEtapaLab(id, etapa);
      setMovendoId(null);
      if (res?.ok) {
        toast.success("Etapa atualizada.");
        router.refresh();
      } else {
        toast.error(res?.error ?? "Não foi possível mover o caso.");
      }
    });
  }

  const kpisFinance = [
    { label: "Orçado", value: resumo.orcado, cls: "text-blue-600" },
    { label: "Aprovado", value: resumo.aprovado, cls: "text-brand-600" },
    { label: "Faturado", value: resumo.faturado, cls: "text-orange-500" },
    { label: "Pago", value: resumo.pago, cls: "text-green-600" },
    { label: "Total", value: resumo.total, cls: "text-purple-600" },
  ];

  return (
    <>
      {/* Filtros + toggle de visualização */}
      <Card className="mt-6 p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <Input
              placeholder="Buscar por código, paciente, tipo..."
              className="pl-9"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2">
            <div className="inline-flex items-center rounded-lg border border-line p-0.5">
              <button
                type="button"
                onClick={() => setView("lista")}
                className={cn(
                  "inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors",
                  view === "lista"
                    ? "bg-brand-50 text-brand-600"
                    : "text-muted hover:bg-black/5",
                )}
                aria-label="Visualizar em lista"
                aria-pressed={view === "lista"}
              >
                <List className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setView("kanban")}
                className={cn(
                  "inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors",
                  view === "kanban"
                    ? "bg-brand-50 text-brand-600"
                    : "text-muted hover:bg-black/5",
                )}
                aria-label="Visualizar em Kanban"
                aria-pressed={view === "kanban"}
              >
                <LayoutGrid className="h-4 w-4" />
              </button>
            </div>
            {gestor && (
              <Button
                variant={financeiroAberto ? "primary" : "outline"}
                size="sm"
                onClick={() => setFinanceiroAberto((v) => !v)}
              >
                <DollarSign className="h-4 w-4" /> Financeiro
              </Button>
            )}
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <span className="flex items-center gap-1.5 text-sm font-medium text-muted">
            <SlidersHorizontal className="h-4 w-4" /> Filtros:
          </span>
          <Select
            className="sm:w-48"
            value={statusFiltro}
            onChange={(e) => setStatusFiltro(e.target.value)}
            aria-label="Filtrar por status"
          >
            <option value="todos-status">Todos os Status</option>
            <option value="em-andamento">Em Andamento</option>
            <option value="pendencia">Pendência</option>
            <option value="finalizado">Finalizado</option>
            <option value="urgente">Urgente</option>
          </Select>
          <Select
            className="sm:w-40"
            value={tipoFiltro}
            onChange={(e) => setTipoFiltro(e.target.value)}
            aria-label="Filtrar por tipo"
          >
            <option value="todos-tipos">Todos</option>
            <option value="coroa">Coroa</option>
            <option value="ponte">Ponte</option>
            <option value="protese-total">Prótese Total</option>
            <option value="protese-parcial">Prótese Parcial</option>
            <option value="implante">Implante</option>
          </Select>
          <Input
            type="date"
            className="sm:w-44"
            aria-label="Data inicial"
            value={dataInicial}
            onChange={(e) => setDataInicial(e.target.value)}
          />
          <span className="text-sm text-muted">até</span>
          <Input
            type="date"
            className="sm:w-44"
            aria-label="Data final"
            value={dataFinal}
            onChange={(e) => setDataFinal(e.target.value)}
          />
        </div>
      </Card>

      {/* Módulo Financeiro (gestor-only) */}
      {gestor && financeiroAberto && (
        <Card className="mt-6 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-brand-600" />
              <h3 className="text-base font-semibold text-ink">
                Financeiro do Laboratório
              </h3>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => exportarCSV(finance)}
            >
              <Download className="h-4 w-4" /> Exportar
            </Button>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
            {kpisFinance.map((k) => (
              <div key={k.label} className="rounded-xl border border-line p-4">
                <div className="text-xs text-muted">{k.label}</div>
                <div className={cn("mt-1 text-lg font-bold", k.cls)}>
                  {formatLabBRL(k.value)}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 overflow-x-auto rounded-xl border border-line">
            <table className="w-full text-sm">
              <thead className="bg-muted-surface text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Caso</th>
                  <th className="px-3 py-2 text-left font-medium">Paciente</th>
                  <th className="px-3 py-2 text-right font-medium">Base</th>
                  <th className="px-3 py-2 text-right font-medium">Adicionais</th>
                  <th className="px-3 py-2 text-right font-medium">Descontos</th>
                  <th className="px-3 py-2 text-right font-medium">Total</th>
                  <th className="px-3 py-2 text-left font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {finance.map((r) => {
                  const meta = pagamentoMap[r.statusPagamento];
                  return (
                    <tr key={r.id}>
                      <td className="px-3 py-2 font-mono text-xs text-muted">
                        {r.codigo}
                      </td>
                      <td className="px-3 py-2 text-ink">{r.paciente}</td>
                      <td className="px-3 py-2 text-right text-ink">
                        {formatLabBRL(r.valorBase)}
                      </td>
                      <td className="px-3 py-2 text-right text-green-600">
                        {r.adicionais > 0 ? formatLabBRL(r.adicionais) : "—"}
                      </td>
                      <td className="px-3 py-2 text-right text-red-500">
                        {r.descontos > 0 ? (
                          <span className="inline-flex items-center gap-1">
                            <ArrowDownRight className="h-3.5 w-3.5" />
                            {formatLabBRL(r.descontos)}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-3 py-2 text-right font-semibold text-brand-600">
                        {formatLabBRL(r.total)}
                      </td>
                      <td className="px-3 py-2">
                        <Badge status={meta.tone}>{meta.label}</Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Conteúdo: Lista ou Kanban */}
      {casosFiltrados.length === 0 ? (
        <Card className="mt-6">
          <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
            <span className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-canvas text-muted">
              <Package className="h-8 w-8" />
            </span>
            <h3 className="mt-4 text-base font-semibold text-ink">
              {filtrosAtivos
                ? "Nenhum caso corresponde aos filtros"
                : "Nenhum caso cadastrado"}
            </h3>
            <p className="mt-1 text-sm text-muted">
              {filtrosAtivos
                ? "Ajuste os filtros para ver outros casos."
                : 'Clique em "Novo Caso" para criar uma solicitação de trabalho protético'}
            </p>
          </div>
        </Card>
      ) : view === "lista" ? (
        <Stagger className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {casosFiltrados.map((caso) => (
            <FadeInUp key={caso.id}>
              <CasoCard caso={caso} />
            </FadeInUp>
          ))}
        </Stagger>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {etapas.map((etapa) => {
            const doStage = casosFiltrados.filter((c) => c.etapa === etapa.id);
            const Icon = etapa.icon;
            return (
              <div
                key={etapa.id}
                className="flex flex-col gap-3 rounded-2xl bg-muted-surface p-3"
              >
                <div className="flex items-center justify-between px-1">
                  <span className="flex items-center gap-1.5 text-sm font-semibold text-ink">
                    <Icon className={cn("h-4 w-4", etapa.accent)} />
                    {etapa.label}
                  </span>
                  <span className="rounded-full bg-surface px-2 py-0.5 text-xs font-medium text-muted">
                    {doStage.length}
                  </span>
                </div>
                <div className="flex flex-col gap-3">
                  {doStage.length > 0 ? (
                    doStage.map((caso) => (
                      <CasoCard
                        key={caso.id}
                        caso={caso}
                        movendo={movendoId === caso.id}
                        disabledMover={pending}
                        onMover={(novaEtapa) => handleMover(caso.id, novaEtapa)}
                      />
                    ))
                  ) : (
                    <div className="rounded-xl border border-dashed border-line px-3 py-8 text-center text-xs text-muted">
                      Sem casos
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

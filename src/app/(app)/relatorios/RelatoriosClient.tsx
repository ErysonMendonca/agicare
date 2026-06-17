"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Download,
  AlertTriangle,
  Clock,
  UserCheck,
  UserPlus,
  BarChart3,
  Activity,
  DollarSign,
  ShieldCheck,
  FileText,
  ChevronRight,
  Lock,
} from "lucide-react";
import { PageHeader } from "@/components/app/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { AreaChart, BarChart } from "@/components/ui/Charts";
import { CountUp } from "@/components/ui/CountUp";
import { Stagger, FadeInUp } from "@/components/ui/Motion";
import type { RelatoriosData } from "@/lib/data/relatorios";
import type { RelatoriosFiltros } from "@/lib/data/relatorios-filtros";
import type { AccessLogRow, ConsentLogRow } from "@/lib/data/audit";
import type {
  TempoEsperaBI,
  TempoEsperaSemanaBI,
  OrigemPacientesBI,
  EpidemiologicoBI,
  FinanceiroBI,
} from "@/lib/data/bi";

const abas = [
  { id: "clinica", label: "Gestão Clínica", icon: BarChart3 },
  { id: "epidemiologico", label: "Epidemiológico", icon: Activity },
  { id: "financeiro", label: "Financeiro (BI)", icon: DollarSign },
  { id: "lgpd", label: "Conformidade LGPD", icon: ShieldCheck },
] as const;

type AbaId = (typeof abas)[number]["id"];

/** Formata número para moeda brasileira (R$ pt-BR). */
const moedaBR = (v: number) =>
  v.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });

// ════════════════════════════════════════════════════════════════
// Exportação CSV — gerada no client a partir dos dados já carregados.
// Separador ";" + BOM UTF-8 para abrir corretamente no Excel pt-BR.
// Sem dependências externas (Blob + URL.createObjectURL).
// ════════════════════════════════════════════════════════════════

function downloadCSV(
  filename: string,
  headers: string[],
  rows: (string | number)[][],
) {
  const escape = (v: string | number) => {
    const s = String(v);
    return /["\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers, ...rows].map((r) => r.map(escape).join(";"));
  const BOM = "﻿"; // abre corretamente no Excel pt-BR
  const blob = new Blob([BOM + lines.join("\r\n")], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Exporta uma série mensal (Mês × valor). */
function exportSerie(
  meses: string[],
  serie: number[],
  titulo: string,
  arquivo: string,
) {
  downloadCSV(
    arquivo,
    ["Mês", titulo],
    meses.map((m, i) => [m, serie[i] ?? 0]),
  );
}

/** Exporta um consolidado de todos os KPIs e séries do período. */
function exportTudo(data: RelatoriosData, gestor: boolean) {
  const rows: (string | number)[][] = [
    ["Indicador", "Valor", "Variação"],
    ["Taxa de Absenteísmo", data.absenteismo.value, data.absenteismo.change],
    ["Tempo de Espera", data.tempoEspera.value, data.tempoEspera.change],
    ["Taxa de Retenção", data.retencao.value, data.retencao.change],
    ["Novos Pacientes", data.novosPacientes.value, data.novosPacientes.change],
  ];
  // Financeiro só sai no CSV para gestor — e só chega no payload nesse caso.
  if (gestor && data.receitaMes != null) {
    rows.push(
      ["Receita do Mês", moedaBR(data.receitaMes), ""],
      ["Ticket Médio", moedaBR(data.ticketMedio ?? 0), ""],
      ["Margem Média", data.margemMedia ?? "—", ""],
      ["Inadimplência", data.inadimplencia ?? "—", ""],
    );
  }
  rows.push([], ["Mês", "Atendimentos", "Absenteísmo (%)", "Retenção (%)", "Tempo Espera (min)"]);
  data.meses.forEach((m, i) => {
    rows.push([
      m,
      data.atendimentosSerie[i] ?? 0,
      data.absenteismoSerie[i] ?? 0,
      data.retencaoSerie[i] ?? 0,
      data.tempoEsperaSerie[i] ?? 0,
    ]);
  });
  if (gestor && data.receitaSerie) {
    rows.push([], ["Mês", "Receita (R$ mil)", "Ticket Médio (R$)"]);
    data.meses.forEach((m, i) => {
      rows.push([m, data.receitaSerie?.[i] ?? 0, data.ticketSerie?.[i] ?? 0]);
    });
  }
  // Cabeçalho vazio: usamos a 1ª linha como header efetivo.
  downloadCSV(
    "relatorio-consolidado.csv",
    rows[0].map(String),
    rows.slice(1),
  );
}

/** Exporta a trilha de acessos a prontuários (auditoria LGPD). */
function exportAcessos(logs: AccessLogRow[]) {
  downloadCSV(
    "auditoria-acessos.csv",
    ["Data/Hora", "Usuário", "Papel", "Paciente", "Módulo", "Ação"],
    logs.map((l) => [l.quando, l.usuario, l.papel, l.paciente, l.modulo, l.acao]),
  );
}

/** Exporta o registro de consentimentos (auditoria LGPD). */
function exportConsentimentos(logs: ConsentLogRow[]) {
  downloadCSV(
    "auditoria-consentimentos.csv",
    ["Paciente", "Contexto", "Aceito", "Assinatura", "Registrado por", "Data/Hora"],
    logs.map((l) => [
      l.paciente,
      l.contexto,
      l.aceito,
      l.assinatura,
      l.registradoPor,
      l.quando,
    ]),
  );
}

// ════════════════════════════════════════════════════════════════
// Donut (pizza) local — sem dependências, paleta no estilo do Figma.
// Usado na "Origem dos Pacientes" (ROI de marketing). Componente local
// porque os charts compartilhados (Charts.tsx) não têm pizza.
// ════════════════════════════════════════════════════════════════
const PALETA = ["#0db8c2", "#0be0ae", "#3b82f6", "#a855f7", "#f59e0b", "#ef4444", "#94a3b8"];

function Donut({
  fatias,
}: {
  fatias: { origem: string; total: number; pct: number }[];
}) {
  const total = fatias.reduce((s, f) => s + f.total, 0);
  const R = 16; // raio (viewBox 0..40)
  const C = 2 * Math.PI * R; // circunferência

  // Precomputa cada segmento e seu offset acumulado via prefix-sum (puro,
  // sem mutação de variável externa no render — exigência do lint).
  const dashes = fatias.map((f) => (total > 0 ? f.total / total : 0) * C);
  const segmentos = fatias.map((f, i) => ({
    origem: f.origem,
    dash: dashes[i],
    offset: dashes.slice(0, i).reduce((s, v) => s + v, 0),
  }));

  return (
    <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-center sm:gap-8">
      <svg viewBox="0 0 40 40" className="h-44 w-44 -rotate-90">
        {segmentos.map((s, i) => (
          <circle
            key={s.origem}
            cx="20"
            cy="20"
            r={R}
            fill="none"
            stroke={PALETA[i % PALETA.length]}
            strokeWidth="7"
            strokeDasharray={`${s.dash} ${C - s.dash}`}
            strokeDashoffset={-s.offset}
          />
        ))}
      </svg>
      <ul className="flex-1 space-y-2">
        {fatias.map((f, i) => (
          <li key={f.origem} className="flex items-center gap-2 text-sm">
            <span
              className="inline-block h-3 w-3 rounded-sm"
              style={{ backgroundColor: PALETA[i % PALETA.length] }}
            />
            <span className="flex-1 text-ink">{f.origem}</span>
            <span className="font-medium text-muted">
              {f.total} · {f.pct}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function RelatoriosClient({
  gestor,
  data,
  accessLogs,
  consentLogs,
  tempoEspera,
  tempoEsperaSemana,
  origem,
  epidemio,
  financeiroBI,
  filtros,
  opcoesProfissionais,
  opcoesEspecialidades,
}: {
  gestor: boolean;
  data: RelatoriosData;
  accessLogs: AccessLogRow[];
  consentLogs: ConsentLogRow[];
  tempoEspera: TempoEsperaBI;
  tempoEsperaSemana: TempoEsperaSemanaBI;
  origem: OrigemPacientesBI;
  epidemio: EpidemiologicoBI;
  financeiroBI: FinanceiroBI | null;
  filtros: RelatoriosFiltros;
  opcoesProfissionais: { id: string; nome: string }[];
  opcoesEspecialidades: string[];
}) {
  const [aba, setAba] = useState<AbaId>("clinica");
  const meses = data.meses;

  // ── Filtros (server-side via URL) ────────────────────────────────
  // O estado reflete os filtros vigentes (vindos da URL). "Aplicar" navega
  // para a mesma rota com os params → a page re-consulta no servidor.
  const router = useRouter();
  const [aplicando, startAplicar] = useTransition();
  const [de, setDe] = useState(filtros.de ?? "");
  const [ate, setAte] = useState(filtros.ate ?? "");
  const [especialidade, setEspecialidade] = useState(
    filtros.especialidade ?? "todas",
  );
  const [profissionalId, setProfissionalId] = useState(
    filtros.profissionalId ?? "todos",
  );

  function aplicarFiltros() {
    const params = new URLSearchParams();
    if (de) params.set("de", de);
    if (ate) params.set("ate", ate);
    if (especialidade && especialidade !== "todas") {
      params.set("especialidade", especialidade);
    }
    if (profissionalId && profissionalId !== "todos") {
      params.set("profissionalId", profissionalId);
    }
    const qs = params.toString();
    startAplicar(() => router.push(qs ? `/relatorios?${qs}` : "/relatorios"));
  }

  function limparFiltros() {
    setDe("");
    setAte("");
    setEspecialidade("todas");
    setProfissionalId("todos");
    startAplicar(() => router.push("/relatorios"));
  }

  const temFiltro =
    !!de || !!ate || especialidade !== "todas" || profissionalId !== "todos";

  // Tempo de Espera REAL (BI): substitui o KPI/série representativos quando há
  // marcos de fila (called_at/started_at). Sem dado → estado vazio honesto.
  const esperaReal = tempoEspera.hasData;
  const esperaSerie = esperaReal ? tempoEspera.serieMin : data.tempoEsperaSerie;
  const esperaKpi = esperaReal
    ? {
        value: `${tempoEspera.mediaMin}min`,
        change: `${tempoEspera.amostras} atendimentos medidos`,
        positive: true,
      }
    : data.tempoEspera;

  // KPIs (clínica/epi/LGPD) — apresentação estática + valores do banco.
  const kpis = [
    {
      icon: AlertTriangle,
      tone: "bg-red-50 text-red-600",
      period: "Últimos 30 dias",
      label: "Taxa de Absenteísmo",
      ...data.absenteismo,
    },
    {
      icon: Clock,
      tone: "bg-brand-50 text-brand-600",
      period: esperaReal ? "Período (real)" : "Média semanal",
      label: "Tempo de Espera",
      ...esperaKpi,
    },
    {
      icon: UserCheck,
      tone: "bg-blue-50 text-blue-600",
      period: "Últimos 6 meses",
      label: "Taxa de Retenção",
      ...data.retencao,
    },
    {
      icon: UserPlus,
      tone: "bg-purple-50 text-purple-600",
      period: "Este mês",
      label: "Novos Pacientes",
      ...data.novosPacientes,
    },
  ];

  const relatorios = [
    {
      titulo: "Relatório de Atendimentos",
      descricao: "Consolidado mensal de consultas, retornos e cancelamentos.",
      formato: "CSV",
      onClick: () =>
        exportSerie(meses, data.atendimentosSerie, "Atendimentos", "atendimentos.csv"),
    },
    {
      titulo: "Indicadores Epidemiológicos",
      descricao: "Mapa de incidências e notificações compulsórias do período.",
      formato: "CSV",
      onClick: () =>
        exportSerie(meses, data.absenteismoSerie, "Absenteísmo (%)", "epidemiologico.csv"),
    },
    {
      titulo: "Conformidade LGPD",
      descricao: "Registro de consentimentos e logs de acesso a dados sensíveis.",
      formato: "CSV",
      onClick: () => exportTudo(data, gestor),
    },
  ];

  return (
    <>
      <PageHeader
        title="Relatórios e Business Intelligence"
        subtitle="Análises estratégicas para gestão clínica, epidemiologia e conformidade"
        actions={
          <Button variant="primary" onClick={() => exportTudo(data, gestor)}>
            <Download className="h-4 w-4" /> Exportar Todos
          </Button>
        }
      />

      {/* Filtros — aplicados no servidor (via URL → re-consulta a page) */}
      <Card className="p-4">
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            aplicarFiltros();
          }}
        >
          <span className="self-center text-sm font-medium text-ink">Filtros:</span>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted">De</span>
            <Input
              type="date"
              value={de}
              onChange={(e) => setDe(e.target.value)}
              max={ate || undefined}
              className="w-44"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted">Até</span>
            <Input
              type="date"
              value={ate}
              onChange={(e) => setAte(e.target.value)}
              min={de || undefined}
              className="w-44"
            />
          </label>
          <Select
            className="w-48"
            value={especialidade}
            onChange={(e) => setEspecialidade(e.target.value)}
            aria-label="Especialidade"
          >
            <option value="todas">Todas Especialidades</option>
            {opcoesEspecialidades.map((esp) => (
              <option key={esp} value={esp}>
                {esp}
              </option>
            ))}
          </Select>
          <Select
            className="w-48"
            value={profissionalId}
            onChange={(e) => setProfissionalId(e.target.value)}
            aria-label="Profissional"
          >
            <option value="todos">Todos Profissionais</option>
            {opcoesProfissionais.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </Select>
          <Button type="submit" variant="outline" disabled={aplicando}>
            {aplicando ? "Aplicando…" : "Aplicar Filtros"}
          </Button>
          {temFiltro && (
            <Button
              type="button"
              variant="ghost"
              onClick={limparFiltros}
              disabled={aplicando}
            >
              Limpar
            </Button>
          )}
        </form>
      </Card>

      {/* Abas de categoria */}
      <div className="mt-6 flex flex-wrap items-center gap-2">
        {abas.map((a) => {
          const Icon = a.icon;
          const ativa = aba === a.id;
          const trava = a.id === "financeiro" && !gestor;
          return (
            <button
              key={a.id}
              type="button"
              onClick={() => setAba(a.id)}
              className={
                ativa
                  ? "inline-flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white shadow-sm"
                  : "inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-muted hover:bg-black/5"
              }
            >
              <Icon className="h-4 w-4" /> {a.label}
              {trava && <Lock className="h-3.5 w-3.5" />}
            </button>
          );
        })}
      </div>

      {/* Financeiro (BI) — restrito ao gestor (LGPD/estratégico) */}
      {aba === "financeiro" && !gestor && (
        <Card className="mt-6 flex flex-col items-center justify-center gap-3 p-12 text-center">
          <span className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-muted-surface text-muted">
            <Lock className="h-7 w-7" />
          </span>
          <h3 className="text-lg font-semibold text-ink">
            Financeiro restrito ao gestor
          </h3>
          <p className="max-w-md text-sm text-muted">
            Receita, ticket médio e margem são visíveis apenas para usuários com
            perfil de gestor.
          </p>
        </Card>
      )}

      {aba === "financeiro" && gestor && (
        <>
          <Stagger className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[
              { label: "Receita do Mês", value: moedaBR(data.receitaMes ?? 0), tone: "bg-green-50 text-green-600", icon: DollarSign },
              { label: "Ticket Médio", value: moedaBR(data.ticketMedio ?? 0), tone: "bg-blue-50 text-blue-600", icon: BarChart3 },
              { label: "Margem Média", value: data.margemMedia ?? "—", tone: "bg-purple-50 text-purple-600", icon: Activity },
              { label: "Inadimplência", value: data.inadimplencia ?? "—", tone: "bg-orange-50 text-orange-600", icon: AlertTriangle },
            ].map((k) => {
              const Icon = k.icon;
              return (
                <FadeInUp key={k.label}>
                  <Card className="p-5">
                    <span
                      className={`inline-flex h-10 w-10 items-center justify-center rounded-xl ${k.tone}`}
                    >
                      <Icon className="h-5 w-5" />
                    </span>
                    <div className="mt-4 text-2xl font-bold text-ink">{k.value}</div>
                    <div className="mt-1 text-sm text-muted">{k.label}</div>
                  </Card>
                </FadeInUp>
              );
            })}
          </Stagger>

          <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card className="p-5">
              <h3 className="mb-4 font-semibold text-ink">Receita Mensal (R$ mil)</h3>
              <BarChart labels={meses} series={data.receitaSerie ?? []} />
            </Card>
            <Card className="p-5">
              <h3 className="mb-4 font-semibold text-ink">Evolução do Ticket Médio</h3>
              <AreaChart
                labels={meses}
                series={[
                  { name: "Ticket", color: "#0db8c2", values: data.ticketSerie ?? [] },
                ]}
              />
            </Card>
          </div>

          {/* Desempenho por Convênio — glosa + tempo médio de recebimento */}
          {financeiroBI && (
            <>
              <Card className="mt-6 overflow-hidden">
                <div className="flex items-center justify-between p-5">
                  <div>
                    <h3 className="font-semibold text-ink">
                      Desempenho por Convênio{" "}
                      <span className="text-muted">
                        ({financeiroBI.convenios.length})
                      </span>
                    </h3>
                    <p className="text-sm text-muted">
                      Glosa e tempo médio de recebimento das guias TISS
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={financeiroBI.convenios.length === 0}
                    onClick={() =>
                      downloadCSV(
                        "convenios.csv",
                        [
                          "Convênio",
                          "Guias",
                          "Glosadas",
                          "Glosa (%)",
                          "Valor Total",
                          "Valor Glosado",
                          "Recebimento (dias)",
                        ],
                        financeiroBI.convenios.map((c) => [
                          c.convenio,
                          c.guias,
                          c.glosadas,
                          c.glosaPct,
                          c.valorTotal,
                          c.valorGlosado,
                          c.tempoMedioRecebimentoDias ?? "—",
                        ]),
                      )
                    }
                  >
                    <Download className="h-4 w-4" /> CSV
                  </Button>
                </div>
                <div className="overflow-x-auto border-t border-line">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-muted-surface text-xs font-medium uppercase tracking-wide text-muted">
                      <tr>
                        <th className="px-5 py-3">Convênio</th>
                        <th className="px-5 py-3">Guias</th>
                        <th className="px-5 py-3">Glosa</th>
                        <th className="px-5 py-3">Valor Total</th>
                        <th className="px-5 py-3">Valor Glosado</th>
                        <th className="px-5 py-3">Recebimento</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {financeiroBI.convenios.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="px-5 py-8 text-center text-muted">
                            Nenhuma guia TISS registrada.
                          </td>
                        </tr>
                      ) : (
                        financeiroBI.convenios.map((c) => (
                          <tr key={c.convenio} className="hover:bg-black/[0.02]">
                            <td className="px-5 py-3 font-medium text-ink">
                              {c.convenio}
                            </td>
                            <td className="px-5 py-3 text-muted">{c.guias}</td>
                            <td className="px-5 py-3">
                              <span
                                className={
                                  c.glosaPct >= 15
                                    ? "font-medium text-red-600"
                                    : "text-muted"
                                }
                              >
                                {c.glosadas} ({c.glosaPct}%)
                              </span>
                            </td>
                            <td className="px-5 py-3 text-ink">
                              {moedaBR(c.valorTotal)}
                            </td>
                            <td className="px-5 py-3 text-muted">
                              {moedaBR(c.valorGlosado)}
                            </td>
                            <td className="px-5 py-3 text-muted">
                              {c.tempoMedioRecebimentoDias != null
                                ? `${c.tempoMedioRecebimentoDias} dias`
                                : "—"}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </Card>

              {/* Ticket Médio por Especialidade */}
              <Card className="mt-6 overflow-hidden">
                <div className="flex items-center justify-between p-5">
                  <div>
                    <h3 className="font-semibold text-ink">
                      Ticket Médio por Especialidade{" "}
                      <span className="text-muted">
                        ({financeiroBI.ticketPorEspecialidade.length})
                      </span>
                    </h3>
                    <p className="text-sm text-muted">
                      Receita média por evento faturável, por especialidade
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={financeiroBI.ticketPorEspecialidade.length === 0}
                    onClick={() =>
                      downloadCSV(
                        "ticket-especialidade.csv",
                        ["Especialidade", "Eventos", "Valor Total", "Ticket Médio"],
                        financeiroBI.ticketPorEspecialidade.map((t) => [
                          t.especialidade,
                          t.eventos,
                          t.valorTotal,
                          t.ticketMedio,
                        ]),
                      )
                    }
                  >
                    <Download className="h-4 w-4" /> CSV
                  </Button>
                </div>
                <div className="overflow-x-auto border-t border-line">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-muted-surface text-xs font-medium uppercase tracking-wide text-muted">
                      <tr>
                        <th className="px-5 py-3">Especialidade</th>
                        <th className="px-5 py-3">Eventos</th>
                        <th className="px-5 py-3">Valor Total</th>
                        <th className="px-5 py-3">Ticket Médio</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {financeiroBI.ticketPorEspecialidade.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="px-5 py-8 text-center text-muted">
                            Nenhum evento faturável registrado.
                          </td>
                        </tr>
                      ) : (
                        financeiroBI.ticketPorEspecialidade.map((t) => (
                          <tr key={t.especialidade} className="hover:bg-black/[0.02]">
                            <td className="px-5 py-3 font-medium text-ink">
                              {t.especialidade}
                            </td>
                            <td className="px-5 py-3 text-muted">{t.eventos}</td>
                            <td className="px-5 py-3 text-ink">
                              {moedaBR(t.valorTotal)}
                            </td>
                            <td className="px-5 py-3 font-medium text-brand-600">
                              {moedaBR(t.ticketMedio)}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </Card>

              {/* Conversão de Orçamentos (budgets) */}
              <Card className="mt-6 p-5">
                <div className="mb-4 flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold text-ink">Conversão de Orçamentos</h3>
                    <p className="text-sm text-muted">
                      Orçamentos clínicos por status e taxa de aprovação
                    </p>
                  </div>
                  <span className="text-2xl font-bold text-brand-600">
                    {financeiroBI.conversao.taxaConversaoPct}%
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: "Proposto", value: financeiroBI.conversao.proposto, tone: "bg-muted-surface text-muted" },
                    { label: "Aprovado", value: financeiroBI.conversao.aprovado, tone: "bg-green-50 text-green-600" },
                    { label: "Recusado", value: financeiroBI.conversao.recusado, tone: "bg-red-50 text-red-600" },
                  ].map((s) => (
                    <div
                      key={s.label}
                      className={`rounded-xl p-4 text-center ${s.tone}`}
                    >
                      <div className="text-2xl font-bold">{s.value}</div>
                      <div className="text-xs font-medium">{s.label}</div>
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
                  <span>
                    {financeiroBI.conversao.total} orçamentos · taxa de conversão =
                    aprovados sobre o total.
                  </span>
                  <span>
                    Valor aprovado:{" "}
                    <strong className="text-ink">
                      {moedaBR(financeiroBI.conversao.valorAprovado)}
                    </strong>{" "}
                    / {moedaBR(financeiroBI.conversao.valorTotal)}
                  </span>
                </div>
              </Card>
            </>
          )}
        </>
      )}

      {/* Conformidade LGPD — restrita ao gestor (trilha de auditoria) */}
      {aba === "lgpd" && !gestor && (
        <Card className="mt-6 flex flex-col items-center justify-center gap-3 p-12 text-center">
          <span className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-muted-surface text-muted">
            <Lock className="h-7 w-7" />
          </span>
          <h3 className="text-lg font-semibold text-ink">
            Auditoria restrita ao gestor
          </h3>
          <p className="max-w-md text-sm text-muted">
            Os logs de acesso a prontuários e o registro de consentimentos são
            visíveis apenas para usuários com perfil de gestor (LGPD).
          </p>
        </Card>
      )}

      {aba === "lgpd" && gestor && (
        <>
          <div className="mt-6 flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-ink">Auditoria de Conformidade (LGPD)</h3>
              <p className="text-sm text-muted">
                Rastreabilidade de acesso a dados sensíveis e consentimentos
              </p>
            </div>
            <Button
              variant="primary"
              size="sm"
              onClick={() => exportAcessos(accessLogs)}
            >
              <Download className="h-4 w-4" /> Exportar Auditoria
            </Button>
          </div>

          {/* Log de Acessos a Prontuários */}
          <Card className="mt-4 overflow-hidden">
            <div className="flex items-center justify-between p-5">
              <div>
                <h4 className="font-medium text-ink">
                  Log de Acessos a Prontuários{" "}
                  <span className="text-muted">({accessLogs.length})</span>
                </h4>
                <p className="text-sm text-muted">
                  Quem acessou qual prontuário e quando
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => exportAcessos(accessLogs)}
              >
                <Download className="h-4 w-4" /> CSV
              </Button>
            </div>
            <div className="overflow-x-auto border-t border-line">
              <table className="w-full text-left text-sm">
                <thead className="bg-muted-surface text-xs font-medium uppercase tracking-wide text-muted">
                  <tr>
                    <th className="px-5 py-3">Data/Hora</th>
                    <th className="px-5 py-3">Usuário</th>
                    <th className="px-5 py-3">Papel</th>
                    <th className="px-5 py-3">Paciente</th>
                    <th className="px-5 py-3">Módulo</th>
                    <th className="px-5 py-3">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {accessLogs.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-5 py-8 text-center text-muted">
                        Nenhum acesso registrado no período.
                      </td>
                    </tr>
                  ) : (
                    accessLogs.map((l) => (
                      <tr key={l.id} className="hover:bg-black/[0.02]">
                        <td className="whitespace-nowrap px-5 py-3 text-muted">{l.quando}</td>
                        <td className="px-5 py-3 font-medium text-ink">{l.usuario}</td>
                        <td className="px-5 py-3 text-muted">{l.papel}</td>
                        <td className="px-5 py-3 text-ink">{l.paciente}</td>
                        <td className="px-5 py-3 text-muted">{l.modulo}</td>
                        <td className="px-5 py-3 text-muted">{l.acao}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Log de Consentimentos */}
          <Card className="mt-4 overflow-hidden">
            <div className="flex items-center justify-between p-5">
              <div>
                <h4 className="font-medium text-ink">
                  Log de Consentimentos{" "}
                  <span className="text-muted">({consentLogs.length})</span>
                </h4>
                <p className="text-sm text-muted">
                  Consentimentos registrados e quem os coletou
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => exportConsentimentos(consentLogs)}
              >
                <Download className="h-4 w-4" /> CSV
              </Button>
            </div>
            <div className="overflow-x-auto border-t border-line">
              <table className="w-full text-left text-sm">
                <thead className="bg-muted-surface text-xs font-medium uppercase tracking-wide text-muted">
                  <tr>
                    <th className="px-5 py-3">Paciente</th>
                    <th className="px-5 py-3">Contexto</th>
                    <th className="px-5 py-3">Aceito</th>
                    <th className="px-5 py-3">Assinatura</th>
                    <th className="px-5 py-3">Registrado por</th>
                    <th className="px-5 py-3">Data/Hora</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {consentLogs.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-5 py-8 text-center text-muted">
                        Nenhum consentimento registrado.
                      </td>
                    </tr>
                  ) : (
                    consentLogs.map((l) => (
                      <tr key={l.id} className="hover:bg-black/[0.02]">
                        <td className="px-5 py-3 font-medium text-ink">{l.paciente}</td>
                        <td className="px-5 py-3 text-muted">{l.contexto}</td>
                        <td className="px-5 py-3 text-muted">{l.aceito}</td>
                        <td className="px-5 py-3 text-muted">{l.assinatura}</td>
                        <td className="px-5 py-3 text-ink">{l.registradoPor}</td>
                        <td className="whitespace-nowrap px-5 py-3 text-muted">{l.quando}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}

      {/* Abas clínica/epidemiológico — indicadores e gráficos */}
      {(aba === "clinica" || aba === "epidemiologico") && (
        <>
          <Stagger className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {kpis.map((kpi) => {
              const Icon = kpi.icon;
              return (
                <FadeInUp key={kpi.label}>
                  <Card interactive className="p-5">
                    <div className="flex items-start justify-between">
                      <span
                        className={`inline-flex h-10 w-10 items-center justify-center rounded-xl ${kpi.tone}`}
                      >
                        <Icon className="h-5 w-5" />
                      </span>
                      <span className="text-xs text-muted">{kpi.period}</span>
                    </div>
                    <div className="mt-4 text-2xl font-bold text-ink">
                      <CountUp value={kpi.value} />
                    </div>
                    <div className="mt-1 text-sm text-muted">{kpi.label}</div>
                    <div
                      className={`mt-2 text-xs font-medium ${
                        kpi.positive ? "text-green-600" : "text-red-500"
                      }`}
                    >
                      {kpi.positive ? "↑" : "↓"} {kpi.change}
                    </div>
                  </Card>
                </FadeInUp>
              );
            })}
          </Stagger>

          <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card className="p-5">
              <div className="mb-4 flex items-start justify-between">
                <div>
                  <h3 className="font-semibold text-ink">
                    Taxa de Absenteísmo (No-show)
                  </h3>
                  <p className="text-sm text-muted">
                    Percentual de pacientes que não compareceram
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label="Exportar gráfico"
                  onClick={() =>
                    exportSerie(meses, data.absenteismoSerie, "Absenteísmo (%)", "absenteismo.csv")
                  }
                >
                  <Download className="h-4 w-4" />
                </Button>
              </div>
              <BarChart labels={meses} series={data.absenteismoSerie} />
            </Card>

            <Card className="p-5">
              <div className="mb-4 flex items-start justify-between">
                <div>
                  <h3 className="font-semibold text-ink">Tempo Médio de Espera</h3>
                  <p className="text-sm text-muted">
                    Diferença entre chegada e chamada/início (minutos)
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label="Exportar gráfico"
                  disabled={!esperaReal}
                  onClick={() =>
                    exportSerie(meses, esperaSerie, "Tempo de Espera (min)", "tempo-espera.csv")
                  }
                >
                  <Download className="h-4 w-4" />
                </Button>
              </div>
              {esperaReal ? (
                <AreaChart
                  labels={meses}
                  series={[{ name: "Minutos", color: "#0db8c2", values: esperaSerie }]}
                />
              ) : (
                <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
                  <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-muted-surface text-muted">
                    <Clock className="h-6 w-6" />
                  </span>
                  <p className="text-sm font-medium text-ink">
                    Sem dados de espera registrados
                  </p>
                  <p className="max-w-xs text-xs text-muted">
                    O tempo de espera é medido quando os pacientes são chamados e
                    atendidos pela fila. Ainda não há marcos suficientes.
                  </p>
                </div>
              )}
            </Card>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card className="p-5">
              <div className="mb-4 flex items-start justify-between">
                <div>
                  <h3 className="font-semibold text-ink">
                    Atendimentos por Especialidade
                  </h3>
                  <p className="text-sm text-muted">Volume de consultas no período</p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label="Exportar gráfico"
                  onClick={() =>
                    exportSerie(meses, data.atendimentosSerie, "Atendimentos", "atendimentos.csv")
                  }
                >
                  <Download className="h-4 w-4" />
                </Button>
              </div>
              <BarChart labels={meses} series={data.atendimentosSerie} />
            </Card>

            <Card className="p-5">
              <div className="mb-4 flex items-start justify-between">
                <div>
                  <h3 className="font-semibold text-ink">Evolução da Retenção</h3>
                  <p className="text-sm text-muted">Pacientes recorrentes (%)</p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label="Exportar gráfico"
                  onClick={() =>
                    exportSerie(meses, data.retencaoSerie, "Retenção (%)", "retencao.csv")
                  }
                >
                  <Download className="h-4 w-4" />
                </Button>
              </div>
              <AreaChart
                labels={meses}
                series={[
                  { name: "Retenção", color: "#0db8c2", values: data.retencaoSerie },
                ]}
              />
            </Card>
          </div>

          {/* Marketing/operação (só aba clínica): origem + espera por dia */}
          {aba === "clinica" && (
            <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
              {/* Origem dos Pacientes (ROI marketing) */}
              <Card className="p-5">
                <div className="mb-4 flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold text-ink">Origem dos Pacientes</h3>
                    <p className="text-sm text-muted">
                      Canal de captação (ROI de marketing)
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label="Exportar origem"
                    disabled={!origem.hasData}
                    onClick={() =>
                      downloadCSV(
                        "origem-pacientes.csv",
                        ["Origem", "Total", "%"],
                        origem.fatias.map((f) => [f.origem, f.total, f.pct]),
                      )
                    }
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                </div>
                {origem.hasData ? (
                  <Donut fatias={origem.fatias} />
                ) : (
                  <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
                    <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-muted-surface text-muted">
                      <UserPlus className="h-6 w-6" />
                    </span>
                    <p className="text-sm font-medium text-ink">
                      Sem origem registrada
                    </p>
                    <p className="max-w-xs text-xs text-muted">
                      A origem aparece conforme o canal de captação for informado
                      no cadastro dos pacientes.
                    </p>
                  </div>
                )}
              </Card>

              {/* Tempo Médio de Espera por Dia da Semana (REAL) */}
              <Card className="p-5">
                <div className="mb-4 flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold text-ink">
                      Tempo de Espera por Dia da Semana
                    </h3>
                    <p className="text-sm text-muted">
                      Média da fila por dia (minutos, últimos 90 dias)
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label="Exportar espera por dia"
                    disabled={!tempoEsperaSemana.hasData}
                    onClick={() =>
                      downloadCSV(
                        "espera-dia-semana.csv",
                        ["Dia", "Tempo de Espera (min)"],
                        tempoEsperaSemana.dias.map((d, i) => [
                          d,
                          tempoEsperaSemana.serieMin[i] ?? 0,
                        ]),
                      )
                    }
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                </div>
                {tempoEsperaSemana.hasData ? (
                  <BarChart
                    labels={tempoEsperaSemana.dias}
                    series={tempoEsperaSemana.serieMin}
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
                    <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-muted-surface text-muted">
                      <Clock className="h-6 w-6" />
                    </span>
                    <p className="text-sm font-medium text-ink">
                      Sem dados de espera registrados
                    </p>
                    <p className="max-w-xs text-xs text-muted">
                      Medido a partir das chamadas/atendimentos da fila. Ainda não
                      há marcos suficientes no período.
                    </p>
                  </div>
                )}
              </Card>
            </div>
          )}
        </>
      )}

      {/* Epidemiológico (BI) — alto risco, alergias e patologias */}
      {aba === "epidemiologico" && (
        <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* Pacientes de Alto Risco */}
          <Card className="overflow-hidden">
            <div className="flex items-center justify-between p-5">
              <div>
                <h3 className="font-semibold text-ink">
                  Pacientes de Alto Risco{" "}
                  <span className="text-muted">({epidemio.altoRisco.length})</span>
                </h3>
                <p className="text-sm text-muted">
                  Crônicos e pré-diabéticos detectados nas anamneses
                </p>
              </div>
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-red-50 text-red-600">
                <AlertTriangle className="h-5 w-5" />
              </span>
            </div>
            <div className="overflow-x-auto border-t border-line">
              <table className="w-full text-left text-sm">
                <thead className="bg-muted-surface text-xs font-medium uppercase tracking-wide text-muted">
                  <tr>
                    <th className="px-5 py-3">Paciente</th>
                    <th className="px-5 py-3">Condições</th>
                    <th className="px-5 py-3">Especialidade</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {epidemio.altoRisco.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="px-5 py-8 text-center text-muted">
                        Nenhum paciente de alto risco identificado.
                      </td>
                    </tr>
                  ) : (
                    epidemio.altoRisco.map((p, i) => (
                      <tr key={`${p.paciente}-${i}`} className="hover:bg-black/[0.02]">
                        <td className="px-5 py-3 font-medium text-ink">{p.paciente}</td>
                        <td className="px-5 py-3">
                          <div className="flex flex-wrap gap-1">
                            {p.condicoes.map((c) => (
                              <span
                                key={c}
                                className="inline-flex rounded-md bg-red-50 px-2 py-0.5 text-xs font-medium text-red-600"
                              >
                                {c}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="px-5 py-3 text-muted">{p.especialidade}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Alertas de Alergias */}
          <Card className="overflow-hidden">
            <div className="flex items-center justify-between p-5">
              <div>
                <h3 className="font-semibold text-ink">
                  Alertas de Alergias{" "}
                  <span className="text-muted">({epidemio.alertasAlergia.length})</span>
                </h3>
                <p className="text-sm text-muted">
                  Alergias declaradas por especialidade da ficha
                </p>
              </div>
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-orange-50 text-orange-600">
                <AlertTriangle className="h-5 w-5" />
              </span>
            </div>
            <div className="overflow-x-auto border-t border-line">
              <table className="w-full text-left text-sm">
                <thead className="bg-muted-surface text-xs font-medium uppercase tracking-wide text-muted">
                  <tr>
                    <th className="px-5 py-3">Paciente</th>
                    <th className="px-5 py-3">Alergia</th>
                    <th className="px-5 py-3">Especialidade</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {epidemio.alertasAlergia.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="px-5 py-8 text-center text-muted">
                        Nenhuma alergia registrada.
                      </td>
                    </tr>
                  ) : (
                    epidemio.alertasAlergia.map((a, i) => (
                      <tr key={`${a.paciente}-${i}`} className="hover:bg-black/[0.02]">
                        <td className="px-5 py-3 font-medium text-ink">{a.paciente}</td>
                        <td className="px-5 py-3 text-orange-600">{a.alergia}</td>
                        <td className="px-5 py-3 text-muted">{a.especialidade}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Estatísticas de Patologias */}
          <Card className="p-5 lg:col-span-2">
            <div className="mb-4 flex items-start justify-between">
              <div>
                <h3 className="font-semibold text-ink">Estatísticas de Patologias</h3>
                <p className="text-sm text-muted">
                  Condições mais frequentes registradas nas anamneses
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                aria-label="Exportar patologias"
                disabled={epidemio.patologias.length === 0}
                onClick={() =>
                  downloadCSV(
                    "patologias.csv",
                    ["Patologia", "Total"],
                    epidemio.patologias.map((p) => [p.patologia, p.total]),
                  )
                }
              >
                <Download className="h-4 w-4" />
              </Button>
            </div>
            {epidemio.patologias.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
                <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-muted-surface text-muted">
                  <Activity className="h-6 w-6" />
                </span>
                <p className="text-sm font-medium text-ink">
                  Sem patologias registradas
                </p>
                <p className="max-w-xs text-xs text-muted">
                  As estatísticas aparecem conforme as anamneses forem preenchidas.
                </p>
              </div>
            ) : (
              <BarChart
                labels={epidemio.patologias.map((p) => p.patologia)}
                series={epidemio.patologias.map((p) => p.total)}
              />
            )}
          </Card>
        </div>
      )}

      {/* Relatórios disponíveis para exportação */}
      <Card className="mt-6 overflow-hidden">
        <div className="flex items-center justify-between p-5">
          <h3 className="font-semibold text-ink">
            Relatórios Disponíveis <span className="text-muted">(3)</span>
          </h3>
          <Button variant="outline" size="sm" onClick={() => exportTudo(data, gestor)}>
            Exportar Todos
          </Button>
        </div>
        <div className="grid grid-cols-1 gap-4 border-t border-line p-5 sm:grid-cols-2 xl:grid-cols-3">
          {relatorios.map((rel) => (
            <div
              key={rel.titulo}
              className="flex items-start gap-3 rounded-xl border border-line p-4"
            >
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                <FileText className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <h4 className="font-medium text-ink">{rel.titulo}</h4>
                <p className="mt-1 text-sm text-muted">{rel.descricao}</p>
                <div className="mt-3 flex items-center justify-between">
                  <span className="text-xs text-muted">{rel.formato}</span>
                  <Button variant="ghost" size="sm" onClick={rel.onClick}>
                    Baixar <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </>
  );
}

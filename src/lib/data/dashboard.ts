import { createClient } from "@/lib/supabase/server";
import { type ModuleSlug } from "@/lib/permissions.shared";

/** Variação percentual de um KPI (mês atual vs. mês anterior). */
export type KpiChange = { value: string; positive: boolean };

export type DashboardKpis = {
  pacientesAtivos: string;
  consultasHoje: string;
  receitaMensal: string;
  taxaOcupacao: string;
  /** Variações % calculadas (mês atual vs. anterior). */
  changes: {
    pacientesAtivos: KpiChange;
    consultasHoje: KpiChange;
    receitaMensal: KpiChange;
    taxaOcupacao: KpiChange;
  };
  /**
   * Séries de tendência (7–8 pontos) p/ os sparklines dos KPIs.
   * Opcional: no caminho REAL pode vir vazio → o sparkline some.
   */
  series?: {
    pacientesAtivos: number[];
    consultasHoje: number[];
    receitaMensal: number[];
    taxaOcupacao: number[];
  };
};

const DEMO: DashboardKpis = {
  pacientesAtivos: "2.847",
  consultasHoje: "24",
  receitaMensal: "R$ 182.4K",
  taxaOcupacao: "87.5%",
  changes: {
    pacientesAtivos: { value: "12.5%", positive: true },
    consultasHoje: { value: "8.2%", positive: true },
    receitaMensal: { value: "15.3%", positive: true },
    taxaOcupacao: { value: "2.4%", positive: false },
  },
  series: {
    pacientesAtivos: [2480, 2535, 2590, 2640, 2705, 2760, 2810, 2847],
    consultasHoje: [16, 19, 17, 22, 20, 25, 21, 24],
    receitaMensal: [142, 150, 138, 159, 165, 172, 176, 182],
    taxaOcupacao: [82, 84, 85, 88, 90, 89, 86, 87.5],
  },
};

/** % de variação atual vs. anterior, formatado "X.Y%" + sinal. */
function pctChange(current: number, previous: number): KpiChange {
  if (previous <= 0) {
    // Sem base de comparação: tudo que existe hoje é "novo" (alta) ou estável.
    return { value: current > 0 ? "100%" : "0%", positive: current >= 0 };
  }
  const delta = ((current - previous) / previous) * 100;
  const rounded = Math.round(Math.abs(delta) * 10) / 10;
  return {
    value: `${rounded.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`,
    positive: delta >= 0,
  };
}

const brl = (n: number) =>
  "R$ " +
  (n >= 1000
    ? (n / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + "K"
    : n.toLocaleString("pt-BR", { maximumFractionDigits: 0 }));

/** Séries do gráfico "Atendimentos Mensais" (últimos 6 meses). */
export type ConsultasRetornos = {
  labels: string[];
  consultas: number[];
  retornos: number[];
};

const MESES_ABBR = [
  "Jan",
  "Fev",
  "Mar",
  "Abr",
  "Mai",
  "Jun",
  "Jul",
  "Ago",
  "Set",
  "Out",
  "Nov",
  "Dez",
];

/** Fallback demo — espelha o Figma (Abr 356/118, Mai 398/145). */
const DEMO_SERIES: ConsultasRetornos = {
  labels: ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun"],
  consultas: [245, 310, 295, 356, 398, 420],
  retornos: [95, 105, 100, 118, 145, 160],
};

/** Buckets dos últimos 6 meses (índice 0 = mais antigo). */
function lastSixMonths() {
  const now = new Date();
  const buckets: { year: number; month: number; label: string }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    buckets.push({
      year: d.getFullYear(),
      month: d.getMonth(),
      label: MESES_ABBR[d.getMonth()],
    });
  }
  return buckets;
}

/**
 * Atendimentos mensais (últimos 6 meses) a partir do banco; fallback demo.
 *
 * Sem coluna de "tipo de consulta" em `appointments`, "retorno" é derivado:
 * é todo agendamento que NÃO é o primeiro do paciente (cronologicamente).
 * Logo, só pacientes recorrentes (com mais de 1 appointment) geram retornos.
 * "Consultas" é o total de agendamentos do mês; "Retornos" é o subconjunto.
 */
export async function getConsultasRetornos(): Promise<ConsultasRetornos> {

  const supabase = await createClient();
  const buckets = lastSixMonths();
  const windowStart = new Date(buckets[0].year, buckets[0].month, 1);

  // patient_id + starts_at de TODOS os agendamentos: precisamos do histórico
  // completo para saber o primeiro atendimento de cada paciente.
  const { data } = await supabase
    .from("appointments")
    .select("patient_id, starts_at");

  const rows = (data ?? []) as { patient_id: string; starts_at: string }[];

  // Primeiro atendimento (mais antigo) por paciente, em ms.
  const firstByPatient = new Map<string, number>();
  for (const r of rows) {
    const t = new Date(r.starts_at).getTime();
    const prev = firstByPatient.get(r.patient_id);
    if (prev === undefined || t < prev) firstByPatient.set(r.patient_id, t);
  }

  // Índice de bucket por ano-mês.
  const indexByKey = new Map<string, number>();
  buckets.forEach((b, i) => indexByKey.set(`${b.year}-${b.month}`, i));

  const consultas: number[] = new Array<number>(6).fill(0);
  const retornos: number[] = new Array<number>(6).fill(0);
  const windowStartMs = windowStart.getTime();

  for (const r of rows) {
    const d = new Date(r.starts_at);
    if (d.getTime() < windowStartMs) continue;
    const idx = indexByKey.get(`${d.getFullYear()}-${d.getMonth()}`);
    if (idx === undefined) continue;
    consultas[idx] += 1;
    const first = firstByPatient.get(r.patient_id);
    if (first !== undefined && d.getTime() > first) retornos[idx] += 1;
  }

  return { labels: buckets.map((b) => b.label), consultas, retornos };
}

/** Limites [início, fim) do mês com offset (0 = mês atual, -1 = anterior). */
function monthRange(offset: number): { start: Date; end: Date } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const end = new Date(now.getFullYear(), now.getMonth() + offset + 1, 1);
  return { start, end };
}

/** Taxa de ocupação (%) de um conjunto de agendamentos. */
function ocupacaoDe(rows: { status: string }[]): number {
  if (!rows.length) return 0;
  const ocupados = rows.filter((a) =>
    ["confirmado", "em_atendimento", "concluido"].includes(a.status),
  ).length;
  return Math.round((ocupados / rows.length) * 1000) / 10;
}

/**
 * KPIs do dashboard a partir do banco (contagens reais) + variação % do mês
 * atual vs. anterior (CALCULADA, não mais hardcoded). Fallback no demo.
 */
export async function getDashboardKpis(): Promise<DashboardKpis> {

  const supabase = await createClient();

  const startHoje = new Date();
  startHoje.setHours(0, 0, 0, 0);
  const endHoje = new Date();
  endHoje.setHours(23, 59, 59, 999);

  const cur = monthRange(0);
  const prev = monthRange(-1);

  const [
    pac,
    pacPrev,
    hoje,
    appts,
    apptsCur,
    apptsPrev,
    billsCur,
    billsPrev,
  ] = await Promise.all([
    // Total de pacientes (todos) e pacientes criados até o fim do mês anterior.
    supabase.from("patients").select("*", { count: "exact", head: true }),
    supabase
      .from("patients")
      .select("*", { count: "exact", head: true })
      .lt("created_at", cur.start.toISOString()),
    // Consultas de hoje.
    supabase
      .from("appointments")
      .select("*", { count: "exact", head: true })
      .gte("starts_at", startHoje.toISOString())
      .lte("starts_at", endHoje.toISOString()),
    // Ocupação geral (todos os agendamentos) — mantém compat com a versão anterior.
    supabase.from("appointments").select("status"),
    // Ocupação do mês atual e do anterior (para a variação).
    supabase
      .from("appointments")
      .select("status")
      .gte("starts_at", cur.start.toISOString())
      .lt("starts_at", cur.end.toISOString()),
    supabase
      .from("appointments")
      .select("status")
      .gte("starts_at", prev.start.toISOString())
      .lt("starts_at", prev.end.toISOString()),
    // Receita do mês atual e do anterior (para a variação).
    supabase
      .from("billable_events")
      .select("amount")
      .gte("created_at", cur.start.toISOString())
      .lt("created_at", cur.end.toISOString()),
    supabase
      .from("billable_events")
      .select("amount")
      .gte("created_at", prev.start.toISOString())
      .lt("created_at", prev.end.toISOString()),
  ]);

  const pacientes = pac.count ?? 0;
  const pacientesAntes = pacPrev.count ?? 0;
  const consultasHoje = hoje.count ?? 0;

  const sumAmount = (rows: { amount: number | null }[] | null) =>
    (rows ?? []).reduce((s, b) => s + Number(b.amount ?? 0), 0);
  const receitaCur = sumAmount(billsCur.data);
  const receitaPrev = sumAmount(billsPrev.data);
  // Receita "mensal" exibida = mês atual (consistente com a variação).
  const receita = receitaCur;

  const apptRows = appts.data ?? [];
  const ocupacao = ocupacaoDe(apptRows);
  const ocupCur = ocupacaoDe(apptsCur.data ?? []);
  const ocupPrev = ocupacaoDe(apptsPrev.data ?? []);

  return {
    pacientesAtivos: pacientes.toLocaleString("pt-BR"),
    consultasHoje: String(consultasHoje),
    receitaMensal: brl(receita),
    taxaOcupacao: `${ocupacao.toLocaleString("pt-BR")}%`,
    changes: {
      // Pacientes: crescimento da base total vs. base no início do mês.
      pacientesAtivos: pctChange(pacientes, pacientesAntes),
      // Consultas hoje: vs. média diária do mês anterior (aproximação).
      consultasHoje: pctChange(
        consultasHoje,
        (apptsPrev.data?.length ?? 0) / 30,
      ),
      receitaMensal: pctChange(receitaCur, receitaPrev),
      taxaOcupacao: pctChange(ocupCur, ocupPrev),
    },
  };
}

/** Série de Receita REAL por mês (últimos 6 meses, em R$) — gráfico de barras. */
export type ReceitaMensal = { labels: string[]; valores: number[] };

const DEMO_RECEITA: ReceitaMensal = {
  labels: ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun"],
  valores: [142000, 150000, 138000, 165000, 172000, 182000],
};

/**
 * Receita mensal real a partir de billable_events agregado por mês (últimos 6).
 * GESTOR-ONLY (a página já restringe o render); aqui apenas agregamos valores.
 * Fallback demo. Em erro/sem dados: zeros (resiliente).
 */
export async function getReceitaMensal(): Promise<ReceitaMensal> {

  const supabase = await createClient();
  const buckets = lastSixMonths();
  const windowStart = new Date(buckets[0].year, buckets[0].month, 1);

  const { data } = await supabase
    .from("billable_events")
    .select("amount, created_at")
    .gte("created_at", windowStart.toISOString());

  const rows = (data ?? []) as { amount: number | null; created_at: string }[];

  const indexByKey = new Map<string, number>();
  buckets.forEach((b, i) => indexByKey.set(`${b.year}-${b.month}`, i));

  const valores = new Array<number>(6).fill(0);
  for (const r of rows) {
    const d = new Date(r.created_at);
    const idx = indexByKey.get(`${d.getFullYear()}-${d.getMonth()}`);
    if (idx === undefined) continue;
    valores[idx] += Number(r.amount ?? 0);
  }

  return { labels: buckets.map((b) => b.label), valores };
}

import { listAgendadosHoje } from "./queue";

/**
 * Contadores reais para badges do MENU (fila aguardando, estoque crítico).
 * Exportado aqui para o orquestrador ligar no nav/layout (não editamos nav.ts).
 * Resiliente: em erro/demo retorna zeros. Sem clinic_id (mono-clínica).
 */
export type MenuCounters = {
  /** Pacientes na fila com status "aguardando". */
  filaAguardando: number;
  /** Atendimentos finalizados pelo médico aguardando pagamento na recepção. */
  aguardandoPagamento: number;
  /** Itens de estoque críticos (saldo < mínimo/2). */
  estoqueCriticos: number;
  /** Pacientes agendados para hoje que ainda não fizeram check-in. */
  checkinPendentes: number;
};

const DEMO_COUNTERS: MenuCounters = {
  filaAguardando: 3,
  aguardandoPagamento: 1,
  estoqueCriticos: 2,
  checkinPendentes: 2,
};

export async function getMenuCounters(): Promise<MenuCounters> {

  const supabase = await createClient();

  const [fila, pagamento, estoque, agendados] = await Promise.all([
    supabase
      .from("queue_entries")
      .select("*", { count: "exact", head: true })
      .eq("status", "aguardando"),
    // Prontos para pagamento na recepção (médico já finalizou o atendimento).
    supabase
      .from("queue_entries")
      .select("*", { count: "exact", head: true })
      .eq("status", "aguardando_pagamento"),
    // Saldo/mínimo crus: o "crítico" é derivado (saldo < mínimo*0.5).
    supabase.from("stock_products").select("quantity, min_quantity"),
    listAgendadosHoje(),
  ]);

  const filaAguardando = fila.count ?? 0;
  const aguardandoPagamento = pagamento.count ?? 0;
  const checkinPendentes = agendados.length;

  const produtos = (estoque.data ?? []) as {
    quantity: number | null;
    min_quantity: number | null;
  }[];
  const estoqueCriticos = produtos.filter((p) => {
    const saldo = Number(p.quantity ?? 0);
    const minimo = Number(p.min_quantity ?? 0);
    return minimo > 0 && saldo < minimo * 0.5;
  }).length;

  return { filaAguardando, aguardandoPagamento, estoqueCriticos, checkinPendentes };
}

// ════════════════════════════════════════════════════════════════
// Notificações do sino (Topbar) — pendências operacionais reais.
// Fonte real (banco), resiliente a erro (→ []). O gate por papel é feito
// no layout (canView do módulo de cada item). Demo → amostra estática.
// ════════════════════════════════════════════════════════════════
export type NotifTipo = "fila" | "estoque" | "fatura";
export type Notificacao = {
  id: string;
  tipo: NotifTipo;
  /** Módulo de origem → usado p/ gate de permissão e link. */
  module: ModuleSlug;
  titulo: string;
  descricao: string;
  href: string;
  severity: "danger" | "warn" | "info";
};

const DEMO_NOTIFICACOES: Notificacao[] = [
  {
    id: "demo-fila",
    tipo: "fila",
    module: "fila",
    titulo: "3 pacientes aguardando atendimento",
    descricao: "Fila de atendimento com pacientes na espera.",
    href: "/fila",
    severity: "info",
  },
  {
    id: "demo-estoque-1",
    tipo: "estoque",
    module: "estoque",
    titulo: "Dipirona 500mg — estoque crítico",
    descricao: "Saldo 4 un · mínimo 20 un.",
    href: "/estoque",
    severity: "danger",
  },
  {
    id: "demo-estoque-2",
    tipo: "estoque",
    module: "estoque",
    titulo: "Luva de procedimento M — estoque baixo",
    descricao: "Saldo 35 un · mínimo 50 un.",
    href: "/estoque",
    severity: "warn",
  },
  {
    id: "demo-fatura",
    tipo: "fatura",
    module: "faturamento",
    titulo: "Fatura NF-2026-014 vencendo",
    descricao: "Vence em 18/06/2026 · Convênio Unimed.",
    href: "/faturamento",
    severity: "warn",
  },
];

/** dd/mm/aaaa a partir de uma date (yyyy-mm-dd) sem fuso. */
function fmtDateBR(d: string): string {
  const [y, m, day] = d.split("-");
  return y && m && day ? `${day}/${m}/${y}` : d;
}

/**
 * Lista as notificações reais para o painel do sino:
 *  • estoque crítico (saldo < mínimo·0,5) e baixo (saldo < mínimo);
 *  • fila aguardando (resumo);
 *  • faturas (billable_events pendentes) vencendo em ≤7 dias ou vencidas.
 * Cada item carrega o `module` p/ o layout filtrar pelo papel (canView).
 */
export async function getNotificacoes(): Promise<Notificacao[]> {

  const supabase = await createClient();
  const notifs: Notificacao[] = [];

  // Janela de vencimento das faturas: hoje .. hoje+7 dias.
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const limite = new Date(hoje);
  limite.setDate(limite.getDate() + 7);
  const limiteISO = `${limite.getFullYear()}-${String(limite.getMonth() + 1).padStart(2, "0")}-${String(limite.getDate()).padStart(2, "0")}`;

  const [fila, estoque, faturas] = await Promise.all([
    supabase
      .from("queue_entries")
      .select("*", { count: "exact", head: true })
      .eq("status", "aguardando"),
    supabase
      .from("stock_products")
      .select("id, name, quantity, min_quantity"),
    supabase
      .from("billable_events")
      .select("id, code, nf_number, nf_due_date, status")
      .eq("status", "pendente")
      .not("nf_due_date", "is", null)
      .lte("nf_due_date", limiteISO)
      .order("nf_due_date", { ascending: true })
      .limit(5),
  ]);

  // Fila aguardando (resumo único).
  const filaAguardando = fila.count ?? 0;
  if (filaAguardando > 0) {
    notifs.push({
      id: "fila-aguardando",
      tipo: "fila",
      module: "fila",
      titulo: `${filaAguardando} ${filaAguardando === 1 ? "paciente aguardando" : "pacientes aguardando"} atendimento`,
      descricao: "Fila de atendimento com pacientes na espera.",
      href: "/fila",
      severity: "info",
    });
  }

  // Estoque crítico/baixo (itens nominais, prioriza críticos; até 6).
  const produtos = (estoque.data ?? []) as {
    id: string;
    name: string | null;
    quantity: number | null;
    min_quantity: number | null;
  }[];
  const itensEstoque = produtos
    .map((p): Notificacao | null => {
      const saldo = Number(p.quantity ?? 0);
      const minimo = Number(p.min_quantity ?? 0);
      if (minimo <= 0 || saldo >= minimo) return null;
      const critico = saldo < minimo * 0.5;
      return {
        id: `estoque-${p.id}`,
        tipo: "estoque" as const,
        module: "estoque" as ModuleSlug,
        titulo: `${p.name ?? "Item"} — estoque ${critico ? "crítico" : "baixo"}`,
        descricao: `Saldo ${saldo} · mínimo ${minimo}.`,
        href: "/estoque",
        severity: (critico ? "danger" : "warn") as "danger" | "warn",
      };
    })
    .filter((x): x is Notificacao => x !== null)
    .sort((a, b) => (a.severity === "danger" ? 0 : 1) - (b.severity === "danger" ? 0 : 1))
    .slice(0, 6);
  notifs.push(...itensEstoque);

  // Faturas vencendo / vencidas.
  for (const f of (faturas.data ?? []) as {
    id: string;
    code: string | null;
    nf_number: string | null;
    nf_due_date: string | null;
    status: string | null;
  }[]) {
    const due = f.nf_due_date as string;
    const vencida = due < `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}-${String(hoje.getDate()).padStart(2, "0")}`;
    notifs.push({
      id: `fatura-${f.id}`,
      tipo: "fatura",
      module: "faturamento",
      titulo: `Fatura ${f.nf_number ?? f.code ?? ""} ${vencida ? "vencida" : "vencendo"}`.trim(),
      descricao: vencida
        ? `Venceu em ${fmtDateBR(due)}.`
        : `Vence em ${fmtDateBR(due)}.`,
      href: "/faturamento",
      severity: vencida ? "danger" : "warn",
    });
  }

  return notifs;
}

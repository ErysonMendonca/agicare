import { createClient } from "@/lib/supabase/server";
import {
  type RelatoriosFiltros,
  buildBuckets,
  bucketOf,
  bucketWindow,
  professionalScope,
} from "@/lib/data/relatorios-filtros";

export type { RelatoriosFiltros };

// ════════════════════════════════════════════════════════════════
// Relatórios & BI — agregações para a tela /relatorios.
// Lê do Supabase quando configurado; cai para mock representativo no
// modo demo (mantendo os números que o Figma exibe, p/ não quebrar a tela).
//
// KPIs derivados do banco:
//   - Absenteísmo  = appointments 'faltou' / total (por mês)
//   - Novos Pac.   = patients.created_at no período (por mês)
//   - Retenção     = pacientes com ≥2 consultas / pacientes c/ consulta
//   - Atendimentos = volume de appointments por mês
//   - Receita      = soma de billable_events.amount por mês
//   - Ticket médio = receita / nº de eventos faturáveis
//   - Margem média = média de procedures.margin_pct
//   - Inadimplência= billable_events 'glosado' / total
//
// REPRESENTATIVO (documentado): "Tempo de Espera" — o schema não tem
// timestamp de chegada do paciente (appointments só tem starts_at/ends_at,
// que é o slot agendado, não chegada→início). Mantido representativo até
// existir uma coluna de check-in. A série de retenção também é representativa
// no formato, mas ancorada no valor real do período (ver retencaoSerie).
// ════════════════════════════════════════════════════════════════

/** KPI textual exibido nos cards (valor + variação vs. período anterior). */
export type Kpi = {
  value: string;
  change: string;
  positive: boolean;
};

export type RelatoriosData = {
  /** Rótulos do eixo X dos gráficos (7 meses). */
  meses: string[];

  // ── KPIs clínicos / epidemiológicos / LGPD ──
  absenteismo: Kpi;
  tempoEspera: Kpi;
  retencao: Kpi;
  novosPacientes: Kpi;

  // ── Séries dos gráficos (clínica) ──
  absenteismoSerie: number[]; // % no-show por mês
  tempoEsperaSerie: number[]; // minutos por mês (representativo)
  atendimentosSerie: number[]; // volume de consultas por mês
  retencaoSerie: number[]; // % retenção por mês

  // ── Financeiro (BI) — restrito ao gestor ──
  // SEGURANÇA/LGPD: para não-gestor estes campos saem como `null` e NÃO são
  // calculados nem serializados no payload do RSC (gate feito no servidor,
  // não apenas escondido no client). Ver getRelatoriosData(gestor).
  receitaMes: number | null; // R$ do mês corrente
  ticketMedio: number | null; // R$ médio por evento
  margemMedia: string | null; // ex.: "34%"
  inadimplencia: string | null; // ex.: "4%"
  receitaSerie: number[] | null; // R$ mil por mês
  ticketSerie: number[] | null; // R$ ticket médio por mês
};

/** Dados representativos do modo demo — espelham os literais do Figma. */
const DEMO: RelatoriosData = {
  meses: ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul"],
  absenteismo: { value: "9%", change: "3% vs. mês anterior", positive: false },
  tempoEspera: { value: "18min", change: "5min vs. semana anterior", positive: false },
  retencao: { value: "73%", change: "8% vs. semestre anterior", positive: true },
  novosPacientes: { value: "245", change: "12% vs. mês anterior", positive: true },
  absenteismoSerie: [11, 13, 7, 15, 5, 6, 8],
  tempoEsperaSerie: [27, 17, 21, 14, 20, 22, 13],
  atendimentosSerie: [120, 145, 132, 160, 175, 168, 190],
  retencaoSerie: [58, 61, 64, 66, 69, 71, 73],
  receitaMes: 184500,
  ticketMedio: 420,
  margemMedia: "34%",
  inadimplencia: "4%",
  receitaSerie: [120, 132, 145, 158, 166, 175, 184],
  ticketSerie: [380, 392, 401, 410, 415, 418, 420],
};

/** Campos financeiros anulados — payload entregue a não-gestor. */
const FINANCEIRO_NULO = {
  receitaMes: null,
  ticketMedio: null,
  margemMedia: null,
  inadimplencia: null,
  receitaSerie: null,
  ticketSerie: null,
} as const;

/** Variação (em pontos) entre os dois últimos pontos de uma série. */
function changePts(
  serie: number[],
  lowerIsBetter: boolean,
  unit = "%",
): { change: string; positive: boolean } {
  const curr = serie[serie.length - 1] ?? 0;
  const prev = serie[serie.length - 2] ?? curr;
  const delta = curr - prev;
  const positive = lowerIsBetter ? delta <= 0 : delta >= 0;
  return {
    change: `${Math.abs(delta)}${unit} vs. mês anterior`,
    positive,
  };
}

/**
 * Agrega todos os indicadores da tela de Relatórios.
 * DB quando configurado; mock representativo no modo demo.
 *
 * @param gestor  Quando `false`, os campos financeiros NÃO são consultados,
 *   calculados nem serializados — saem como `null`. O gate é no servidor:
 *   recepção/médico não recebem receita/ticket/margem/inadimplência no
 *   payload do RSC (LGPD/estratégico), não apenas escondidos no client.
 * @param filtros Período (de/ate) e recorte por especialidade/profissional.
 *   Período molda a janela mensal; especialidade/profissional restringem
 *   agendamentos e faturamento (métricas ancoradas em profissional). Novos
 *   pacientes seguem apenas o período (sem vínculo direto a profissional).
 */
export async function getRelatoriosData(
  gestor: boolean,
  filtros: RelatoriosFiltros = {},
): Promise<RelatoriosData> {

  const supabase = await createClient();
  const buckets = buildBuckets(filtros);
  const n = buckets.length;
  const { startIso: windowStart, endIso: windowEnd } = bucketWindow(buckets);

  // Recorte por especialidade/profissional → ids de profissionais. `null` =
  // sem filtro; `[]` = filtro ativo sem profissional correspondente (vazio).
  const scope = await professionalScope(supabase, filtros);

  // Agendamentos no período, opcionalmente restritos ao profissional/especialidade.
  let apptQ = supabase
    .from("appointments")
    .select("patient_id, status, starts_at")
    .gte("starts_at", windowStart)
    .lt("starts_at", windowEnd);
  if (scope) apptQ = apptQ.in("professional_id", scope);

  // Faturamento (billable_events) só para gestor; respeita o mesmo recorte.
  let billQ = gestor
    ? supabase
        .from("billable_events")
        .select("amount, status, created_at")
        .gte("created_at", windowStart)
        .lt("created_at", windowEnd)
    : null;
  if (billQ && scope) billQ = billQ.in("professional_id", scope);

  // Financeiro (billable_events/procedures) só é consultado para gestor —
  // assim os dados sensíveis nem chegam à camada de serialização.
  const [apptsRes, patsRes, billRes, procRes] = await Promise.all([
    apptQ,
    supabase
      .from("patients")
      .select("created_at")
      .gte("created_at", windowStart)
      .lt("created_at", windowEnd),
    billQ ?? Promise.resolve({ data: null }),
    gestor
      ? supabase.from("procedures").select("margin_pct")
      : Promise.resolve({ data: null }),
  ]);

  const appts = (apptsRes.data ?? []) as {
    patient_id: string | null;
    status: string;
    starts_at: string | null;
  }[];
  const pats = (patsRes.data ?? []) as { created_at: string | null }[];
  const bills = (billRes.data ?? []) as {
    amount: number | null;
    status: string | null;
    created_at: string | null;
  }[];
  const procs = (procRes.data ?? []) as { margin_pct: number | null }[];

  // ── Atendimentos + absenteísmo por mês ──
  const atendimentosSerie = Array(n).fill(0) as number[];
  const faltasSerie = Array(n).fill(0) as number[];
  const patientCounts = new Map<string, number>();

  for (const a of appts) {
    const i = bucketOf(buckets, a.starts_at);
    if (i < 0) continue;
    atendimentosSerie[i] += 1;
    if (a.status === "faltou") faltasSerie[i] += 1;
    if (a.patient_id) {
      patientCounts.set(a.patient_id, (patientCounts.get(a.patient_id) ?? 0) + 1);
    }
  }

  const absenteismoSerie = atendimentosSerie.map((tot, i) =>
    tot > 0 ? Math.round((faltasSerie[i] / tot) * 100) : 0,
  );
  const totalAppts = atendimentosSerie.reduce((s, v) => s + v, 0);
  const totalFaltas = faltasSerie.reduce((s, v) => s + v, 0);
  const absenteismoPct =
    totalAppts > 0 ? Math.round((totalFaltas / totalAppts) * 100) : 0;
  const absCh = changePts(absenteismoSerie, true);

  // ── Novos pacientes por mês ──
  const novosSerie = Array(n).fill(0) as number[];
  for (const p of pats) {
    const i = bucketOf(buckets, p.created_at);
    if (i >= 0) novosSerie[i] += 1;
  }
  const novosMes = novosSerie[n - 1] ?? 0;
  const novosPrev = novosSerie[n - 2] ?? novosMes;
  const novosDeltaPct =
    novosPrev > 0 ? Math.round(((novosMes - novosPrev) / novosPrev) * 100) : 0;

  // ── Retenção: pacientes com ≥2 consultas / pacientes com consulta ──
  let comConsulta = 0;
  let recorrentes = 0;
  for (const count of patientCounts.values()) {
    comConsulta += 1;
    if (count >= 2) recorrentes += 1;
  }
  const retencaoPct =
    comConsulta > 0 ? Math.round((recorrentes / comConsulta) * 100) : 0;
  // Série representativa no formato, ancorada no valor real do período
  // (histórico mensal de retenção exigiria janelas móveis pesadas).
  const retencaoSerie = buckets.map((_, i) =>
    Math.max(0, Math.round(retencaoPct - (n - 1 - i) * 2.5)),
  );

  // ── Financeiro (BI) — só calculado para gestor; null caso contrário. ──
  // SEGURANÇA/LGPD: não-gestor não tem estes valores nem no payload do RSC.
  const financeiro: {
    receitaMes: number | null;
    ticketMedio: number | null;
    margemMedia: string | null;
    inadimplencia: string | null;
    receitaSerie: number[] | null;
    ticketSerie: number[] | null;
  } = gestor
    ? (() => {
        // Receita + ticket por mês
        const receitaSerieReais = Array(n).fill(0) as number[];
        const eventosSerie = Array(n).fill(0) as number[];
        let glosados = 0;
        for (const b of bills) {
          const i = bucketOf(buckets, b.created_at);
          if (i < 0) continue;
          receitaSerieReais[i] += Number(b.amount ?? 0);
          eventosSerie[i] += 1;
          if (b.status === "glosado") glosados += 1;
        }
        const receitaSerie = receitaSerieReais.map((v) =>
          Math.round(v / 1000),
        ); // R$ mil
        const ticketSerie = receitaSerieReais.map((v, i) =>
          eventosSerie[i] > 0 ? Math.round(v / eventosSerie[i]) : 0,
        );
        const receitaMes = receitaSerieReais[n - 1] ?? 0;
        const totalEventos = eventosSerie.reduce((s, v) => s + v, 0);
        const totalReceita = receitaSerieReais.reduce((s, v) => s + v, 0);
        const ticketMedio =
          totalEventos > 0 ? Math.round(totalReceita / totalEventos) : 0;

        // Margem média (catálogo) + inadimplência (glosa)
        const margens = procs
          .map((p) => Number(p.margin_pct ?? 0))
          .filter((m) => m > 0);
        const margemMedia = margens.length
          ? `${Math.round(margens.reduce((s, v) => s + v, 0) / margens.length)}%`
          : "—";
        const inadimplencia =
          totalEventos > 0
            ? `${Math.round((glosados / totalEventos) * 100)}%`
            : "0%";

        return {
          receitaMes,
          ticketMedio,
          margemMedia,
          inadimplencia,
          receitaSerie,
          ticketSerie,
        };
      })()
    : { ...FINANCEIRO_NULO };

  return {
    meses: buckets.map((b) => b.label),
    absenteismo: {
      value: `${absenteismoPct}%`,
      change: absCh.change,
      positive: absCh.positive,
    },
    // Representativo: sem coluna de check-in (chegada) no schema atual.
    tempoEspera: {
      value: DEMO.tempoEspera.value,
      change: DEMO.tempoEspera.change,
      positive: DEMO.tempoEspera.positive,
    },
    retencao: {
      value: `${retencaoPct}%`,
      change: `${Math.abs(retencaoSerie[n - 1] - retencaoSerie[0])}% vs. semestre anterior`,
      positive: true,
    },
    novosPacientes: {
      value: String(novosMes),
      change: `${Math.abs(novosDeltaPct)}% vs. mês anterior`,
      positive: novosMes >= novosPrev,
    },
    absenteismoSerie,
    tempoEsperaSerie: DEMO.tempoEsperaSerie, // representativo (ver nota)
    atendimentosSerie,
    retencaoSerie,
    ...financeiro,
  };
}

// ════════════════════════════════════════════════════════════════
// Utilização das opções de atendimento (BI gerencial) — conta quantas
// vezes cada valor de cada categoria foi usado em attendance_records, no
// período (created_at). Serve para o gestor revisar/limpar opções.
// Escopo por clínica via RLS; respeita só o filtro de período (de/até).
// ════════════════════════════════════════════════════════════════

/** category (contrato 0050) → coluna em attendance_records. */
const UTILIZACAO_COLUNAS = {
  origem: "origem",
  medico: "medico",
  especialidade: "especialidade",
  encaminhamento: "encaminhamento",
  carater: "carater",
  procedencia: "procedencia",
  centro_custo: "centro_custo",
  convenio: "convenio",
  plano: "plano",
  parentesco: "resp_parentesco",
} as const;

export type UtilizacaoItem = { valor: string; count: number };
export type UtilizacaoAtendimentoBI = Record<string, UtilizacaoItem[]>;

const UTILIZACAO_DEMO: UtilizacaoAtendimentoBI = {
  origem: [
    { valor: "1 - RECEPÇÃO", count: 142 },
    { valor: "2 - PRONTO ATENDIMENTO", count: 87 },
    { valor: "3 - INTERNAÇÃO", count: 18 },
  ],
  convenio: [
    { valor: "SUS", count: 121 },
    { valor: "Unimed", count: 64 },
    { valor: "Particular", count: 41 },
  ],
  carater: [
    { valor: "eletivo", count: 168 },
    { valor: "urgencia", count: 79 },
  ],
};

/**
 * Agrega o uso de cada opção por categoria. Retorna, por categoria, a lista
 * de `{ valor, count }` ordenada do mais usado ao menos usado.
 * @param filtros Período (de/ate) recorta por created_at; demais campos ignorados.
 */
export async function getUtilizacaoAtendimentoBI(
  filtros: RelatoriosFiltros = {},
): Promise<UtilizacaoAtendimentoBI> {

  const supabase = await createClient();
  const colunas = Object.values(UTILIZACAO_COLUNAS);

  let q = supabase
    .from("attendance_records")
    .select(colunas.join(", "));
  if (filtros.de) q = q.gte("created_at", `${filtros.de}T00:00:00`);
  if (filtros.ate) q = q.lte("created_at", `${filtros.ate}T23:59:59`);

  const { data, error } = await q;
  if (error || !data) return {};

  const rows = data as unknown as Record<string, string | null>[];
  const out: UtilizacaoAtendimentoBI = {};

  for (const [categoria, coluna] of Object.entries(UTILIZACAO_COLUNAS)) {
    const counts = new Map<string, number>();
    for (const row of rows) {
      const v = row[coluna];
      if (!v) continue; // ignora null/vazio
      counts.set(v, (counts.get(v) ?? 0) + 1);
    }
    out[categoria] = [...counts.entries()]
      .map(([valor, count]) => ({ valor, count }))
      .sort((a, b) => b.count - a.count);
  }

  return out;
}

import { createClient } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/supabase/config";
import { getActiveClinicId } from "@/lib/tenant";
import {
  type RelatoriosFiltros,
  buildBuckets,
  bucketOf,
  bucketWindow,
  dateWindow,
  professionalScope,
} from "@/lib/data/relatorios-filtros";

// ════════════════════════════════════════════════════════════════
// Business Intelligence (escopo 14) — agregações complementares à tela
// /relatorios. Server-only. Lê do Supabase quando configurado; em modo
// demo devolve dados REPRESENTATIVOS (protótipo navegável), EXCETO o
// Tempo Médio de Espera, que é REAL: sem marcos de fila (called_at/
// started_at, migration 0029) → estado vazio HONESTO (nunca mock).
//
// Frentes:
//   A) Tempo Médio de Espera   → queue_entries (chegada → chamada/início)
//        A.2 por dia da semana · A.3 origem dos pacientes (ROI marketing)
//   B) Epidemiológico          → anamneses (jsonb) × patients
//   C) Financeiro (gestor)     → tiss_guides (convênio) + billable_events
//        (ticket/especialidade) + budgets (conversão de orçamentos)
// ════════════════════════════════════════════════════════════════

function ms(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? null : t;
}

// ════════════════════════════════════════════════════════════════
// A) Tempo Médio de Espera (REAL)
// ════════════════════════════════════════════════════════════════
export type TempoEsperaBI = {
  /** Há marcos suficientes para computar a espera? Se não → estado vazio honesto. */
  hasData: boolean;
  /** Média geral de espera no período (minutos). */
  mediaMin: number;
  /** Rótulos dos meses (eixo X). */
  meses: string[];
  /** Espera média por mês (minutos). */
  serieMin: number[];
  /** Nº de atendimentos com espera medida (chegada → chamada/início). */
  amostras: number;
};

/**
 * Tempo médio de espera = primeiro contato (called_at, senão started_at)
 * − chegada (arrived_at, senão created_at). Só conta intervalos plausíveis
 * (positivos e < 12h). Sem amostras (ou colunas 0029 ausentes) → hasData=false.
 */
export async function getTempoEsperaBI(
  filtros: RelatoriosFiltros = {},
): Promise<TempoEsperaBI> {
  const buckets = buildBuckets(filtros);
  const meses = buckets.map((b) => b.label);
  const vazio: TempoEsperaBI = {
    hasData: false,
    mediaMin: 0,
    meses,
    serieMin: Array(buckets.length).fill(0),
    amostras: 0,
  };

  // Tempo de espera é REAL: em demo não há fila persistida → vazio honesto.
  if (isDemoMode()) return vazio;

  const supabase = await createClient();
  const { startIso: windowStart, endIso: windowEnd } = bucketWindow(buckets);
  const scope = await professionalScope(supabase, filtros);

  // Se called_at/started_at não existirem (pré-0029), o select falha → vazio.
  let q = supabase
    .from("queue_entries")
    .select("arrived_at, called_at, started_at, created_at")
    .gte("created_at", windowStart)
    .lt("created_at", windowEnd);
  if (scope) q = q.in("professional_id", scope);
  const { data, error } = await q;

  if (error || !data) return vazio;

  const somaMin = Array(buckets.length).fill(0) as number[];
  const qtd = Array(buckets.length).fill(0) as number[];
  const LIMITE_MS = 12 * 60 * 60 * 1000; // descarta outliers (> 12h)

  for (const q of data as Array<{
    arrived_at: string | null;
    called_at: string | null;
    started_at: string | null;
    created_at: string | null;
  }>) {
    const chegada = ms(q.arrived_at) ?? ms(q.created_at);
    const contato = ms(q.called_at) ?? ms(q.started_at);
    if (chegada == null || contato == null) continue;
    const delta = contato - chegada;
    if (delta <= 0 || delta > LIMITE_MS) continue;
    const i = bucketOf(buckets, q.arrived_at ?? q.created_at);
    if (i < 0) continue;
    somaMin[i] += delta / 60000;
    qtd[i] += 1;
  }

  const serieMin = somaMin.map((s, i) => (qtd[i] > 0 ? Math.round(s / qtd[i]) : 0));
  const totalQtd = qtd.reduce((s, v) => s + v, 0);
  const totalMin = somaMin.reduce((s, v) => s + v, 0);

  if (totalQtd === 0) return vazio;

  return {
    hasData: true,
    mediaMin: Math.round(totalMin / totalQtd),
    meses,
    serieMin,
    amostras: totalQtd,
  };
}

// ════════════════════════════════════════════════════════════════
// A.2) Tempo Médio de Espera por DIA DA SEMANA (REAL)
// Mesma base honesta da série mensal (queue_entries: chegada → chamada/
// início), mas agregada por dia da semana — útil p/ dimensionar escala.
// ════════════════════════════════════════════════════════════════
export type TempoEsperaSemanaBI = {
  hasData: boolean;
  /** Rótulos dos dias (Seg…Dom). */
  dias: string[];
  /** Espera média por dia da semana (minutos). */
  serieMin: number[];
  /** Nº de atendimentos com espera medida. */
  amostras: number;
};

const DIAS_SEMANA = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

/** Converte Date.getDay() (0=Dom) para índice Seg…Dom (0=Seg, 6=Dom). */
function idxDiaSemana(d: Date): number {
  return (d.getDay() + 6) % 7;
}

export async function getTempoEsperaSemanaBI(
  filtros: RelatoriosFiltros = {},
): Promise<TempoEsperaSemanaBI> {
  const vazio: TempoEsperaSemanaBI = {
    hasData: false,
    dias: DIAS_SEMANA,
    serieMin: Array(7).fill(0),
    amostras: 0,
  };

  // Espera é REAL: em demo não há fila persistida → vazio honesto (nunca mock).
  if (isDemoMode()) return vazio;

  const supabase = await createClient();
  // Período explícito do filtro; sem filtro, janela de 90 dias (amostra/dia).
  const janela = dateWindow(filtros);
  const windowStart =
    janela?.startIso ??
    new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
  const scope = await professionalScope(supabase, filtros);

  let q = supabase
    .from("queue_entries")
    .select("arrived_at, called_at, started_at, created_at")
    .gte("created_at", windowStart);
  if (janela) q = q.lt("created_at", janela.endIso);
  if (scope) q = q.in("professional_id", scope);
  const { data, error } = await q;

  if (error || !data) return vazio;

  const soma = Array(7).fill(0) as number[];
  const qtd = Array(7).fill(0) as number[];
  const LIMITE_MS = 12 * 60 * 60 * 1000;

  for (const q of data as Array<{
    arrived_at: string | null;
    called_at: string | null;
    started_at: string | null;
    created_at: string | null;
  }>) {
    const chegadaIso = q.arrived_at ?? q.created_at;
    const chegada = ms(chegadaIso);
    const contato = ms(q.called_at) ?? ms(q.started_at);
    if (chegada == null || contato == null || chegadaIso == null) continue;
    const delta = contato - chegada;
    if (delta <= 0 || delta > LIMITE_MS) continue;
    const i = idxDiaSemana(new Date(chegadaIso));
    soma[i] += delta / 60000;
    qtd[i] += 1;
  }

  const serieMin = soma.map((s, i) => (qtd[i] > 0 ? Math.round(s / qtd[i]) : 0));
  const amostras = qtd.reduce((s, v) => s + v, 0);
  if (amostras === 0) return vazio;

  return { hasData: true, dias: DIAS_SEMANA, serieMin, amostras };
}

// ════════════════════════════════════════════════════════════════
// A.3) Origem dos Pacientes (ROI de marketing)
// Pizza por canal de captação (patients.origin). Aberto a staff —
// agregado, não-sensível. Real do banco; demo = representativo.
// ════════════════════════════════════════════════════════════════
export type OrigemFatia = { origem: string; total: number; pct: number };
export type OrigemPacientesBI = {
  hasData: boolean;
  total: number;
  fatias: OrigemFatia[];
};

const DEMO_ORIGEM: OrigemPacientesBI = {
  hasData: true,
  total: 240,
  fatias: [
    { origem: "Indicação", total: 86, pct: 36 },
    { origem: "Instagram", total: 58, pct: 24 },
    { origem: "Google", total: 41, pct: 17 },
    { origem: "Convênio", total: 31, pct: 13 },
    { origem: "Passante", total: 24, pct: 10 },
  ],
};

export async function getOrigemPacientesBI(
  filtros: RelatoriosFiltros = {},
): Promise<OrigemPacientesBI> {
  if (isDemoMode()) return DEMO_ORIGEM;

  const supabase = await createClient();
  // Origem não tem vínculo com profissional → respeita só o período (quando
  // informado); sem filtro, agrega todo o histórico de captação.
  const janela = dateWindow(filtros);
  let q = supabase.from("patients").select("origin");
  if (janela) {
    q = q.gte("created_at", janela.startIso).lt("created_at", janela.endIso);
  }
  const { data, error } = await q;

  if (error || !data) return { hasData: false, total: 0, fatias: [] };

  const cont = new Map<string, number>();
  for (const p of data as Array<{ origin: string | null }>) {
    const canal = p.origin?.trim() || "Não informado";
    cont.set(canal, (cont.get(canal) ?? 0) + 1);
  }

  const total = [...cont.values()].reduce((s, v) => s + v, 0);
  const fatias = [...cont.entries()]
    .map(([origem, tot]) => ({
      origem,
      total: tot,
      pct: total > 0 ? Math.round((tot / total) * 100) : 0,
    }))
    .sort((a, b) => b.total - a.total);

  // hasData só quando há ao menos um canal informado (não só "Não informado").
  const temCanal = fatias.some((f) => f.origem !== "Não informado");
  return { hasData: total > 0 && temCanal, total, fatias };
}

// ════════════════════════════════════════════════════════════════
// A.4) Tempo Médio de Espera REAL via AGENDA (appointments.check_in)
//
// Fonte alternativa/complementar à fila (queue_entries): a coluna
// `appointments.check_in` (migration 0047) carimba a chegada/check-in
// REAL do paciente direto no agendamento — permite medir espera por
// período/profissional/clínica sem depender da fila do totem.
//
// ESCOLHA CLÍNICA da métrica: appointments NÃO tem timestamp de "atendimento
// iniciado". O marco confiável é o horário AGENDADO (starts_at). Definimos
//   espera = starts_at − check_in
// ou seja, o tempo de sala de espera de quem chegou ANTES do horário marcado,
// assumindo atendimento pontual (paciente chega no check_in e é atendido no
// horário agendado). Contamos apenas deltas positivos (check_in ≤ starts_at)
// e plausíveis (< 12h); chegadas atrasadas (delta ≤ 0) não representam espera
// e são descartadas. Para a espera OPERACIONAL chegada→chamada use a série de
// queue_entries (getTempoEsperaBI).
//
// DEFENSIVA: se a coluna check_in ainda não existir em runtime (0047 não
// aplicada), o select falha → estado vazio honesto (hasData=false), sem
// quebrar build/type-check nem a tela. Espera é REAL → demo = vazio honesto.
// ════════════════════════════════════════════════════════════════

/**
 * Tempo médio de espera REAL derivado da agenda: média de
 * (starts_at − check_in) por mês, escopado por clinic_id + período + filtro de
 * profissional. Sem amostras (ou coluna 0047 ausente) → hasData=false.
 */
export async function getTempoEsperaAgendaBI(
  filtros: RelatoriosFiltros = {},
): Promise<TempoEsperaBI> {
  const buckets = buildBuckets(filtros);
  const meses = buckets.map((b) => b.label);
  const vazio: TempoEsperaBI = {
    hasData: false,
    mediaMin: 0,
    meses,
    serieMin: Array(buckets.length).fill(0),
    amostras: 0,
  };

  // Espera é REAL: em demo não há agenda persistida → vazio honesto (nunca mock).
  if (isDemoMode()) return vazio;

  // Escopo de tenant EXPLÍCITO (defense-in-depth, além da RLS). Sem clínica
  // ativa, a RLS já negaria — devolvemos vazio honesto sem consultar.
  const clinicId = await getActiveClinicId();
  if (!clinicId) return vazio;

  const supabase = await createClient();
  const { startIso: windowStart, endIso: windowEnd } = bucketWindow(buckets);
  const scope = await professionalScope(supabase, filtros);

  // Se check_in não existir (pré-0047), o select falha → vazio honesto.
  let q = supabase
    .from("appointments")
    .select("starts_at, check_in")
    .eq("clinic_id", clinicId)
    .not("check_in", "is", null)
    .gte("starts_at", windowStart)
    .lt("starts_at", windowEnd);
  if (scope) q = q.in("professional_id", scope);
  const { data, error } = await q;

  if (error || !data) return vazio;

  const somaMin = Array(buckets.length).fill(0) as number[];
  const qtd = Array(buckets.length).fill(0) as number[];
  const LIMITE_MS = 12 * 60 * 60 * 1000; // descarta outliers (> 12h)

  for (const a of data as Array<{
    starts_at: string | null;
    check_in: string | null;
  }>) {
    const agendado = ms(a.starts_at);
    const chegada = ms(a.check_in);
    if (agendado == null || chegada == null) continue;
    const delta = agendado - chegada; // espera de quem chegou antes do horário
    if (delta <= 0 || delta > LIMITE_MS) continue;
    const i = bucketOf(buckets, a.starts_at);
    if (i < 0) continue;
    somaMin[i] += delta / 60000;
    qtd[i] += 1;
  }

  const serieMin = somaMin.map((s, i) => (qtd[i] > 0 ? Math.round(s / qtd[i]) : 0));
  const totalQtd = qtd.reduce((s, v) => s + v, 0);
  const totalMin = somaMin.reduce((s, v) => s + v, 0);

  if (totalQtd === 0) return vazio;

  return {
    hasData: true,
    mediaMin: Math.round(totalMin / totalQtd),
    meses,
    serieMin,
    amostras: totalQtd,
  };
}

// ════════════════════════════════════════════════════════════════
// B) Epidemiológico
// ════════════════════════════════════════════════════════════════
export type AltoRiscoPaciente = {
  paciente: string;
  condicoes: string[];
  especialidade: string;
};
export type AlertaAlergia = {
  paciente: string;
  alergia: string;
  especialidade: string;
};
export type PatologiaStat = { patologia: string; total: number };

export type EpidemiologicoBI = {
  altoRisco: AltoRiscoPaciente[];
  alertasAlergia: AlertaAlergia[];
  patologias: PatologiaStat[];
};

const DEMO_EPIDEMIO: EpidemiologicoBI = {
  altoRisco: [
    {
      paciente: "Maria Silva Santos",
      condicoes: ["Diabetes", "Pré-diabético (risco podológico)"],
      especialidade: "Podológico",
    },
    {
      paciente: "João Pedro Oliveira",
      condicoes: ["Hipertensão"],
      especialidade: "Clínica Geral",
    },
  ],
  alertasAlergia: [
    { paciente: "Ana Beatriz Costa", alergia: "Penicilina", especialidade: "Clínica Geral" },
    { paciente: "Carlos Eduardo Lima", alergia: "Dipirona", especialidade: "Odontológico" },
  ],
  patologias: [
    { patologia: "Hipertensão", total: 14 },
    { patologia: "Diabetes", total: 9 },
    { patologia: "Dislipidemia", total: 6 },
    { patologia: "Asma", total: 4 },
  ],
};

/** Palavras que marcam paciente crônico / alto risco em campos da anamnese. */
const CRONICAS = [
  "diabetes",
  "hipertens",
  "cardiopat",
  "dpoc",
  "asma",
  "renal",
  "oncolog",
  "imunossupr",
  "pré-diab",
  "pre-diab",
];

/** Normaliza um valor jsonb (string/array/bool) em lista de rótulos textuais. */
function valoresTexto(v: unknown): string[] {
  if (v == null) return [];
  if (Array.isArray(v)) return v.flatMap(valoresTexto);
  if (typeof v === "string") return v.trim() ? [v.trim()] : [];
  if (typeof v === "boolean") return v ? ["sim"] : [];
  if (typeof v === "number") return [String(v)];
  return [];
}

const NEG_ALERGIA = ["nenhuma", "nega", "não", "nao", "sem alergia", "—", "n/a", "-"];

/**
 * Epidemiologia a partir das anamneses (fields jsonb) cruzadas com o paciente:
 *   • Alto Risco       → condições crônicas/pré-diabéticas detectadas
 *   • Alertas Alergia  → alergias declaradas (× especialidade da ficha)
 *   • Patologias       → contagem de condições mais frequentes
 */
export async function getEpidemiologicoBI(
  filtros: RelatoriosFiltros = {},
): Promise<EpidemiologicoBI> {
  if (isDemoMode()) return DEMO_EPIDEMIO;

  const supabase = await createClient();
  // Epidemiologia recorta por especialidade da ficha e período (created_at).
  // Filtro por profissional não se aplica (anamnese é indexada por paciente/
  // especialidade, não por profissional) — documentado.
  const janela = dateWindow(filtros);
  let q = supabase
    .from("anamneses")
    .select("specialty, fields, patients(full_name)")
    .order("created_at", { ascending: false })
    .limit(500);
  if (filtros.especialidade) q = q.eq("specialty", filtros.especialidade);
  if (janela) {
    q = q.gte("created_at", janela.startIso).lt("created_at", janela.endIso);
  }
  const { data, error } = await q;

  if (error || !data) {
    return { altoRisco: [], alertasAlergia: [], patologias: [] };
  }

  const altoRiscoMap = new Map<string, AltoRiscoPaciente>();
  const alertas: AlertaAlergia[] = [];
  const patologiaCount = new Map<string, number>();

  for (const a of data as Array<{
    specialty: string | null;
    fields: Record<string, unknown> | null;
    patients: { full_name: string | null } | { full_name: string | null }[] | null;
  }>) {
    const pacRel = Array.isArray(a.patients) ? a.patients[0] : a.patients;
    const paciente = pacRel?.full_name ?? "—";
    const especialidade = a.specialty ?? "—";
    const fields = a.fields ?? {};

    // Reúne todos os rótulos textuais dos campos para varredura de patologias.
    const todosRotulos: string[] = [];
    const condicoes = new Set<string>();

    for (const [chave, valor] of Object.entries(fields)) {
      const rotulos = valoresTexto(valor);
      const chaveLower = chave.toLowerCase();

      // Alergias: campo cujo nome contém "alerg" e valor não-negativo.
      if (chaveLower.includes("alerg")) {
        for (const r of rotulos) {
          if (!NEG_ALERGIA.some((neg) => r.toLowerCase().includes(neg))) {
            alertas.push({ paciente, alergia: r, especialidade });
          }
        }
        continue;
      }

      // Flag booleana de risco (ex.: podo_risco_pre_diabetico = true).
      if (
        (chaveLower.includes("risco") || chaveLower.includes("diab")) &&
        valor === true
      ) {
        condicoes.add(chave.replace(/_/g, " "));
      }

      todosRotulos.push(...rotulos);
    }

    // Condições crônicas detectadas nos rótulos (doenças sistêmicas etc.).
    for (const r of todosRotulos) {
      const rl = r.toLowerCase();
      if (CRONICAS.some((c) => rl.includes(c))) {
        condicoes.add(r);
        patologiaCount.set(r, (patologiaCount.get(r) ?? 0) + 1);
      }
    }

    if (condicoes.size > 0) {
      const existente = altoRiscoMap.get(paciente);
      const merged = new Set([...(existente?.condicoes ?? []), ...condicoes]);
      altoRiscoMap.set(paciente, {
        paciente,
        condicoes: [...merged],
        especialidade,
      });
    }
  }

  const patologias = [...patologiaCount.entries()]
    .map(([patologia, total]) => ({ patologia, total }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 12);

  return {
    altoRisco: [...altoRiscoMap.values()],
    alertasAlergia: alertas.slice(0, 50),
    patologias,
  };
}

// ════════════════════════════════════════════════════════════════
// C) Financeiro (restrito ao gestor)
// ════════════════════════════════════════════════════════════════
export type ConvenioDesempenho = {
  convenio: string;
  guias: number;
  glosadas: number;
  glosaPct: number;
  valorTotal: number;
  valorGlosado: number;
  /** Dias médios entre emissão e conciliação (null = sem guia conciliada). */
  tempoMedioRecebimentoDias: number | null;
};

export type ConversaoOrcamento = {
  total: number;
  proposto: number;
  aprovado: number;
  recusado: number;
  /** Valor total orçado (R$, todos os status). */
  valorTotal: number;
  /** Valor total aprovado (R$). */
  valorAprovado: number;
  /** % de orçamentos aprovados sobre o total. */
  taxaConversaoPct: number;
};

export type TicketEspecialidade = {
  especialidade: string;
  eventos: number;
  valorTotal: number;
  ticketMedio: number;
};

export type FinanceiroBI = {
  convenios: ConvenioDesempenho[];
  conversao: ConversaoOrcamento;
  ticketPorEspecialidade: TicketEspecialidade[];
};

const DEMO_FINANCEIRO: FinanceiroBI = {
  convenios: [
    { convenio: "Unimed", guias: 42, glosadas: 3, glosaPct: 7, valorTotal: 86400, valorGlosado: 4200, tempoMedioRecebimentoDias: 28 },
    { convenio: "Bradesco Saúde", guias: 31, glosadas: 2, glosaPct: 6, valorTotal: 62100, valorGlosado: 2900, tempoMedioRecebimentoDias: 35 },
    { convenio: "SulAmérica", guias: 18, glosadas: 4, glosaPct: 22, valorTotal: 33800, valorGlosado: 7100, tempoMedioRecebimentoDias: 41 },
  ],
  conversao: {
    total: 64,
    proposto: 18,
    aprovado: 34,
    recusado: 12,
    valorTotal: 412000,
    valorAprovado: 248000,
    taxaConversaoPct: 53,
  },
  ticketPorEspecialidade: [
    { especialidade: "Clínica Geral", eventos: 86, valorTotal: 36120, ticketMedio: 420 },
    { especialidade: "Cardiologia", eventos: 42, valorTotal: 25200, ticketMedio: 600 },
    { especialidade: "Odontológico", eventos: 31, valorTotal: 17050, ticketMedio: 550 },
    { especialidade: "Podológico", eventos: 24, valorTotal: 8400, ticketMedio: 350 },
  ],
};

/**
 * Desempenho por convênio (glosa + tempo médio de recebimento) a partir das
 * guias TISS, ticket médio por especialidade (billable_events × especialidade
 * do profissional) e conversão de orçamentos clínicos (budgets). Só calculado
 * para gestor (gate de servidor — LGPD/estratégico).
 */
export async function getFinanceiroBI(
  gestor: boolean,
  filtros: RelatoriosFiltros = {},
): Promise<FinanceiroBI | null> {
  if (!gestor) return null; // gate de servidor (LGPD/estratégico)
  if (isDemoMode()) return DEMO_FINANCEIRO;

  const supabase = await createClient();
  const janela = dateWindow(filtros);
  const scope = await professionalScope(supabase, filtros);

  // Guias TISS recortadas por período (não têm vínculo direto a profissional).
  let guiasQ = supabase
    .from("tiss_guides")
    .select("insurance, amount, status, glosa_amount, created_at, reconciled_at");
  if (janela) {
    guiasQ = guiasQ
      .gte("created_at", janela.startIso)
      .lt("created_at", janela.endIso);
  }

  // Ticket por especialidade: respeita período e recorte por profissional.
  let eventosQ = supabase
    .from("billable_events")
    .select("amount, created_at, professionals(specialty)");
  if (janela) {
    eventosQ = eventosQ
      .gte("created_at", janela.startIso)
      .lt("created_at", janela.endIso);
  }
  if (scope) eventosQ = eventosQ.in("professional_id", scope);

  const [guiasRes, budgetsRes, eventosRes] = await Promise.all([
    guiasQ,
    // Orçamentos: conversão é métrica de catálogo comercial (sem recorte por
    // profissional); mantida íntegra para refletir o funil completo.
    supabase.from("budgets").select("status, amount"),
    eventosQ,
  ]);

  // ── Convênios ──
  type Acc = {
    guias: number;
    glosadas: number;
    valorTotal: number;
    valorGlosado: number;
    diasSoma: number;
    diasQtd: number;
  };
  const porConvenio = new Map<string, Acc>();

  for (const g of (guiasRes.data ?? []) as Array<{
    insurance: string | null;
    amount: number | null;
    status: string | null;
    glosa_amount: number | null;
    created_at: string | null;
    reconciled_at: string | null;
  }>) {
    const conv = g.insurance?.trim() || "Sem convênio";
    const acc = porConvenio.get(conv) ?? {
      guias: 0,
      glosadas: 0,
      valorTotal: 0,
      valorGlosado: 0,
      diasSoma: 0,
      diasQtd: 0,
    };
    acc.guias += 1;
    acc.valorTotal += Number(g.amount ?? 0);
    const glosa = Number(g.glosa_amount ?? 0);
    const glosada = glosa > 0 || g.status === "erro";
    if (glosada) {
      acc.glosadas += 1;
      acc.valorGlosado += glosa;
    }
    const emit = ms(g.created_at);
    const recon = ms(g.reconciled_at);
    if (emit != null && recon != null && recon >= emit) {
      acc.diasSoma += (recon - emit) / (24 * 60 * 60 * 1000);
      acc.diasQtd += 1;
    }
    porConvenio.set(conv, acc);
  }

  const convenios: ConvenioDesempenho[] = [...porConvenio.entries()]
    .map(([convenio, a]) => ({
      convenio,
      guias: a.guias,
      glosadas: a.glosadas,
      glosaPct: a.guias > 0 ? Math.round((a.glosadas / a.guias) * 100) : 0,
      valorTotal: Math.round(a.valorTotal),
      valorGlosado: Math.round(a.valorGlosado),
      tempoMedioRecebimentoDias:
        a.diasQtd > 0 ? Math.round(a.diasSoma / a.diasQtd) : null,
    }))
    .sort((a, b) => b.valorTotal - a.valorTotal);

  // ── Conversão de orçamentos clínicos (budgets) ──
  const conv = { proposto: 0, aprovado: 0, recusado: 0 };
  let valorTotal = 0;
  let valorAprovado = 0;
  for (const b of (budgetsRes.data ?? []) as Array<{
    status: string | null;
    amount: number | null;
  }>) {
    const s = (b.status ?? "proposto") as keyof typeof conv;
    const valor = Number(b.amount ?? 0);
    valorTotal += valor;
    if (s in conv) conv[s] += 1;
    if (s === "aprovado") valorAprovado += valor;
  }
  const totalOrc = conv.proposto + conv.aprovado + conv.recusado;

  // ── Ticket médio por especialidade (billable_events × profissional) ──
  type TAcc = { eventos: number; valorTotal: number };
  const porEsp = new Map<string, TAcc>();
  for (const e of (eventosRes.data ?? []) as Array<{
    amount: number | null;
    professionals:
      | { specialty: string | null }
      | { specialty: string | null }[]
      | null;
  }>) {
    const profRel = Array.isArray(e.professionals)
      ? e.professionals[0]
      : e.professionals;
    const esp = profRel?.specialty?.trim() || "Sem especialidade";
    const acc = porEsp.get(esp) ?? { eventos: 0, valorTotal: 0 };
    acc.eventos += 1;
    acc.valorTotal += Number(e.amount ?? 0);
    porEsp.set(esp, acc);
  }
  const ticketPorEspecialidade: TicketEspecialidade[] = [...porEsp.entries()]
    .map(([especialidade, a]) => ({
      especialidade,
      eventos: a.eventos,
      valorTotal: Math.round(a.valorTotal),
      ticketMedio: a.eventos > 0 ? Math.round(a.valorTotal / a.eventos) : 0,
    }))
    .sort((a, b) => b.valorTotal - a.valorTotal);

  return {
    convenios,
    conversao: {
      total: totalOrc,
      proposto: conv.proposto,
      aprovado: conv.aprovado,
      recusado: conv.recusado,
      valorTotal: Math.round(valorTotal),
      valorAprovado: Math.round(valorAprovado),
      taxaConversaoPct: totalOrc > 0 ? Math.round((conv.aprovado / totalOrc) * 100) : 0,
    },
    ticketPorEspecialidade,
  };
}

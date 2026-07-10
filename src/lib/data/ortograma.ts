import { createClient } from "@/lib/supabase/server";
import { getActiveClinicId } from "@/lib/tenant";
import { MARCACOES, denteValido, type Marca, type Marcacao } from "@/lib/clinico/ortograma.shared";

/**
 * Leitura do ortograma (odontograma). Server-only.
 *
 * O escopo por clínica é EXPLÍCITO (`clinic_id` da clínica ativa) — a RLS da
 * 0103 é a segunda camada, não a única. Nunca aceita clinic_id de fora.
 *
 * As regras do domínio (dentes válidos, marcações) vivem em
 * `ortograma.shared.ts`; aqui só se lê e se filtra o que o banco devolve.
 */

export type OrtogramaAtual = {
  id: string;
  notes: string;
  marcas: Marca[];
  professionalName: string;
  createdAt: string;
  /** Carimbo usado como trava otimista no salvamento (ver `salvarOrtograma`). */
  updatedAt: string;
  /** Atendimento a que este ortograma pertence (null = registro avulso). */
  queueEntryId: string | null;
};

export type OrtogramaResumo = {
  id: string;
  createdAt: string;
  professionalName: string;
  /** Total de marcações (não de dentes marcados). */
  totalMarcas: number;
};

/** Nome do profissional vindo do join aninhado (Supabase devolve objeto ou array). */
function nomeProfissional(prof: unknown): string {
  const p = Array.isArray(prof) ? prof[0] : prof;
  const profile = p as { profiles?: unknown } | null | undefined;
  const pf = Array.isArray(profile?.profiles) ? profile?.profiles[0] : profile?.profiles;
  const nome = (pf as { full_name?: string | null } | null | undefined)?.full_name;
  return nome ?? "—";
}

/**
 * Descarta linhas que o banco tenha guardado fora do domínio (dente inválido,
 * marcação desconhecida por ser `text` na tabela). Defensivo: a UI assume
 * `Marcacao`, então nada que não seja `Marcacao` pode escapar daqui.
 */
function toMarca(row: { tooth: number | null; marking: string | null; note: string | null }): Marca | null {
  const tooth = Number(row.tooth);
  const marking = row.marking as Marcacao;
  if (!Number.isFinite(tooth) || !denteValido(tooth)) return null;
  if (!MARCACOES.includes(marking)) return null;
  return { tooth, marking, note: row.note };
}

/** Ortograma mais recente do paciente na clínica ativa, com as marcas. */
export async function getOrtogramaAtual(patientId: string): Promise<OrtogramaAtual | null> {
  const clinicId = await getActiveClinicId();
  if (!clinicId) return null;

  const supabase = await createClient();
  const { data: chart, error } = await supabase
    .from("dental_charts")
    .select(
      "id, notes, created_at, updated_at, queue_entry_id, professionals(profiles(full_name))",
    )
    .eq("clinic_id", clinicId)
    .eq("patient_id", patientId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !chart) return null;

  const { data: marks } = await supabase
    .from("dental_chart_marks")
    .select("tooth, marking, note")
    .eq("chart_id", chart.id as string)
    .order("tooth", { ascending: true });

  const marcas = (marks ?? [])
    .map((m) => toMarca(m as { tooth: number | null; marking: string | null; note: string | null }))
    .filter((m): m is Marca => m !== null);

  return {
    id: chart.id as string,
    notes: (chart.notes as string | null) ?? "",
    marcas,
    professionalName: nomeProfissional(chart.professionals),
    createdAt: (chart.created_at as string | null) ?? "",
    updatedAt: (chart.updated_at as string | null) ?? "",
    queueEntryId: (chart.queue_entry_id as string | null) ?? null,
  };
}

/**
 * Um ortograma específico do histórico, para leitura. O id vem do client, então
 * a consulta é escopada por clínica ativa E paciente: um chart de outra clínica
 * (ou de outro paciente) simplesmente não é encontrado.
 */
export async function getOrtogramaPorId(
  patientId: string,
  chartId: string,
): Promise<OrtogramaAtual | null> {
  const clinicId = await getActiveClinicId();
  if (!clinicId) return null;

  const supabase = await createClient();
  const { data: chart, error } = await supabase
    .from("dental_charts")
    .select(
      "id, notes, created_at, updated_at, queue_entry_id, professionals(profiles(full_name))",
    )
    .eq("id", chartId)
    .eq("clinic_id", clinicId)
    .eq("patient_id", patientId)
    .maybeSingle();

  if (error || !chart) return null;

  const { data: marks } = await supabase
    .from("dental_chart_marks")
    .select("tooth, marking, note")
    .eq("chart_id", chart.id as string)
    .order("tooth", { ascending: true });

  const marcas = (marks ?? [])
    .map((m) => toMarca(m as { tooth: number | null; marking: string | null; note: string | null }))
    .filter((m): m is Marca => m !== null);

  return {
    id: chart.id as string,
    notes: (chart.notes as string | null) ?? "",
    marcas,
    professionalName: nomeProfissional(chart.professionals),
    createdAt: (chart.created_at as string | null) ?? "",
    updatedAt: (chart.updated_at as string | null) ?? "",
    queueEntryId: (chart.queue_entry_id as string | null) ?? null,
  };
}

/**
 * Estado inicial da tela, com a regra de "um ortograma por atendimento":
 *
 *  • Se o atendimento em curso já tem ortograma, é ele que se edita.
 *  • Se não tem, começa um NOVO (chartId null) — mas pré-carregado com as
 *    marcas do último ortograma do paciente, porque o dentista parte do estado
 *    dentário conhecido, não de uma boca vazia. Salvar cria uma versão nova e
 *    preserva a anterior, que continua acessível pelo histórico.
 *
 * `notes` NÃO é herdado: a observação livre é daquela consulta.
 */
export async function getOrtogramaDoAtendimento(
  patientId: string,
  queueEntryId: string | null,
): Promise<{ atual: OrtogramaAtual | null; herdadoDe: OrtogramaAtual | null }> {
  const ultimo = await getOrtogramaAtual(patientId);

  // Sem atendimento em curso: edita o mais recente (registro avulso/revisão).
  if (!queueEntryId) return { atual: ultimo, herdadoDe: null };

  if (ultimo && ultimo.queueEntryId === queueEntryId) {
    return { atual: ultimo, herdadoDe: null };
  }
  return { atual: null, herdadoDe: ultimo };
}

/**
 * Histórico resumido dos ortogramas do paciente (mais recente primeiro), para
 * o dentista abrir versões anteriores. O total de marcas vem de uma única
 * consulta às marcas dos charts listados (evita N+1).
 */
export async function listOrtogramas(patientId: string): Promise<OrtogramaResumo[]> {
  const clinicId = await getActiveClinicId();
  if (!clinicId) return [];

  const supabase = await createClient();
  const { data: charts, error } = await supabase
    .from("dental_charts")
    .select("id, created_at, professionals(profiles(full_name))")
    .eq("clinic_id", clinicId)
    .eq("patient_id", patientId)
    .order("created_at", { ascending: false });

  if (error || !charts || charts.length === 0) return [];

  const ids = charts.map((c) => c.id as string);
  const { data: marks } = await supabase
    .from("dental_chart_marks")
    .select("chart_id")
    .in("chart_id", ids);

  const totais = new Map<string, number>();
  for (const m of marks ?? []) {
    const id = m.chart_id as string;
    totais.set(id, (totais.get(id) ?? 0) + 1);
  }

  return charts.map((c) => ({
    id: c.id as string,
    createdAt: (c.created_at as string | null) ?? "",
    professionalName: nomeProfissional(c.professionals),
    totalMarcas: totais.get(c.id as string) ?? 0,
  }));
}

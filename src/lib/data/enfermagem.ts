import { createClient } from "@/lib/supabase/server";
import { type Status } from "@/components/ui/Badge";

// ── Helpers de formatação ───────────────────────────────────────────
function fmtDataHora(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${d.toLocaleDateString("pt-BR")} ${d.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

function fmtHora(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

/** Resolve um join PostgREST que pode vir como objeto ou array. */
function one<T>(rel: T | T[] | null | undefined): T | undefined {
  return Array.isArray(rel) ? rel[0] : (rel ?? undefined);
}

/** Par rótulo→valor de sinal vital extra (ex.: "Perímetro cefálico" → "34 cm"). */
export type SinalExtra = { label: string; value: string };

/** Converte o jsonb `extra` (objeto chave→valor) em lista de pares. */
function parseExtra(raw: unknown): SinalExtra[] {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
  return Object.entries(raw as Record<string, unknown>)
    .filter(
      ([label, value]) =>
        label.trim() !== "" && value != null && String(value).trim() !== "",
    )
    .map(([label, value]) => ({ label, value: String(value) }));
}

// ════════════════════════════════════════════════════════════════════
// Aférição de Sinais Vitais (reutiliza vital_signs da 0004)
// ════════════════════════════════════════════════════════════════════
export type SinalVital = {
  id: string;
  paciente: string;
  registradoEm: string;
  pa: string;
  fc: string;
  fr: string;
  temp: string;
  spo2: string;
  hgt: string;
  profissional: string;
  observacoes: string;
  /** Sinais vitais extras aferidos (opcional). */
  extras: SinalExtra[];
};

export async function listSinaisVitais(
  patientId: string,
): Promise<SinalVital[]> {

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("vital_signs")
    .select(
      "*, patients(full_name), profiles(full_name)",
    )
    .eq("patient_id", patientId)
    .order("recorded_at", { ascending: false })
    .limit(50);

  if (error || !data) return [];

  return data.map((v) => {
    const pac = one(v.patients as { full_name: string | null } | null);
    const prof = one(v.profiles as { full_name: string | null } | null);
    return {
      id: v.id as string,
      paciente: pac?.full_name ?? "—",
      registradoEm: fmtDataHora(v.recorded_at as string | null),
      pa:
        v.systolic && v.diastolic
          ? `${v.systolic}/${v.diastolic} mmHg`
          : "—",
      fc: v.heart_rate ? `${v.heart_rate} bpm` : "—",
      fr: v.resp_rate ? `${v.resp_rate} irpm` : "—",
      temp: v.temperature ? `${v.temperature} °C` : "—",
      spo2: v.spo2 ? `${v.spo2} %` : "—",
      hgt: v.glucose ? `${v.glucose} mg/dL` : "—",
      profissional: prof?.full_name ?? "—",
      observacoes: (v.notes as string | null) ?? "—",
      extras: parseExtra(v.extra),
    };
  });
}

// ════════════════════════════════════════════════════════════════════
// Anotação de Enfermagem
// ════════════════════════════════════════════════════════════════════
export type AnotacaoEnfermagem = {
  id: string;
  codigo: string;
  paciente: string;
  profissional: string;
  data: string;
  conteudo: string;
  /** Nº do atendimento (queue_entries.attendance_code); null = legado/sem vínculo. */
  atendimentoCodigo: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
};

export async function listAnotacoes(
  patientId: string,
): Promise<AnotacaoEnfermagem[]> {

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("nursing_notes")
    .select("*, patients(full_name), queue_entries(attendance_code)")
    .eq("patient_id", patientId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error || !data) return [];

  return data.map((n) => {
    const pac = one(n.patients as { full_name: string | null } | null);
    const qe = one(n.queue_entries as { attendance_code: string | null } | null);
    return {
      id: n.id as string,
      codigo: (n.code as string | null) ?? "—",
      paciente: pac?.full_name ?? "—",
      profissional: (n.professional_name as string | null) ?? "—",
      data: fmtDataHora(n.created_at as string | null),
      conteudo: (n.content as string | null) ?? "",
      atendimentoCodigo: (qe?.attendance_code as string | null) ?? null,
      cancelledAt: (n.cancelled_at as string | null) ?? null,
      cancelReason: (n.cancel_reason as string | null) ?? null,
    };
  });
}

/** Próximo código sequencial ANO-NNN (base para o formulário). */
export async function nextAnotacaoCode(patientId: string): Promise<string> {
  const supabase = await createClient();
  const { count } = await supabase
    .from("nursing_notes")
    .select("id", { count: "exact", head: true })
    .eq("patient_id", patientId);
  return `ANO-${String((count ?? 0) + 1).padStart(3, "0")}`;
}

// ════════════════════════════════════════════════════════════════════
// Checagem de Cuidados
// ════════════════════════════════════════════════════════════════════
export type CuidadoStatus = "pendente" | "administrado" | "aprazado";

export type Cuidado = {
  id: string;
  paciente: string;
  descricao: string;
  horario: string;
  horarioIso: string;
  status: { label: string; tone: Status };
  statusRaw: CuidadoStatus;
  justificativa: string;
  profissional: string;
  /** Nº do atendimento (queue_entries.attendance_code); null = legado/sem vínculo. */
  atendimentoCodigo: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
};

const CUIDADO_STATUS: Record<CuidadoStatus, { label: string; tone: Status }> = {
  pendente: { label: "Pendente", tone: "wait" },
  administrado: { label: "Administrado", tone: "ok" },
  aprazado: { label: "Aprazado", tone: "warn" },
};

export async function listCuidados(patientId: string): Promise<Cuidado[]> {

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("care_checks")
    .select("*, patients(full_name), queue_entries(attendance_code)")
    .eq("patient_id", patientId)
    .order("scheduled_at", { ascending: true })
    .limit(100);

  if (error || !data) return [];

  return data.map((c) => {
    const pac = one(c.patients as { full_name: string | null } | null);
    const qe = one(c.queue_entries as { attendance_code: string | null } | null);
    const statusRaw = (c.status as CuidadoStatus) ?? "pendente";
    return {
      id: c.id as string,
      paciente: pac?.full_name ?? "—",
      descricao: (c.description as string | null) ?? "—",
      horario: fmtHora(c.scheduled_at as string | null),
      horarioIso: (c.scheduled_at as string | null) ?? "",
      status: CUIDADO_STATUS[statusRaw] ?? CUIDADO_STATUS.pendente,
      statusRaw,
      justificativa: (c.justification as string | null) ?? "—",
      profissional: (c.professional_name as string | null) ?? "—",
      atendimentoCodigo: (qe?.attendance_code as string | null) ?? null,
      cancelledAt: (c.cancelled_at as string | null) ?? null,
      cancelReason: (c.cancel_reason as string | null) ?? null,
    };
  });
}

// ════════════════════════════════════════════════════════════════════
// Balanço Hídrico (ciclo 24h)
// ════════════════════════════════════════════════════════════════════
export type LancamentoHidrico = {
  id: string;
  tipo: "ganho" | "perda";
  descricao: string;
  volume: number;
  hora: string;
  horaIso: string;
  profissional: string;
};

export type BalancoHidrico = {
  id: string;
  paciente: string;
  inicioCiclo: string;
  fechado: boolean;
  lancamentos: LancamentoHidrico[];
  totalGanhos: number;
  totalPerdas: number;
  saldo: number;
};

export async function getBalancoHidrico(
  patientId: string,
): Promise<BalancoHidrico | null> {

  const supabase = await createClient();
  const { data: bal } = await supabase
    .from("fluid_balance")
    .select("*, patients(full_name)")
    .eq("patient_id", patientId)
    .order("cycle_start", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!bal) return null;

  const { data: entries } = await supabase
    .from("fluid_balance_entries")
    .select("*")
    .eq("balance_id", bal.id as string)
    .order("recorded_at", { ascending: true });

  const lancamentos: LancamentoHidrico[] = (entries ?? []).map((e) => ({
    id: e.id as string,
    tipo: (e.kind as "ganho" | "perda") ?? "ganho",
    descricao: (e.description as string | null) ?? "—",
    volume: Number(e.volume_ml ?? 0),
    hora: fmtHora(e.recorded_at as string | null),
    horaIso: (e.recorded_at as string | null) ?? "",
    profissional: (e.professional_name as string | null) ?? "—",
  }));

  const totalGanhos = lancamentos
    .filter((l) => l.tipo === "ganho")
    .reduce((s, l) => s + l.volume, 0);
  const totalPerdas = lancamentos
    .filter((l) => l.tipo === "perda")
    .reduce((s, l) => s + l.volume, 0);
  const pac = one(bal.patients as { full_name: string | null } | null);

  return {
    id: bal.id as string,
    paciente: pac?.full_name ?? "—",
    inicioCiclo: fmtDataHora(bal.cycle_start as string | null),
    fechado: !!bal.closed,
    lancamentos,
    totalGanhos,
    totalPerdas,
    saldo: totalGanhos - totalPerdas,
  };
}

// ════════════════════════════════════════════════════════════════════
// Evolução de Enfermagem
// ════════════════════════════════════════════════════════════════════
export type EvolucaoEnfermagem = {
  id: string;
  paciente: string;
  profissional: string;
  coren: string;
  data: string;
  avaliacao: string;
  reavaliacao: string;
  conduta: string;
  /** Nº do atendimento (queue_entries.attendance_code); null = legado/sem vínculo. */
  atendimentoCodigo: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
};

export async function listEvolucoes(
  patientId: string,
): Promise<EvolucaoEnfermagem[]> {

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("nursing_evolutions")
    .select("*, patients(full_name), queue_entries(attendance_code)")
    .eq("patient_id", patientId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error || !data) return [];

  return data.map((e) => {
    const pac = one(e.patients as { full_name: string | null } | null);
    const qe = one(e.queue_entries as { attendance_code: string | null } | null);
    return {
      id: e.id as string,
      paciente: pac?.full_name ?? "—",
      profissional: (e.professional_name as string | null) ?? "—",
      coren: (e.coren as string | null) ?? "—",
      data: fmtDataHora(e.created_at as string | null),
      avaliacao: (e.assessment as string | null) ?? "—",
      reavaliacao: (e.reassessment as string | null) ?? "—",
      conduta: (e.conduct as string | null) ?? "—",
      atendimentoCodigo: (qe?.attendance_code as string | null) ?? null,
      cancelledAt: (e.cancelled_at as string | null) ?? null,
      cancelReason: (e.cancel_reason as string | null) ?? null,
    };
  });
}

// ════════════════════════════════════════════════════════════════════
// Escalas de Avaliação (Glasgow / Fugulin / Braden)
// ════════════════════════════════════════════════════════════════════
export type EscalaRegistro = {
  id: string;
  escala: string;
  paciente: string;
  profissional: string;
  data: string;
  pontuacao: number;
  classificacao: string;
};

const ESCALA_LABEL: Record<string, string> = {
  glasgow: "Glasgow",
  fugulin: "Fugulin",
  braden: "Braden",
};

export async function listEscalas(
  patientId: string,
): Promise<EscalaRegistro[]> {

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("assessment_scales")
    .select("*, patients(full_name)")
    .eq("patient_id", patientId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error || !data) return [];

  return data.map((s) => {
    const pac = one(s.patients as { full_name: string | null } | null);
    const scale = (s.scale as string | null) ?? "";
    return {
      id: s.id as string,
      escala: ESCALA_LABEL[scale] ?? (scale || "—"),
      paciente: pac?.full_name ?? "—",
      profissional: (s.professional_name as string | null) ?? "—",
      data: fmtDataHora(s.created_at as string | null),
      pontuacao: Number(s.score ?? 0),
      classificacao: (s.classification as string | null) ?? "—",
    };
  });
}

// ════════════════════════════════════════════════════════════════════
// Procedimentos de Enfermagem (TUSS)
// ════════════════════════════════════════════════════════════════════
export type ProcedimentoEnfermagem = {
  id: string;
  tuss: string;
  nome: string;
  paciente: string;
  materiais: string;
  local: string;
  profissional: string;
  data: string;
  /** Nº do atendimento (queue_entries.attendance_code); null = legado/sem vínculo. */
  atendimentoCodigo: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
};

export async function listProcedimentosEnfermagem(
  patientId: string,
): Promise<ProcedimentoEnfermagem[]> {

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("nursing_procedures")
    .select("*, patients(full_name), queue_entries(attendance_code)")
    .eq("patient_id", patientId)
    .order("performed_at", { ascending: false })
    .limit(50);

  if (error || !data) return [];

  return data.map((p) => {
    const pac = one(p.patients as { full_name: string | null } | null);
    const qe = one(p.queue_entries as { attendance_code: string | null } | null);
    return {
      id: p.id as string,
      tuss: (p.tuss_code as string | null) ?? "—",
      nome: (p.name as string | null) ?? "—",
      paciente: pac?.full_name ?? "—",
      materiais: (p.materials as string | null) ?? "—",
      local: (p.body_site as string | null) ?? "—",
      profissional: (p.professional_name as string | null) ?? "—",
      data: fmtDataHora(p.performed_at as string | null),
      atendimentoCodigo: (qe?.attendance_code as string | null) ?? null,
      cancelledAt: (p.cancelled_at as string | null) ?? null,
      cancelReason: (p.cancel_reason as string | null) ?? null,
    };
  });
}

// ════════════════════════════════════════════════════════════════════
// SAE (NANDA)
// ════════════════════════════════════════════════════════════════════
export type RegistroSae = {
  id: string;
  paciente: string;
  profissional: string;
  coren: string;
  diagnostico: string;
  fatorRelacionado: string;
  prescricao: string;
  frequencia: number;
  data: string;
  /** Nº do atendimento (queue_entries.attendance_code); null = legado/sem vínculo. */
  atendimentoCodigo: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
};

export async function listSae(patientId: string): Promise<RegistroSae[]> {

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("sae_records")
    .select(
      "*, patients(full_name), professionals(profiles(full_name)), queue_entries(attendance_code)",
    )
    .eq("patient_id", patientId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error || !data) return [];

  return data.map((s) => {
    const pac = one(s.patients as { full_name: string | null } | null);
    const prof = one(
      s.professionals as
        | { profiles: { full_name: string | null } | { full_name: string | null }[] | null }
        | null,
    );
    const profile = one(prof?.profiles);
    const qe = one(s.queue_entries as { attendance_code: string | null } | null);
    return {
      id: s.id as string,
      paciente: pac?.full_name ?? "—",
      profissional: profile?.full_name ?? "—",
      coren: (s.coren as string | null) ?? "—",
      diagnostico: (s.nanda_diagnosis as string | null) ?? "—",
      fatorRelacionado: (s.related_factor as string | null) ?? "—",
      prescricao: (s.prescription as string | null) ?? "—",
      frequencia: Number(s.frequency_hours ?? 6),
      data: fmtDataHora(s.created_at as string | null),
      atendimentoCodigo: (qe?.attendance_code as string | null) ?? null,
      cancelledAt: (s.cancelled_at as string | null) ?? null,
      cancelReason: (s.cancel_reason as string | null) ?? null,
    };
  });
}

// ── Opção de paciente para selects nos formulários ──────────────────
export type OpcaoPaciente = { id: string; nome: string };

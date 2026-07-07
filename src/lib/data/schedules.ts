import { createClient } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/supabase/config";

/** Escala de horários (grade de atendimento) já formatada p/ a UI. */
export type Escala = {
  id: string;
  code: string;
  description: string;
  professionalId: string;
  professionalNome: string;
  specialty: string;
  serviceType: string;
  slotMinutes: number;
  overbookLimit: number;
  /** Dias da semana (0=Dom..6=Sáb). */
  weekdays: number[];
  startTime: string;
  endTime: string;
  /**
   * Horário próprio por dia da semana ("0"=Dom.."6"=Sáb → {start,end,blocks?}).
   * Só os dias com horário diferente do base; dias ausentes usam startTime/endTime.
   * `blocks` = horários bloqueados SÓ naquele dia (fixos). Vazio ({}) = horário
   * uniforme sem bloqueio por dia (comportamento retrocompatível).
   */
  weekHours: Record<string, DiaHorario>;
  active: boolean;
  /** Vigência da escala (YYYY-MM-DD); "" = sem limite. */
  startDate: string;
  endDate: string;
  /** Códigos de procedimentos atendidos (quando serviceType = Procedimento). */
  procedureCodes: string[];
  /** Códigos TUSS de exames atendidos (quando serviceType = Exame). */
  examTussCodes: string[];
  /** Bloqueios fixos/recorrentes: horários sempre indisponíveis nessa escala. */
  recurringBlocks: { time: string; reason: string }[];
  lateralidade?: string;
  obs?: string;
};

/** Bloqueio fixo de um horário (indisponível). */
export type BlocoHorario = { time: string; reason: string };
/** Config de um dia no week_hours: faixa própria + bloqueios daquele dia. */
export type DiaHorario = { start: string; end: string; blocks?: BlocoHorario[] };

/** Filtro opcional da listagem de escalas. */
export type EscalaFiltro = { specialty?: string; professionalId?: string };

/** Mock usado no modo demo (espelha o fluxo real). */
const MOCK: Escala[] = [
  {
    id: "esc-1",
    code: "ESC-1001",
    description: "Manhã - Cardiologia",
    professionalId: "1",
    professionalNome: "Dr. João Pedro Oliveira",
    specialty: "Cardiologia",
    serviceType: "Consulta",
    slotMinutes: 30,
    overbookLimit: 2,
    weekdays: [1, 2, 3, 4, 5],
    startTime: "08:00",
    endTime: "12:00",
    weekHours: {},
    active: true,
    startDate: "",
    endDate: "",
    procedureCodes: [],
    examTussCodes: [],
    recurringBlocks: [],
    lateralidade: "",
    obs: "",
  },
  {
    id: "esc-2",
    code: "ESC-1002",
    description: "Tarde - Ortopedia",
    professionalId: "2",
    professionalNome: "Dra. Ana Paula Costa",
    specialty: "Ortopedia",
    serviceType: "Consulta",
    slotMinutes: 20,
    overbookLimit: 0,
    weekdays: [1, 3, 5],
    startTime: "13:00",
    endTime: "18:00",
    weekHours: {},
    active: true,
    startDate: "",
    endDate: "",
    procedureCodes: [],
    examTussCodes: [],
    recurringBlocks: [],
    lateralidade: "",
    obs: "",
  },
];

/** "HH:mm:ss" | "HH:mm" → "HH:mm". */
function hhmm(t: unknown): string {
  return String(t ?? "").slice(0, 5);
}

/**
 * Normaliza o jsonb `week_hours` defensivamente. Aceita só chaves "0".."6" com
 * `{start,end}` no formato HH:MM; ignora entradas malformadas.
 */
function parseWeekHours(raw: unknown): Record<string, DiaHorario> {
  let obj: unknown = raw;
  if (typeof raw === "string") {
    try {
      obj = JSON.parse(raw);
    } catch {
      return {};
    }
  }
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return {};
  const out: Record<string, DiaHorario> = {};
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (!/^[0-6]$/.test(k)) continue;
    const o = v as { start?: unknown; end?: unknown; blocks?: unknown };
    const start = typeof o?.start === "string" ? o.start.slice(0, 5) : "";
    const end = typeof o?.end === "string" ? o.end.slice(0, 5) : "";
    if (/^\d{2}:\d{2}$/.test(start) && /^\d{2}:\d{2}$/.test(end)) {
      const blocks = parseRecurringBlocks(o?.blocks);
      out[k] = blocks.length ? { start, end, blocks } : { start, end };
    }
  }
  return out;
}

/** Normaliza o jsonb `recurring_blocks` (array de {time, reason}) defensivamente. */
function parseRecurringBlocks(
  raw: unknown,
): { time: string; reason: string }[] {
  let arr: unknown = raw;
  if (typeof raw === "string") {
    try {
      arr = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(arr)) return [];
  return arr
    .map((x) => {
      const o = x as { time?: unknown; reason?: unknown };
      return {
        time: typeof o?.time === "string" ? o.time.slice(0, 5) : "",
        reason: typeof o?.reason === "string" ? o.reason : "",
      };
    })
    .filter((r) => /^\d{2}:\d{2}$/.test(r.time));
}

/**
 * Lista as escalas (grades) da clínica ativa. RLS escopa por clinic_id.
 * Filtro opcional por especialidade e/ou profissional. Ordenado por
 * especialidade → descrição.
 */
export async function listSchedules(filtro?: EscalaFiltro): Promise<Escala[]> {
  if (isDemoMode()) {
    return MOCK.filter(
      (e) =>
        (!filtro?.specialty || e.specialty === filtro.specialty) &&
        (!filtro?.professionalId || e.professionalId === filtro.professionalId),
    );
  }

  const supabase = await createClient();
  let query = supabase
    .from("schedules")
    .select(
      "id, code, description, professional_id, specialty, service_type, slot_minutes, overbook_limit, weekdays, start_time, end_time, week_hours, active, start_date, end_date, procedure_codes, exam_tuss_codes, recurring_blocks, lateralidade, obs, professionals(profiles(full_name))",
    )
    .order("specialty", { ascending: true })
    .order("description", { ascending: true });

  if (filtro?.specialty) query = query.eq("specialty", filtro.specialty);
  if (filtro?.professionalId)
    query = query.eq("professional_id", filtro.professionalId);

  const { data, error } = await query;
  if (error || !data) return [];

  return data.map((r) => {
    // Join professionals→profiles pode vir como objeto ou array (PostgREST).
    const prof = Array.isArray(r.professionals)
      ? r.professionals[0]
      : r.professionals;
    const perfil = prof
      ? Array.isArray(prof.profiles)
        ? prof.profiles[0]
        : prof.profiles
      : null;
    return {
      id: r.id as string,
      code: (r.code as string | null) ?? "",
      description: (r.description as string | null) ?? "",
      professionalId: (r.professional_id as string | null) ?? "",
      professionalNome: perfil?.full_name ?? "",
      specialty: (r.specialty as string | null) ?? "",
      serviceType: (r.service_type as string | null) ?? "",
      slotMinutes: Number(r.slot_minutes) || 30,
      overbookLimit: Number(r.overbook_limit) || 0,
      weekdays: Array.isArray(r.weekdays) ? (r.weekdays as number[]) : [],
      startTime: hhmm(r.start_time),
      endTime: hhmm(r.end_time),
      weekHours: parseWeekHours(r.week_hours),
      active: !!r.active,
      startDate: r.start_date ? String(r.start_date) : "",
      endDate: r.end_date ? String(r.end_date) : "",
      procedureCodes: Array.isArray(r.procedure_codes)
        ? (r.procedure_codes as string[])
        : [],
      examTussCodes: Array.isArray(r.exam_tuss_codes)
        ? (r.exam_tuss_codes as string[])
        : [],
      recurringBlocks: parseRecurringBlocks(r.recurring_blocks),
      lateralidade: (r.lateralidade as string | null) ?? "",
      obs: (r.obs as string | null) ?? "",
    };
  });
}

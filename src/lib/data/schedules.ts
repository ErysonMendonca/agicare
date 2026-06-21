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
  active: boolean;
  /** Códigos de procedimentos atendidos (quando serviceType = Procedimento). */
  procedureCodes: string[];
  /** Códigos TUSS de exames atendidos (quando serviceType = Exame). */
  examTussCodes: string[];
};

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
    active: true,
    procedureCodes: [],
    examTussCodes: [],
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
    active: true,
    procedureCodes: [],
    examTussCodes: [],
  },
];

/** "HH:mm:ss" | "HH:mm" → "HH:mm". */
function hhmm(t: unknown): string {
  return String(t ?? "").slice(0, 5);
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
      "id, code, description, professional_id, specialty, service_type, slot_minutes, overbook_limit, weekdays, start_time, end_time, active, procedure_codes, exam_tuss_codes, professionals(profiles(full_name))",
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
      active: !!r.active,
      procedureCodes: Array.isArray(r.procedure_codes)
        ? (r.procedure_codes as string[])
        : [],
      examTussCodes: Array.isArray(r.exam_tuss_codes)
        ? (r.exam_tuss_codes as string[])
        : [],
    };
  });
}

import { createClient } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/supabase/config";
import { getViewScope, getMyProfessionalId } from "@/lib/permissions";
import { type Status } from "@/components/ui/Badge";

export type Tag = { label: string; status: "danger" | "warn" };

export type FilaItem = {
  id: string;
  patientId: string | null;
  codigo: string;
  paciente: string;
  hora: string;
  especialidade: string;
  medico: string;
  convenio: string;
  status: { label: string; tone: Status };
  /** Status cru do banco (aguardando|chamado|em_atendimento|finalizado|desistencia|agendado). */
  statusRaw: string;
  /** Prioridade crua do banco (normal|preferencial|urgente). */
  priorityRaw: string;
  tags?: Tag[];
  /** Agendamento vinculado (fluxo totem); null quando a entrada não veio da agenda. */
  appointmentId?: string | null;
  /** true = paciente agendado que ainda NÃO fez check-in (não está na fila). */
  agendado?: boolean;
};

/** Mapeia status do banco → rótulo + tom do Badge. */
function mapStatus(status: string): { label: string; tone: Status } {
  switch (status) {
    case "chamado":
      return { label: "Chamado", tone: "active" };
    case "em_atendimento":
      return { label: "Em Atendimento", tone: "active" };
    case "finalizado":
      return { label: "Finalizado", tone: "ok" };
    case "desistencia":
      return { label: "Desistência", tone: "danger" };
    case "agendado":
      // Paciente da agenda que ainda não fez check-in no totem.
      return { label: "Agendado", tone: "wait" };
    case "aguardando":
    default:
      return { label: "Aguardando", tone: "wait" };
  }
}

/** Início (00:00) e fim (24:00) do dia atual em ISO, para filtros por "hoje". */
function todayRangeISO(): { startISO: string; endISO: string } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { startISO: start.toISOString(), endISO: end.toISOString() };
}

/** Mapeia prioridade do banco → tag (Urgente/Preferencial). */
function mapPriority(priority: string): Tag[] | undefined {
  if (priority === "urgente") return [{ label: "Urgente", status: "danger" }];
  if (priority === "preferencial")
    return [{ label: "Preferencial", status: "warn" }];
  return undefined;
}

/** Formata um timestamp em HH:MM. */
function formatHora(createdAt: string | null): string {
  if (!createdAt) return "—";
  const d = new Date(createdAt);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Mock usado no modo demo (espelha o Figma). */
const MOCK: FilaItem[] = [
  {
    id: "mock-1",
    patientId: "mock-p1",
    codigo: "A001",
    paciente: "Maria Silva Santos",
    hora: "08:00",
    especialidade: "Cardiologia",
    medico: "Dr. Carlos Eduardo",
    convenio: "Unimed",
    status: { label: "Aguardando", tone: "wait" },
    statusRaw: "aguardando",
    priorityRaw: "normal",
  },
  {
    id: "mock-2",
    patientId: "mock-p2",
    codigo: "A002",
    paciente: "João Pedro Oliveira",
    hora: "08:15",
    especialidade: "Cardiologia",
    medico: "Dr. Carlos Eduardo",
    convenio: "Particular",
    status: { label: "Aguardando", tone: "wait" },
    statusRaw: "aguardando",
    priorityRaw: "urgente",
    tags: [{ label: "Urgente", status: "danger" }],
  },
  {
    id: "mock-3",
    patientId: "mock-p3",
    codigo: "P001",
    paciente: "Ana Paula Costa",
    hora: "08:20",
    especialidade: "Cardiologia",
    medico: "Dr. Carlos Eduardo",
    convenio: "Bradesco Saúde",
    status: { label: "Aguardando", tone: "wait" },
    statusRaw: "aguardando",
    priorityRaw: "preferencial",
    tags: [{ label: "Preferencial", status: "warn" }],
  },
  {
    id: "mock-4",
    patientId: "mock-p4",
    codigo: "A003",
    paciente: "Roberto Carlos Lima",
    hora: "08:30",
    especialidade: "Cardiologia",
    medico: "Dr. Carlos Eduardo",
    convenio: "Unimed",
    status: { label: "Chamado", tone: "active" },
    statusRaw: "chamado",
    priorityRaw: "normal",
  },
];

/**
 * Lista a fila de atendimento: do banco quando configurado, mock no modo demo.
 * Filtro opcional por especialidade (usado pelo Prontuário, default = especialidade do médico).
 */
export async function listQueue(opts?: {
  specialty?: string | null;
}): Promise<FilaItem[]> {
  if (isDemoMode()) {
    return opts?.specialty
      ? MOCK.filter((m) => m.especialidade === opts.specialty)
      : MOCK;
  }

  const supabase = await createClient();
  let query = supabase
    .from("queue_entries")
    .select(
      "id, patient_id, ticket_code, patient_name, priority, specialty, insurance, status, created_at, appointment_id, professionals(profiles(full_name))",
    )
    .order("created_at", { ascending: false });

  if (opts?.specialty) query = query.eq("specialty", opts.specialty);

  // Escopo 'own' (módulo 'fila'): o papel só enxerga as entradas do próprio
  // profissional. Admin é sempre 'all' (seed) → sem filtro. Sem vínculo de
  // profissional, não filtra (evita esconder tudo de quem não é profissional).
  const scope = await getViewScope("fila");
  if (scope === "own") {
    const myProfessionalId = await getMyProfessionalId();
    if (myProfessionalId) query = query.eq("professional_id", myProfessionalId);
  }

  const { data, error } = await query;

  if (error || !data) return [];

  return data.map((r) => {
    // O join aninhado pode vir como objeto ou array dependendo da relação.
    const professional = Array.isArray(r.professionals)
      ? r.professionals[0]
      : r.professionals;
    const profile = Array.isArray(professional?.profiles)
      ? professional?.profiles[0]
      : professional?.profiles;

    const statusRaw = r.status ?? "aguardando";
    const priorityRaw = r.priority ?? "normal";

    return {
      id: r.id as string,
      patientId: (r.patient_id as string | null) ?? null,
      codigo: r.ticket_code ?? "—",
      paciente: r.patient_name ?? "",
      hora: formatHora(r.created_at),
      especialidade: r.specialty ?? "—",
      medico: profile?.full_name ?? "—",
      convenio: r.insurance ?? "—",
      status: mapStatus(statusRaw),
      statusRaw,
      priorityRaw,
      tags: mapPriority(priorityRaw),
      appointmentId: (r.appointment_id as string | null) ?? null,
      agendado: false,
    };
  });
}

/** Mocks de agendados (modo demo): pacientes da agenda ainda sem check-in. */
const MOCK_AGENDADOS: FilaItem[] = [
  {
    id: "mock-ag-1",
    patientId: "mock-ag-p1",
    codigo: "—",
    paciente: "Beatriz Nogueira Reis",
    hora: "09:00",
    especialidade: "Cardiologia",
    medico: "Dr. Carlos Eduardo",
    convenio: "—",
    status: mapStatus("agendado"),
    statusRaw: "agendado",
    priorityRaw: "normal",
    appointmentId: "mock-ag-1",
    agendado: true,
  },
  {
    id: "mock-ag-2",
    patientId: "mock-ag-p2",
    codigo: "—",
    paciente: "Marcos Vinícius Teixeira",
    hora: "09:30",
    especialidade: "Cardiologia",
    medico: "Dr. Carlos Eduardo",
    convenio: "—",
    status: mapStatus("agendado"),
    statusRaw: "agendado",
    priorityRaw: "normal",
    appointmentId: "mock-ag-2",
    agendado: true,
  },
  {
    id: "mock-ag-3",
    patientId: "mock-ag-p3",
    codigo: "—",
    paciente: "Helena Castro Dias",
    hora: "10:15",
    especialidade: "Clínica Geral",
    medico: "Dra. Ana Beatriz Costa",
    convenio: "—",
    status: mapStatus("agendado"),
    statusRaw: "agendado",
    priorityRaw: "normal",
    appointmentId: "mock-ag-3",
    agendado: true,
  },
];

/**
 * Lista os pacientes AGENDADOS para hoje que ainda NÃO fizeram check-in no totem
 * (sem `queue_entries` criada hoje). Cada item vem como FilaItem com `agendado: true`,
 * `codigo: "—"` (senha só é gerada no check-in) e `statusRaw: "agendado"`.
 * Resiliente a erro (→ []).
 */
export async function listAgendadosHoje(opts?: {
  specialty?: string | null;
}): Promise<FilaItem[]> {
  if (isDemoMode()) {
    return opts?.specialty
      ? MOCK_AGENDADOS.filter((m) => m.especialidade === opts.specialty)
      : MOCK_AGENDADOS;
  }

  try {
    const supabase = await createClient();
    const { startISO, endISO } = todayRangeISO();

    // Pacientes que JÁ fizeram check-in hoje (têm queue_entries no dia) → excluir.
    const { data: checkedIn } = await supabase
      .from("queue_entries")
      .select("patient_id")
      .gte("created_at", startISO)
      .lt("created_at", endISO);

    const jaNaFila = new Set(
      (checkedIn ?? [])
        .map((q) => q.patient_id as string | null)
        .filter((id): id is string => Boolean(id)),
    );

    // Agendamentos de hoje ainda pendentes de chegada (agendado/confirmado).
    const { data, error } = await supabase
      .from("appointments")
      .select(
        "id, starts_at, patient_id, status, patients(full_name), professionals(specialty, profiles(full_name))",
      )
      .gte("starts_at", startISO)
      .lt("starts_at", endISO)
      .in("status", ["agendado", "confirmado"])
      .order("starts_at", { ascending: true });

    if (error || !data) return [];

    const one = <T,>(v: unknown): T | null =>
      Array.isArray(v) ? ((v[0] ?? null) as T | null) : ((v as T) ?? null);

    return data
      .filter((r) => {
        const pid = r.patient_id as string | null;
        return !(pid && jaNaFila.has(pid));
      })
      .map((r) => {
        const patient = one<{ full_name: string | null }>(r.patients);
        const professional = one<{
          specialty: string | null;
          profiles: { full_name: string | null } | null;
        }>(r.professionals);
        const profProfile = one<{ full_name: string | null }>(
          professional?.profiles,
        );

        return {
          id: r.id as string,
          patientId: (r.patient_id as string | null) ?? null,
          codigo: "—",
          paciente: patient?.full_name ?? "—",
          hora: formatHora(r.starts_at as string | null),
          especialidade: professional?.specialty ?? "—",
          medico: profProfile?.full_name ?? "—",
          convenio: "—",
          status: mapStatus("agendado"),
          statusRaw: "agendado",
          priorityRaw: "normal",
          appointmentId: r.id as string,
          agendado: true,
        } satisfies FilaItem;
      })
      .filter((item) => !opts?.specialty || item.especialidade === opts.specialty);
  } catch {
    return [];
  }
}

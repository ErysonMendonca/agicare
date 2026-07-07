import { createClient } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/supabase/config";
import { getMyProfessional } from "@/lib/permissions";
import { getRole } from "@/lib/auth";
import { type Status } from "@/components/ui/Badge";

export type Tag = { label: string; status: "danger" | "warn" };

export type FilaItem = {
  id: string;
  patientId: string | null;
  codigo: string;
  /** Numeração de atendimento (ficha): 6 dígitos, única por clínica. */
  atendimentoCodigo: string | null;
  paciente: string;
  hora: string;
  /** Data+hora do horário marcado do agendamento ("dd/MM HH:MM"); "—" se avulso. */
  agendamentoEm?: string;
  /** Data+hora da entrada na fila (chegada/check-in: arrived_at ?? created_at). */
  entradaEm?: string;
  especialidade: string;
  medico: string;
  convenio: string;
  /** Convênio do CADASTRO do paciente (patients.convenio) — preenche o modal de
   * Dados de Atendimento. null quando o paciente não tem convênio no cadastro. */
  convenioCadastro?: string | null;
  /**
   * Tipo de Atendimento vindo do agendamento (appointments.reason:
   * Consulta/Retorno/Exame/Procedimento). null quando avulso/sem agendamento.
   * Autopreenche o campo "Tipo de Atendimento" no modal de Dados de Atendimento.
   */
  tipoAtendimento?: string | null;
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
  /**
   * Cadastro do paciente completo? `false` = paciente AVULSO (criado só com
   * Nome/Telefone/CPF no agendamento, 0049) — exige completar o cadastro no
   * check-in. `undefined`/`true` = completo. Só é populado para agendados.
   */
  registrationComplete?: boolean;
};

/** Mapeia status do banco → rótulo + tom do Badge. */
function mapStatus(status: string): { label: string; tone: Status } {
  switch (status) {
    case "na_recepcao":
      return { label: "Na recepção", tone: "active" };
    case "aguardando_atendimento":
      return { label: "Aguardando atendimento", tone: "wait" };
    case "chamado":
      return { label: "Chamado", tone: "active" };
    case "triagem":
      return { label: "Em Triagem", tone: "active" };
    case "em_atendimento":
      return { label: "Em Atendimento", tone: "active" };
    case "aguardando_pagamento":
      return { label: "Aguardando Pagamento", tone: "warn" };
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

/**
 * Início/fim (ISO) de um dia local informado como yyyy-mm-dd. Parse LOCAL
 * (`new Date(y, m-1, d)`) p/ não cair no bug de fuso do `<input type="date">`.
 */
function dayRangeISO(dateISO: string): { startISO: string; endISO: string } {
  const [y, m, d] = dateISO.split("-").map(Number);
  const start = new Date(y, (m ?? 1) - 1, d ?? 1);
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

/** Fuso da clínica para exibir INSTANTES reais (arrived_at/created_at = now()). */
const TZ_CLINICA = "America/Sao_Paulo";

/**
 * Timestamps têm DUAS semânticas neste sistema:
 *  - INSTANTES reais (arrived_at/created_at, gravados com `now().toISOString()`):
 *    exibir no fuso da clínica (America/Sao_Paulo). Sem isso, o servidor em UTC
 *    mostra 3h adiantado (bug da "entrada" na fila).
 *  - HORÁRIO AGENDADO (appointments.starts_at): gravado como "wall-clock em UTC"
 *    (`new Date("YYYY-MM-DDTHH:mm").toISOString()` num servidor UTC). Para exibir
 *    o horário MARCADO, formatamos em UTC — independente do fuso do servidor.
 */

/** HH:MM de um INSTANTE real, no fuso da clínica. */
function formatHora(ts: string | null): string {
  if (!ts) return "—";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString("pt-BR", {
    timeZone: TZ_CLINICA,
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** "dd/MM HH:MM" de um INSTANTE real, no fuso da clínica. */
function formatDataHora(ts: string | null): string {
  if (!ts) return "—";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "—";
  const opts = { timeZone: TZ_CLINICA } as const;
  const data = d.toLocaleDateString("pt-BR", {
    ...opts,
    day: "2-digit",
    month: "2-digit",
  });
  const hora = d.toLocaleTimeString("pt-BR", {
    ...opts,
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${data} ${hora}`;
}

/** HH:MM de um HORÁRIO AGENDADO (starts_at wall-clock em UTC). */
function formatHoraAgendada(ts: string | null): string {
  if (!ts) return "—";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString("pt-BR", {
    timeZone: "UTC",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** "dd/MM HH:MM" de um HORÁRIO AGENDADO (starts_at wall-clock em UTC). */
function formatDataHoraAgendada(ts: string | null): string {
  if (!ts) return "—";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "—";
  const opts = { timeZone: "UTC" } as const;
  const data = d.toLocaleDateString("pt-BR", {
    ...opts,
    day: "2-digit",
    month: "2-digit",
  });
  const hora = d.toLocaleTimeString("pt-BR", {
    ...opts,
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${data} ${hora}`;
}

/** Mock usado no modo demo (espelha o Figma). */
const MOCK: FilaItem[] = [
  {
    id: "mock-1",
    patientId: "mock-p1",
    codigo: "A001",
    atendimentoCodigo: "100001",
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
    atendimentoCodigo: "100002",
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
    atendimentoCodigo: "100003",
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
    atendimentoCodigo: "100004",
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
 * `date` (yyyy-mm-dd, opcional): restringe às entradas criadas naquele dia — usado
 * pela tela da Fila p/ mostrar só o dia selecionado (default = hoje) e não poluir
 * com pacientes de dias passados. Sem `date`, retorna todas (comportamento legado).
 */
export async function listQueue(opts?: {
  specialty?: string | null;
  date?: string | null;
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
      "id, patient_id, ticket_code, attendance_code, patient_name, priority, specialty, insurance, status, created_at, arrived_at, appointment_id, appointments(starts_at, reason), patients(convenio), professionals(profiles(full_name))",
    )
    .order("created_at", { ascending: false });

  if (opts?.specialty) query = query.eq("specialty", opts.specialty);

  if (opts?.date) {
    const { startISO, endISO } = dayRangeISO(opts.date);
    query = query.gte("created_at", startISO).lt("created_at", endISO);
  }

  // Fila do MÉDICO: quem tem vínculo de profissional vê a fila da SUA
  // especialidade (ou pacientes SEM especialidade, "livres gerais", p/ não sumir
  // da fila de ninguém) e só os SEM profissional atribuído ou já atribuídos a
  // ELE (após atender = reivindicar). Admin/recepção (sem vínculo, ou admin
  // explícito) não filtram — veem a fila inteira.
  const [me, role] = await Promise.all([getMyProfessional(), getRole()]);
  if (me && role !== "admin") {
    const UUID_RE =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    // Especialidade: a dele OU nula. Valor entre aspas (JSON) → seguro no filtro
    // textual `.or` mesmo com espaços/parênteses/acentos.
    if (me.specialty) {
      query = query.or(
        `specialty.eq.${JSON.stringify(me.specialty)},specialty.is.null`,
      );
    }
    // Só interpola o id no `.or` se for uuid válido (defesa em profundidade).
    if (UUID_RE.test(me.id)) {
      query = query.or(`professional_id.is.null,professional_id.eq.${me.id}`);
    }
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

    // A coluna "hora" representa o HORÁRIO DE AGENDAMENTO. Para quem tem
    // agendamento vinculado, usa o starts_at (ex.: 18:20) — não o created_at
    // (momento do check-in). Avulso (sem agendamento) cai no created_at.
    const agendamento = Array.isArray(r.appointments)
      ? r.appointments[0]
      : r.appointments;
    const startsAt = (agendamento?.starts_at as string | null) ?? null;
    // Tipo de Atendimento escolhido no agendamento (reason: Consulta/
    // Retorno/Exame/Procedimento) — autopreenche o modal de Dados de Atendimento.
    const tipoAtendimento =
      (agendamento?.reason as string | null) ?? null;
    // Convênio do cadastro do paciente (join patients).
    const pacienteRow = Array.isArray(r.patients) ? r.patients[0] : r.patients;
    const convenioCadastro =
      (pacienteRow?.convenio as string | null) ?? null;

    return {
      id: r.id as string,
      patientId: (r.patient_id as string | null) ?? null,
      codigo: r.ticket_code ?? "—",
      atendimentoCodigo: (r.attendance_code as string | null) ?? null,
      paciente: r.patient_name ?? "",
      // Hora da fila: se agendado, o horário MARCADO (starts_at, wall-clock);
      // senão, o instante de entrada (created_at) no fuso da clínica.
      hora: startsAt
        ? formatHoraAgendada(startsAt)
        : formatHora(r.created_at as string | null),
      // Agendamento: horário marcado (starts_at). Entrada: chegada na fila
      // (arrived_at) ou, na falta, o momento do check-in (created_at) — instantes
      // reais, exibidos no fuso da clínica (America/Sao_Paulo).
      agendamentoEm: formatDataHoraAgendada(startsAt),
      entradaEm: formatDataHora(
        (r.arrived_at as string | null) ?? (r.created_at as string | null),
      ),
      especialidade: r.specialty ?? "—",
      medico: profile?.full_name ?? "—",
      convenio: r.insurance ?? "—",
      convenioCadastro,
      tipoAtendimento,
      status: mapStatus(statusRaw),
      statusRaw,
      priorityRaw,
      tags: mapPriority(priorityRaw),
      appointmentId: (r.appointment_id as string | null) ?? null,
      agendado: false,
    };
  }).sort((a, b) => a.hora.localeCompare(b.hora));
}

/**
 * Busca uma única entrada da fila pelo ID: do banco quando configurado, mock no modo demo.
 */
export async function getQueueItem(id: string): Promise<FilaItem | null> {
  if (isDemoMode()) {
    const item = MOCK.find((m) => m.id === id) || MOCK_AGENDADOS.find((m) => m.id === id);
    return item ?? null;
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("queue_entries")
    .select(
      "id, patient_id, ticket_code, attendance_code, patient_name, priority, specialty, insurance, status, created_at, arrived_at, appointment_id, appointments(starts_at, reason), patients(convenio), professionals(profiles(full_name))",
    )
    .eq("id", id)
    .single();

  if (error || !data) return null;

  const r = data;
  const professional = Array.isArray(r.professionals)
    ? r.professionals[0]
    : r.professionals;
  const profile = Array.isArray(professional?.profiles)
    ? professional?.profiles[0]
    : professional?.profiles;

  const statusRaw = r.status ?? "aguardando";
  const priorityRaw = r.priority ?? "normal";

  const agendamento = Array.isArray(r.appointments)
    ? r.appointments[0]
    : r.appointments;
  const startsAt = (agendamento?.starts_at as string | null) ?? null;
  const tipoAtendimento = (agendamento?.reason as string | null) ?? null;
  const pacienteRow = Array.isArray(r.patients) ? r.patients[0] : r.patients;
  const convenioCadastro = (pacienteRow?.convenio as string | null) ?? null;

  return {
    id: r.id as string,
    patientId: (r.patient_id as string | null) ?? null,
    codigo: r.ticket_code ?? "—",
    atendimentoCodigo: (r.attendance_code as string | null) ?? null,
    paciente: r.patient_name ?? "",
    hora: startsAt
      ? formatHoraAgendada(startsAt)
      : formatHora(r.created_at as string | null),
    agendamentoEm: formatDataHoraAgendada(startsAt),
    entradaEm: formatDataHora(
      (r.arrived_at as string | null) ?? (r.created_at as string | null),
    ),
    especialidade: r.specialty ?? "—",
    medico: profile?.full_name ?? "—",
    convenio: r.insurance ?? "—",
    convenioCadastro,
    tipoAtendimento,
    status: mapStatus(statusRaw),
    statusRaw,
    priorityRaw,
    tags: mapPriority(priorityRaw),
    appointmentId: (r.appointment_id as string | null) ?? null,
    agendado: false,
  };
}


/** Mocks de agendados (modo demo): pacientes da agenda ainda sem check-in. */
const MOCK_AGENDADOS: FilaItem[] = [
  {
    id: "mock-ag-1",
    patientId: "mock-ag-p1",
    codigo: "—",
    atendimentoCodigo: null,
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
    // Demo: paciente avulso (cadastro mínimo) p/ exercitar o complemento no check-in.
    registrationComplete: false,
  },
  {
    id: "mock-ag-2",
    patientId: "mock-ag-p2",
    codigo: "—",
    atendimentoCodigo: null,
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
    atendimentoCodigo: null,
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
  /** Dia a consultar (YYYY-MM-DD). Sem valor → hoje. */
  date?: string | null;
}): Promise<FilaItem[]> {
  if (isDemoMode()) {
    return opts?.specialty
      ? MOCK_AGENDADOS.filter((m) => m.especialidade === opts.specialty)
      : MOCK_AGENDADOS;
  }

  try {
    const supabase = await createClient();
    // Respeita o dia selecionado na fila (agendados de outras datas também
    // aparecem ao navegar para o dia deles); sem data → hoje.
    const { startISO, endISO } = opts?.date
      ? dayRangeISO(opts.date)
      : todayRangeISO();

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
        "id, starts_at, reason, patient_id, status, specialty, patients(full_name, registration_complete, convenio), professionals(specialty, profiles(full_name))",
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
        const patient = one<{
          full_name: string | null;
          registration_complete: boolean | null;
          convenio: string | null;
        }>(r.patients);
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
    atendimentoCodigo: null,
          paciente: patient?.full_name ?? "—",
          hora: formatHoraAgendada(r.starts_at as string | null),
          // Agendado ainda não fez check-in → sem horário de entrada.
          agendamentoEm: formatDataHoraAgendada(r.starts_at as string | null),
          entradaEm: "—",
          // Agendamento por especialidade (sem profissional): usa appointments.specialty.
          especialidade:
            professional?.specialty ?? (r.specialty as string | null) ?? "—",
          medico: profProfile?.full_name ?? "—",
          convenio: "—",
          convenioCadastro: patient?.convenio ?? null,
          tipoAtendimento: (r.reason as string | null) ?? null,
          status: mapStatus("agendado"),
          statusRaw: "agendado",
          priorityRaw: "normal",
          appointmentId: r.id as string,
          agendado: true,
          // Avulso (0049): cadastro pendente até ser completado no check-in.
          registrationComplete: patient?.registration_complete !== false,
        } satisfies FilaItem;
      })
      .filter((item) => !opts?.specialty || item.especialidade === opts.specialty);
  } catch {
    return [];
  }
}

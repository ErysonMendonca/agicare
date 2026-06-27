import { createClient } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/supabase/config";
import { getViewScope, getMyProfessionalId } from "@/lib/permissions";
import { type Status } from "@/components/ui/Badge";
import { requireClinic } from "@/lib/tenant";
import { getAttendanceFlow } from "@/lib/data/attendance-flow";
import {
  DEFAULT_STAGES,
  hasTriagem,
  nextStatus,
  stageForStatus,
  type FlowStage,
} from "@/lib/data/attendance-flow.shared";

export type Tag = { label: string; status: "danger" | "warn" };

export type FilaItem = {
  id: string;
  patientId: string | null;
  codigo: string;
  /** Numeração de atendimento (ficha): 6 dígitos, única por clínica. */
  atendimentoCodigo: string | null;
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
      "id, patient_id, ticket_code, attendance_code, patient_name, priority, specialty, insurance, status, created_at, appointment_id, appointments(starts_at), professionals(profiles(full_name))",
    )
    .order("created_at", { ascending: false });

  if (opts?.specialty) query = query.eq("specialty", opts.specialty);

  if (opts?.date) {
    const { startISO, endISO } = dayRangeISO(opts.date);
    query = query.gte("created_at", startISO).lt("created_at", endISO);
  }

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

    // A coluna "hora" representa o HORÁRIO DE AGENDAMENTO. Para quem tem
    // agendamento vinculado, usa o starts_at (ex.: 18:20) — não o created_at
    // (momento do check-in). Avulso (sem agendamento) cai no created_at.
    const agendamento = Array.isArray(r.appointments)
      ? r.appointments[0]
      : r.appointments;
    const horaFonte =
      (agendamento?.starts_at as string | null) ?? r.created_at;

    return {
      id: r.id as string,
      patientId: (r.patient_id as string | null) ?? null,
      codigo: r.ticket_code ?? "—",
      atendimentoCodigo: (r.attendance_code as string | null) ?? null,
      paciente: r.patient_name ?? "",
      hora: formatHora(horaFonte),
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
        "id, starts_at, patient_id, status, specialty, patients(full_name, registration_complete), professionals(specialty, profiles(full_name))",
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
          hora: formatHora(r.starts_at as string | null),
          // Agendamento por especialidade (sem profissional): usa appointments.specialty.
          especialidade:
            professional?.specialty ?? (r.specialty as string | null) ?? "—",
          medico: profProfile?.full_name ?? "—",
          convenio: "—",
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

// ── Acompanhamento (linha do tempo por número de atendimento) ─────────

export type AcompEtapaEstado = "feito" | "atual" | "pendente";
export type AcompEtapa = {
  chave: "recepcao" | "triagem" | "atendimento";
  rotulo: string;
  estado: AcompEtapaEstado;
  em: string | null;
};
export type Acompanhamento = {
  encontrado: boolean;
  codigo: string;
  paciente: string | null;
  /** Senha (ticket_code). */
  senha: string | null;
  /** Rótulo legível do status atual. */
  statusAtual: string | null;
  /** Rótulo da próxima etapa, ou "Finalizado"/null. */
  proximoPasso: string | null;
  /** Onde o paciente está registrado agora (legível). */
  ondeRegistrado: string | null;
  etapas: AcompEtapa[];
};

/** Rótulo legível de cada etapa canônica. */
const STAGE_ROTULO: Record<FlowStage, string> = {
  recepcao: "Recepção",
  triagem: "Triagem",
  atendimento: "Atendimento",
};

/** Acompanhamento vazio (não encontrado). */
function acompVazio(codigo: string): Acompanhamento {
  return {
    encontrado: false,
    codigo,
    paciente: null,
    senha: null,
    statusAtual: null,
    proximoPasso: null,
    ondeRegistrado: null,
    etapas: [],
  };
}

/**
 * Monta a linha do tempo (recepção → [triagem] → atendimento) de uma entrada da
 * fila a partir do status atual e dos marcos registrados. Parte pura, reutilizada
 * pelo caminho real e pelo modo demo.
 */
function montarAcompanhamento(args: {
  codigo: string;
  paciente: string | null;
  senha: string | null;
  status: string;
  stages: FlowStage[];
  recepcaoFeita: boolean;
  triagemFeita: boolean;
  arrivedAt: string | null;
  calledAt: string | null;
  startedAt: string | null;
}): Acompanhamento {
  const {
    codigo,
    paciente,
    senha,
    status,
    stages,
    recepcaoFeita,
    triagemFeita,
    arrivedAt,
    calledAt,
    startedAt,
  } = args;

  const finalizado = status === "finalizado";
  const desistiu = status === "desistencia";
  // Estados terminais não têm etapa "atual" nem próximo passo.
  const terminal = finalizado || desistiu;
  const mostrarTriagem = hasTriagem(stages);
  const etapasChave: FlowStage[] = mostrarTriagem
    ? ["recepcao", "triagem", "atendimento"]
    : ["recepcao", "atendimento"];

  // Posição da etapa atual (pelo status) na ordem mostrada.
  const stageAtual = stageForStatus(status); // null p/ agendado/terminal
  const idxAtual = stageAtual ? etapasChave.indexOf(stageAtual) : 0;

  const marco: Record<FlowStage, boolean> = {
    recepcao: recepcaoFeita,
    triagem: triagemFeita,
    atendimento: finalizado,
  };
  const em: Record<FlowStage, string | null> = {
    recepcao: arrivedAt,
    triagem: calledAt,
    atendimento: startedAt,
  };

  // 1ª passada: define "feito" por marco ou por já ter passado da etapa.
  const feito = etapasChave.map(
    (chave, i) => finalizado || marco[chave] || i < idxAtual,
  );
  // "atual" = primeira etapa não-feita (só se não finalizado).
  const idxPrimeiraPendente = feito.findIndex((f) => !f);

  const etapas: AcompEtapa[] = etapasChave.map((chave, i) => {
    let estado: AcompEtapaEstado;
    if (feito[i]) estado = "feito";
    else if (!terminal && i === idxPrimeiraPendente) estado = "atual";
    else estado = "pendente";
    return {
      chave,
      rotulo: STAGE_ROTULO[chave],
      estado,
      em: estado === "pendente" ? null : em[chave],
    };
  });

  // Próximo passo (rótulo) a partir do status atual.
  let proximoPasso: string | null;
  if (terminal) {
    proximoPasso = null;
  } else {
    const next = nextStatus(status, stages);
    proximoPasso = next ? mapStatus(next).label : "Finalizado";
  }

  // Onde está registrado agora (legível).
  const etapaAtual = etapas.find((e) => e.estado === "atual");
  const ondeRegistrado = finalizado
    ? "Prontuário do paciente"
    : desistiu
      ? "Atendimento encerrado (desistência)"
      : etapaAtual?.rotulo ?? STAGE_ROTULO.recepcao;

  return {
    encontrado: true,
    codigo,
    paciente,
    senha,
    statusAtual: mapStatus(status).label,
    proximoPasso,
    ondeRegistrado,
    etapas,
  };
}

/**
 * Acompanhamento do paciente pelo NÚMERO DE ATENDIMENTO (ficha). Busca a entrada
 * na fila pelo `attendance_code` na clínica ativa (RLS) e monta a linha do tempo
 * recepção → [triagem] → atendimento, com base no status e nos marcos registrados
 * (attendance_records / triage_records). Não expõe PII além do nome.
 */
export async function getAcompanhamento(
  codigo: string,
): Promise<Acompanhamento> {
  const code = codigo.trim();
  if (!code) return acompVazio(codigo);

  if (isDemoMode()) {
    const item = MOCK.find((m) => m.atendimentoCodigo === code);
    if (!item) return acompVazio(code);
    return montarAcompanhamento({
      codigo: code,
      paciente: item.paciente,
      senha: item.codigo,
      status: item.statusRaw,
      stages: DEFAULT_STAGES,
      recepcaoFeita: item.statusRaw !== "aguardando",
      triagemFeita: false,
      arrivedAt: null,
      calledAt: null,
      startedAt: null,
    });
  }

  const clinicId = await requireClinic();
  const supabase = await createClient();

  const { data: entry, error } = await supabase
    .from("queue_entries")
    .select(
      "id, attendance_code, ticket_code, patient_name, status, arrived_at, called_at, started_at",
    )
    .eq("clinic_id", clinicId)
    .eq("attendance_code", code)
    .maybeSingle();

  if (error || !entry) return acompVazio(code);

  const queueEntryId = entry.id as string;

  // Marcos: recepção (attendance_records) e triagem (triage_records) por entry.
  const [{ count: recCount }, { count: triCount }] = await Promise.all([
    supabase
      .from("attendance_records")
      .select("id", { count: "exact", head: true })
      .eq("queue_entry_id", queueEntryId),
    supabase
      .from("triage_records")
      .select("id", { count: "exact", head: true })
      .eq("queue_entry_id", queueEntryId),
  ]);

  const stages = await getAttendanceFlow();

  return montarAcompanhamento({
    codigo: code,
    paciente: (entry.patient_name as string | null) ?? null,
    senha: (entry.ticket_code as string | null) ?? null,
    status: (entry.status as string | null) ?? "aguardando",
    stages,
    recepcaoFeita: (recCount ?? 0) > 0,
    triagemFeita: (triCount ?? 0) > 0,
    arrivedAt: (entry.arrived_at as string | null) ?? null,
    calledAt: (entry.called_at as string | null) ?? null,
    startedAt: (entry.started_at as string | null) ?? null,
  });
}

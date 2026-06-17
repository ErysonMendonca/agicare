import { createClient } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/supabase/config";
import { getViewScope, getMyProfessionalId } from "@/lib/permissions";
import { type Status } from "@/components/ui/Badge";

/** Status crus da tabela `appointments`. */
export type AppointmentStatus =
  | "agendado"
  | "confirmado"
  | "em_atendimento"
  | "concluido"
  | "cancelado"
  | "faltou";

export type Atendimento = {
  id: string;
  paciente: string;
  /** CPF cru (só dígitos quando disponível) p/ filtro por CPF. */
  cpf: string;
  profissional: string;
  /** id do profissional vinculado (p/ pré-preencher o modal de manutenção). */
  profissionalId: string;
  especialidade: string;
  /** Data formatada pt-BR (dd/mm/aaaa). */
  data: string;
  /** Data ISO (yyyy-mm-dd) p/ filtro e pré-preenchimento. */
  dataISO: string;
  /** Hora formatada pt-BR (HH:mm). */
  hora: string;
  motivo: string;
  status: AppointmentStatus;
  /** Rótulo legível do status. */
  statusLabel: string;
  /** Variante do Badge. */
  badge: Status;
};

export type AppointmentKpis = {
  total: number;
  agendados: number;
  confirmados: number;
  emAtendimento: number;
  finalizados: number;
};

/** Rótulos legíveis por status. */
const STATUS_LABEL: Record<AppointmentStatus, string> = {
  agendado: "Agendado",
  confirmado: "Confirmado",
  em_atendimento: "Em Atendimento",
  concluido: "Finalizado",
  cancelado: "Cancelado",
  faltou: "Faltou",
};

/** Status → variante do Badge (conforme brief). */
const STATUS_BADGE: Record<AppointmentStatus, Status> = {
  agendado: "wait",
  confirmado: "ok",
  em_atendimento: "active",
  concluido: "ok",
  cancelado: "danger",
  faltou: "danger",
};

/** Formata um timestamptz em data/hora pt-BR. */
function formatPtBr(iso: string | null): { data: string; hora: string } {
  if (!iso) return { data: "—", hora: "—" };
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { data: "—", hora: "—" };
  return {
    data: d.toLocaleDateString("pt-BR"),
    hora: d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
  };
}

/** Mock usado no modo demo (espelha o Figma). */
const MOCK: Atendimento[] = (
  [
    {
      id: "1",
      paciente: "João Pedro Oliveira",
      cpf: "12345678900",
      profissional: "Dra. Ana Beatriz Costa",
      profissionalId: "1",
      especialidade: "Cardiologia",
      iso: "2026-06-12T09:00:00",
      motivo: "Consulta de rotina",
      status: "confirmado" as AppointmentStatus,
    },
    {
      id: "2",
      paciente: "Maria Clara Santos",
      cpf: "98765432100",
      profissional: "Dr. Carlos Henrique Lima",
      profissionalId: "3",
      especialidade: "Clínica Geral",
      iso: "2026-06-12T10:30:00",
      motivo: "Retorno",
      status: "agendado" as AppointmentStatus,
    },
    {
      id: "3",
      paciente: "Pedro Henrique Lima",
      cpf: "45678912300",
      profissional: "Dra. Ana Beatriz Costa",
      profissionalId: "1",
      especialidade: "Cardiologia",
      iso: "2026-06-12T11:15:00",
      motivo: "Avaliação pré-operatória",
      status: "em_atendimento" as AppointmentStatus,
    },
    {
      id: "4",
      paciente: "Fernanda Almeida Souza",
      cpf: "32165498700",
      profissional: "Dr. Rafael Moura",
      profissionalId: "2",
      especialidade: "Ortopedia",
      iso: "2026-06-12T08:00:00",
      motivo: "Pós-cirúrgico",
      status: "concluido" as AppointmentStatus,
    },
  ] as const
).map((m) => {
  const { data, hora } = formatPtBr(m.iso);
  return {
    id: m.id,
    paciente: m.paciente,
    cpf: m.cpf,
    profissional: m.profissional,
    profissionalId: m.profissionalId,
    especialidade: m.especialidade,
    data,
    dataISO: m.iso.slice(0, 10),
    hora,
    motivo: m.motivo,
    status: m.status,
    statusLabel: STATUS_LABEL[m.status],
    badge: STATUS_BADGE[m.status],
  };
});

/** Lista atendimentos: do banco quando configurado, mock no modo demo. */
export async function listAppointments(): Promise<Atendimento[]> {
  if (isDemoMode()) return MOCK;

  const supabase = await createClient();
  let query = supabase
    .from("appointments")
    .select(
      "id, starts_at, reason, status, professional_id, patients(full_name, cpf), professionals(specialty, profiles(full_name))",
    )
    .order("starts_at", { ascending: true });

  // Escopo 'own' (módulo 'agenda'): o papel só vê os agendamentos do próprio
  // profissional. Admin é sempre 'all' (seed) → sem filtro. Sem vínculo de
  // profissional, não filtra.
  const scope = await getViewScope("agenda");
  if (scope === "own") {
    const myProfessionalId = await getMyProfessionalId();
    if (myProfessionalId) query = query.eq("professional_id", myProfessionalId);
  }

  const { data, error } = await query;

  if (error || !data) return [];

  // PostgREST pode tipar relações 1:1 como objeto ou array — normaliza para objeto.
  const one = <T,>(v: unknown): T | null =>
    Array.isArray(v) ? ((v[0] ?? null) as T | null) : ((v as T) ?? null);

  return data.map((r) => {
    const patient = one<{ full_name: string | null; cpf: string | null }>(
      r.patients,
    );
    const professional = one<{
      specialty: string | null;
      profiles: { full_name: string | null } | null;
    }>(r.professionals);
    const profProfile = one<{ full_name: string | null }>(professional?.profiles);

    const status = (r.status as AppointmentStatus) ?? "agendado";
    const startsIso = r.starts_at as string | null;
    const { data: dataFmt, hora } = formatPtBr(startsIso);
    // Data local (yyyy-mm-dd) coerente com a hora exibida (toLocaleTimeString).
    const dt = startsIso ? new Date(startsIso) : null;
    const dataISO =
      dt && !Number.isNaN(dt.getTime())
        ? `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(
            dt.getDate(),
          ).padStart(2, "0")}`
        : "";

    return {
      id: r.id as string,
      paciente: patient?.full_name ?? "—",
      cpf: (patient?.cpf ?? "").replace(/\D/g, ""),
      profissional: profProfile?.full_name ?? "—",
      profissionalId: (r.professional_id as string | null) ?? "",
      especialidade: professional?.specialty ?? "—",
      data: dataFmt,
      dataISO,
      hora,
      motivo: (r.reason as string | null) ?? "—",
      status,
      statusLabel: STATUS_LABEL[status] ?? status,
      badge: STATUS_BADGE[status] ?? "wait",
    };
  });
}

/** Calcula as contagens por status para os KPIs (concluido → Finalizados). */
export function countByStatus(items: Atendimento[]): AppointmentKpis {
  return {
    total: items.length,
    agendados: items.filter((i) => i.status === "agendado").length,
    confirmados: items.filter((i) => i.status === "confirmado").length,
    emAtendimento: items.filter((i) => i.status === "em_atendimento").length,
    finalizados: items.filter((i) => i.status === "concluido").length,
  };
}

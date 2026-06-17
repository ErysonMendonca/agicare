import { createClient } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/supabase/config";

/** Valores brutos (sem fallback "—") para pré-preencher o modal de edição. */
export type ProfissionalEdit = {
  profileId: string;
  full_name: string;
  specialty: string;
  council_reg: string;
  phone: string;
  role: string;
  active: boolean;
  cep: string;
  address: string;
  address_number: string;
  complement: string;
  neighborhood: string;
  city: string;
  state: string;
  /** Observações (4º bloco do cadastro — escopo 11.2). */
  notes: string;
};

export type Profissional = {
  id: string;
  nome: string;
  especialidade: string;
  crm: string;
  cargo: string;
  email: string;
  telefone: string;
  ativo: boolean;
  /** Papel bruto (profiles.role) usado para classificar clínica × administrativa. */
  role: string;
  /** Consultas do dia (agendamentos de hoje, não cancelados) — dado real. */
  consultasHoje: number;
  /** Próxima consulta futura ("Hoje 14:30" / "12/06 09:00") ou null. */
  proximaConsulta: string | null;
  /** Dados crus p/ edição (form). E-mail fica de fora (vive em auth.users). */
  edit: ProfissionalEdit;
};

/** Papéis considerados "equipe clínica" (os demais entram como administrativa). */
const PAPEIS_CLINICOS = ["medico", "enfermeiro", "enfermagem"];

/** Rótulo amigável do cargo a partir do papel bruto. */
function rotuloCargo(role: string): string {
  switch (role) {
    case "medico":
      return "Médico";
    case "enfermeiro":
    case "enfermagem":
      return "Enfermagem";
    case "recepcao":
      return "Recepção";
    case "admin":
      return "Administração";
    default:
      return role || "—";
  }
}

/** True quando o profissional faz parte da equipe clínica (assistencial). */
export function isClinico(p: Profissional): boolean {
  return PAPEIS_CLINICOS.includes(p.role);
}

/** Endereço + observações vazios (campos opcionais) para entradas mock. */
const ENDERECO_VAZIO = {
  cep: "",
  address: "",
  address_number: "",
  complement: "",
  neighborhood: "",
  city: "",
  state: "",
  notes: "",
};

/** Mock usado no modo demo (espelha o Figma). */
const MOCK: Profissional[] = [
  {
    id: "1",
    nome: "Dr. João Pedro Oliveira",
    especialidade: "Cardiologia",
    crm: "CRM/SP 123456",
    cargo: "Médico",
    email: "joao.oliveira@clinica.com",
    telefone: "(11) 98765-4321",
    ativo: true,
    role: "medico",
    consultasHoje: 8,
    proximaConsulta: "Hoje 14:30",
    edit: {
      profileId: "1",
      full_name: "Dr. João Pedro Oliveira",
      specialty: "Cardiologia",
      council_reg: "CRM/SP 123456",
      phone: "(11) 98765-4321",
      role: "medico",
      active: true,
      ...ENDERECO_VAZIO,
    },
  },
  {
    id: "2",
    nome: "Dra. Ana Paula Costa",
    especialidade: "Ortopedia",
    crm: "CRM/SP 234567",
    cargo: "Médico",
    email: "ana.costa@clinica.com",
    telefone: "(11) 98765-4322",
    ativo: true,
    role: "medico",
    consultasHoje: 5,
    proximaConsulta: "Hoje 16:00",
    edit: {
      profileId: "2",
      full_name: "Dra. Ana Paula Costa",
      specialty: "Ortopedia",
      council_reg: "CRM/SP 234567",
      phone: "(11) 98765-4322",
      role: "medico",
      active: true,
      ...ENDERECO_VAZIO,
    },
  },
  {
    id: "3",
    nome: "Dr. Carlos Eduardo Mendes",
    especialidade: "Dermatologia",
    crm: "CRM/SP 345678",
    cargo: "Médico",
    email: "carlos.mendes@clinica.com",
    telefone: "(11) 98765-4323",
    ativo: true,
    role: "medico",
    consultasHoje: 0,
    proximaConsulta: "12/06 09:00",
    edit: {
      profileId: "3",
      full_name: "Dr. Carlos Eduardo Mendes",
      specialty: "Dermatologia",
      council_reg: "CRM/SP 345678",
      phone: "(11) 98765-4323",
      role: "medico",
      active: true,
      ...ENDERECO_VAZIO,
    },
  },
  {
    id: "4",
    nome: "Enf. Mariana Souza Lima",
    especialidade: "Enfermagem",
    crm: "COREN/SP 456789",
    cargo: "Enfermagem",
    email: "mariana.lima@clinica.com",
    telefone: "(11) 98765-4324",
    ativo: true,
    role: "enfermeiro",
    consultasHoje: 3,
    proximaConsulta: null,
    edit: {
      profileId: "4",
      full_name: "Enf. Mariana Souza Lima",
      specialty: "Enfermagem",
      council_reg: "COREN/SP 456789",
      phone: "(11) 98765-4324",
      role: "medico",
      active: true,
      ...ENDERECO_VAZIO,
    },
  },
];

/** Indicador de agenda por profissional (consultas do dia + próxima consulta). */
type AgendaIndicador = { consultasHoje: number; proxima: string | null };

/** Status que mantêm um agendamento "vivo" para contar/projetar próxima consulta. */
const STATUS_ATIVOS = ["agendado", "confirmado", "em_atendimento"];

/** Rótulo curto da próxima consulta: "Hoje HH:mm" se for hoje, senão "dd/mm HH:mm". */
function rotuloProxima(dt: Date, hoje: Date): string {
  const hora = dt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const mesmoDia =
    dt.getFullYear() === hoje.getFullYear() &&
    dt.getMonth() === hoje.getMonth() &&
    dt.getDate() === hoje.getDate();
  if (mesmoDia) return `Hoje ${hora}`;
  const dm = dt.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  return `${dm} ${hora}`;
}

/**
 * Agrega, por profissional, os indicadores de agenda a partir de `appointments`
 * REAIS (RLS escopa à clínica ativa). Uma única query a partir do início do dia:
 *  • consultasHoje — agendamentos de hoje não cancelados;
 *  • proxima       — primeiro agendamento futuro ainda ativo (lista ordenada asc).
 */
async function fetchAgendaIndicadores(
  supabase: Awaited<ReturnType<typeof createClient>>,
  ids: string[],
): Promise<Map<string, AgendaIndicador>> {
  const out = new Map<string, AgendaIndicador>();
  if (ids.length === 0) return out;

  const agora = new Date();
  const inicioHoje = new Date(
    agora.getFullYear(),
    agora.getMonth(),
    agora.getDate(),
  );
  const inicioAmanha = new Date(inicioHoje);
  inicioAmanha.setDate(inicioAmanha.getDate() + 1);

  const { data, error } = await supabase
    .from("appointments")
    .select("professional_id, starts_at, status")
    .in("professional_id", ids)
    .gte("starts_at", inicioHoje.toISOString())
    .order("starts_at", { ascending: true });

  if (error || !data) return out;

  for (const row of data) {
    const pid = row.professional_id as string | null;
    if (!pid) continue;
    const startsIso = row.starts_at as string | null;
    if (!startsIso) continue;
    const dt = new Date(startsIso);
    if (Number.isNaN(dt.getTime())) continue;
    const status = (row.status as string | null) ?? "agendado";

    const cur = out.get(pid) ?? { consultasHoje: 0, proxima: null };

    // Consultas do dia: dentro de hoje e não canceladas (faltou/concluído contam
    // como ocupação do dia; apenas cancelado é descartado).
    if (status !== "cancelado" && dt >= inicioHoje && dt < inicioAmanha) {
      cur.consultasHoje += 1;
    }

    // Próxima consulta: primeira futura ainda ativa (data já vem ordenada asc).
    if (
      cur.proxima === null &&
      dt.getTime() >= agora.getTime() &&
      STATUS_ATIVOS.includes(status)
    ) {
      cur.proxima = rotuloProxima(dt, agora);
    }

    out.set(pid, cur);
  }

  return out;
}

/** Lista profissionais: do banco quando configurado, mock no modo demo. */
export async function listProfessionals(): Promise<Profissional[]> {
  if (isDemoMode()) return MOCK;

  const supabase = await createClient();
  // NOTE: cep/address/...,notes vêm das migrations 0012/0034. Se não aplicadas,
  // o select falha e a lista cai no [] abaixo.
  const { data, error } = await supabase
    .from("professionals")
    .select(
      "id, profile_id, specialty, council_reg, active, cep, address, address_number, complement, neighborhood, city, state, notes, profiles(full_name, phone, role)",
    )
    .order("created_at", { ascending: false });

  if (error || !data) return [];

  // Indicadores de agenda (consultas do dia + próxima) por profissional.
  const indicadores = await fetchAgendaIndicadores(
    supabase,
    data.map((r) => r.id as string),
  );

  return data.map((r) => {
    // O join pode vir como objeto ou array dependendo da inferência do PostgREST.
    const perfil = Array.isArray(r.profiles) ? r.profiles[0] : r.profiles;
    const role = perfil?.role ?? "";
    const ind = indicadores.get(r.id as string);
    return {
      id: r.id,
      nome: perfil?.full_name ?? "—",
      especialidade: r.specialty ?? "—",
      crm: r.council_reg ?? "—",
      cargo: rotuloCargo(role),
      email: "",
      telefone: perfil?.phone ?? "—",
      ativo: !!r.active,
      role,
      consultasHoje: ind?.consultasHoje ?? 0,
      proximaConsulta: ind?.proxima ?? null,
      edit: {
        profileId: r.profile_id ?? "",
        full_name: perfil?.full_name ?? "",
        specialty: r.specialty ?? "",
        council_reg: r.council_reg ?? "",
        phone: perfil?.phone ?? "",
        role: role || "medico",
        active: !!r.active,
        cep: r.cep ?? "",
        address: r.address ?? "",
        address_number: r.address_number ?? "",
        complement: r.complement ?? "",
        neighborhood: r.neighborhood ?? "",
        city: r.city ?? "",
        state: r.state ?? "",
        notes: r.notes ?? "",
      },
    };
  });
}

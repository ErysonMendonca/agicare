import { createClient } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/supabase/config";
import { getActiveClinicId } from "@/lib/tenant";

/** Credenciamento de convênio (TISS 3.0) para o formulário (0070). */
export type CredencialEdit = {
  convenio: string;
  vigencia: string;
  convenio_code: string;
  lab_code: string;
  tiss_login: string;
  tiss_password: string;
  recebe_eletivo: boolean;
  recebe_urgencia: boolean;
  recebe_internacao: boolean;
  xml_tag: string;
  cpf_or_convenio_code: string;
};

/** Valores brutos (sem fallback "—") para pré-preencher o modal de edição. */
export type ProfissionalEdit = {
  profileId: string;
  full_name: string;
  specialty: string;
  council_reg: string;
  /** E-mail de contato real do profissional (0085). */
  email: string;
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
  // Dados pessoais / tipo de profissional / conselho detalhado (0070) — opcionais
  // p/ compat com o MOCK; a leitura real sempre popula.
  person_type?: string;
  document?: string;
  social_name?: string;
  birth_date?: string;
  sex?: string;
  gender?: string;
  mother_name?: string;
  race?: string;
  birthplace?: string;
  nationality?: string;
  cns?: string;
  cnes?: string;
  council_number?: string;
  council_name?: string;
  council_uf?: string;
  council_expiry?: string;
  /** Credenciamentos de convênio (só admin lê — RLS 0070). */
  credentials?: CredencialEdit[];
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
  /** Dados crus p/ edição (form). E-mail de contato real vive em professionals (0085). */
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
  email: "",
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
      "id, profile_id, specialty, council_reg, active, email, cep, address, address_number, complement, neighborhood, city, state, notes, " +
        "person_type, document, social_name, birth_date, sex, gender, mother_name, race, birthplace, nationality, cns, cnes, " +
        "council_number, council_name, council_uf, council_expiry, " +
        "professional_insurance_credentials(convenio, vigencia, convenio_code, lab_code, tiss_login, tiss_password, recebe_eletivo, recebe_urgencia, recebe_internacao, xml_tag, cpf_or_convenio_code), " +
        "profiles(full_name, phone, role)",
    )
    .order("created_at", { ascending: false });

  if (error || !data) return [];

  // O select concatenado + embed degrada a inferência do supabase-js; tipamos a
  // linha explicitamente (o runtime já está correto).
  type S = string | null;
  type ProfRow = {
    id: string;
    profile_id: S;
    specialty: S;
    council_reg: S;
    active: boolean | null;
    email: S;
    cep: S;
    address: S;
    address_number: S;
    complement: S;
    neighborhood: S;
    city: S;
    state: S;
    notes: S;
    person_type: S;
    document: S;
    social_name: S;
    birth_date: S;
    sex: S;
    gender: S;
    mother_name: S;
    race: S;
    birthplace: S;
    nationality: S;
    cns: S;
    cnes: S;
    council_number: S;
    council_name: S;
    council_uf: S;
    council_expiry: S;
    professional_insurance_credentials: Array<Record<string, unknown>> | null;
    profiles: unknown;
  };
  const rows = data as unknown as ProfRow[];

  // Indicadores de agenda (consultas do dia + próxima) por profissional.
  const indicadores = await fetchAgendaIndicadores(
    supabase,
    rows.map((r) => r.id),
  );

  return rows.map((r) => {
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
      email: r.email ?? "",
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
        email: r.email ?? "",
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
        person_type: (r.person_type as string | null) ?? "",
        document: (r.document as string | null) ?? "",
        social_name: (r.social_name as string | null) ?? "",
        birth_date: (r.birth_date as string | null) ?? "",
        sex: (r.sex as string | null) ?? "",
        gender: (r.gender as string | null) ?? "",
        mother_name: (r.mother_name as string | null) ?? "",
        race: (r.race as string | null) ?? "",
        birthplace: (r.birthplace as string | null) ?? "",
        nationality: (r.nationality as string | null) ?? "",
        cns: (r.cns as string | null) ?? "",
        cnes: (r.cnes as string | null) ?? "",
        council_number: (r.council_number as string | null) ?? "",
        council_name: (r.council_name as string | null) ?? "",
        council_uf: (r.council_uf as string | null) ?? "",
        council_expiry: (r.council_expiry as string | null) ?? "",
        credentials: (Array.isArray(r.professional_insurance_credentials)
          ? r.professional_insurance_credentials
          : []
        ).map((c) => ({
          convenio: (c.convenio as string | null) ?? "",
          vigencia: (c.vigencia as string | null) ?? "",
          convenio_code: (c.convenio_code as string | null) ?? "",
          lab_code: (c.lab_code as string | null) ?? "",
          tiss_login: (c.tiss_login as string | null) ?? "",
          tiss_password: (c.tiss_password as string | null) ?? "",
          recebe_eletivo: !!c.recebe_eletivo,
          recebe_urgencia: !!c.recebe_urgencia,
          recebe_internacao: !!c.recebe_internacao,
          xml_tag: (c.xml_tag as string | null) ?? "",
          cpf_or_convenio_code: (c.cpf_or_convenio_code as string | null) ?? "",
        })),
      },
    };
  });
}

/**
 * Vínculo leve de profissional para filtros no modal de atendimento.
 * Diferente de {@link Profissional}, NÃO calcula indicadores de agenda —
 * só o essencial p/ filtrar a lista "Profissional" por especialidade.
 */
export type ProfissionalVinculo = {
  id: string;
  nome: string;
  especialidade: string;
  ativo: boolean;
};

/** Mock coerente com o catálogo de especialidades (modo demo). */
const MOCK_VINCULO: ProfissionalVinculo[] = [
  { id: "1", nome: "Dr. João Pedro Oliveira", especialidade: "2 - CARDIOLOGIA", ativo: true },
  { id: "2", nome: "Dra. Ana Paula Costa", especialidade: "3 - ORTOPEDIA", ativo: true },
  { id: "3", nome: "Dr. Carlos Eduardo Mendes", especialidade: "4 - DERMATOLOGIA", ativo: true },
];

/**
 * Profissionais ATIVOS da clínica ativa, com nome e especialidade, ordenados
 * por nome. Loader leve (sem agenda) para alimentar o filtro do modal de
 * atendimento. RLS + filtro explícito por `clinic_id`.
 */
export async function listProfissionaisVinculo(): Promise<ProfissionalVinculo[]> {
  if (isDemoMode()) return MOCK_VINCULO;

  const clinicId = await getActiveClinicId();
  if (!clinicId) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("professionals")
    .select("id, specialty, active, profiles(full_name)")
    .eq("clinic_id", clinicId)
    .eq("active", true);
  if (error || !data) return [];

  // O embed do PostgREST pode vir como objeto ou array; normalizamos.
  const one = <T,>(v: unknown): T | null =>
    Array.isArray(v) ? ((v[0] ?? null) as T | null) : ((v as T) ?? null);

  return data
    .map((r) => {
      const perfil = one<{ full_name: string | null }>(r.profiles);
      return {
        id: r.id as string,
        nome: perfil?.full_name ?? "",
        especialidade: (r.specialty as string | null) ?? "",
        ativo: !!r.active,
      };
    })
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

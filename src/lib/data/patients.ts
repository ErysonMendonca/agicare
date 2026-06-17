import { createClient } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/supabase/config";
import { requireClinic } from "@/lib/tenant";

export type Paciente = {
  id: string;
  nome: string;
  cpf: string;
  telefone: string;
  email: string;
  convenio: string;
  tipoSanguineo: string;
  alergia: boolean;
  emTratamento: boolean;
  cardiaco: boolean;
  /** Status real do paciente (coluna `active`); óbito/inativação → false. */
  ativo: boolean;
  /** Paciente falecido (coluna `death_date`); distingue óbito de mera inativação. */
  obito: boolean;
};

/** Mock usado no modo demo (espelha o Figma). */
const MOCK: Paciente[] = [
  { id: "1", nome: "João Pedro Oliveira", cpf: "111.222.333-44", telefone: "(11) 91234-5678", email: "joao.oliveira@email.com", convenio: "Unimed", tipoSanguineo: "O+", alergia: true, emTratamento: true, cardiaco: true, ativo: true, obito: false },
  { id: "2", nome: "Maria Clara Santos", cpf: "222.333.444-55", telefone: "(11) 92345-6789", email: "maria.santos@email.com", convenio: "Particular", tipoSanguineo: "A+", alergia: false, emTratamento: false, cardiaco: false, ativo: true, obito: false },
  { id: "3", nome: "Pedro Henrique Lima", cpf: "333.444.555-66", telefone: "(11) 93456-7890", email: "responsavel@email.com", convenio: "Amil", tipoSanguineo: "B+", alergia: true, emTratamento: true, cardiaco: false, ativo: false, obito: false },
];

/** Lista pacientes: do banco quando configurado, mock no modo demo. */
export async function listPatients(): Promise<Paciente[]> {
  if (isDemoMode()) return MOCK;

  const supabase = await createClient();
  // select('*') é resiliente a colunas ausentes (cardiac/active vêm de migrations
  // posteriores); campos faltantes caem no fallback de cada `??`.
  const { data, error } = await supabase
    .from("patients")
    .select("*")
    .order("created_at", { ascending: false });

  if (error || !data) return [];

  return data.map((p) => ({
    id: p.id as string,
    nome: (p.full_name as string | null) ?? "",
    cpf: (p.cpf as string | null) ?? "",
    telefone: (p.phone as string | null) ?? "",
    email: (p.email as string | null) ?? "",
    convenio: (p.convenio as string | null) ?? "—",
    tipoSanguineo: (p.blood_type as string | null) ?? "—",
    alergia: !!p.allergies,
    emTratamento: !!p.in_treatment,
    cardiaco: !!p.cardiac,
    // `active` pode não existir (resiliência): default true; óbito força false.
    ativo: p.death_date ? false : p.active !== false,
    obito: !!p.death_date,
  }));
}

// ── Dados crus para edição (pré-preenchimento do formulário) ────────
/**
 * Espelha 1:1 os campos do formulário de cadastro/edição (sem formatação:
 * datas em ISO `yyyy-mm-dd`, gênero/raça nos códigos do <select>, documentos
 * como foram digitados). Endereço vem das colunas estruturadas (0026), com
 * fallback para o texto livre em `notes` dos cadastros antigos.
 */
export type PacienteEditavel = {
  id: string;
  full_name: string;
  social_name: string;
  cpf: string;
  cns: string;
  birth_date: string;
  gender: string;
  mother_name: string;
  naturality: string;
  nationality: string;
  race: string;
  ethnicity: string;
  marital_status: string;
  legal_guardian: string;
  blood_type: string;
  convenio: string;
  plan: string;
  origin: string;
  phone: string;
  email: string;
  cep: string;
  address: string;
  district: string;
  city: string;
  uf: string;
  death_date: string;
  death_cause: string;
  /**
   * Versão da linha (coluna `updated_at`, migration 0044), usada como token de
   * OPTIMISTIC LOCK: o form embarca este valor e o UPDATE casa por ele para
   * detectar edição concorrente. Vazio quando ausente (cadastros pré-0044).
   */
  updated_at: string;
};

const DEMO_EDITAVEL: PacienteEditavel = {
  id: "1",
  full_name: "João Pedro Oliveira",
  social_name: "",
  cpf: "111.222.333-44",
  cns: "700 0000 0000 0000",
  birth_date: "1985-03-15",
  gender: "masculino",
  mother_name: "Ana Oliveira",
  naturality: "São Paulo",
  nationality: "Brasileira",
  race: "Parda",
  ethnicity: "",
  marital_status: "Casado(a)",
  legal_guardian: "",
  blood_type: "O+",
  convenio: "Unimed",
  plan: "Premium",
  origin: "",
  phone: "(11) 91234-5678",
  email: "joao.oliveira@email.com",
  cep: "01310-100",
  address: "Av. Paulista, 1000",
  district: "Bela Vista",
  city: "São Paulo",
  uf: "SP",
  death_date: "",
  death_cause: "",
  updated_at: "",
};

/**
 * Lê os dados crus de um paciente para edição (RLS staff). Demo → mock.
 * Escopa explicitamente pela clínica ativa (defesa-em-profundidade, além da
 * RLS) e carrega `updated_at` (token do optimistic lock — ver 0044).
 */
export async function getPatientEditavel(
  id: string,
): Promise<PacienteEditavel | null> {
  if (isDemoMode()) return DEMO_EDITAVEL;

  const clinicId = await requireClinic();
  const supabase = await createClient();
  const { data: p, error } = await supabase
    .from("patients")
    .select("*")
    .eq("id", id)
    .eq("clinic_id", clinicId)
    .maybeSingle();
  if (error || !p) return null;

  // Endereço: colunas estruturadas (0026) com fallback ao texto livre em notes.
  const cepCol = (p.cep as string | null) ?? "";
  const endCol = (p.address as string | null) ?? "";
  const bairroCol = (p.district as string | null) ?? "";
  const cidadeCol = (p.city as string | null) ?? "";
  const ufCol = (p.state as string | null) ?? "";
  const temEnderecoEstruturado =
    !!(cepCol || endCol || bairroCol || cidadeCol || ufCol);

  let cepFb = "",
    endFb = "",
    bairroFb = "",
    cidadeFb = "",
    ufFb = "";
  const notas = (p.notes as string | null) ?? null;
  if (!temEnderecoEstruturado && notas?.startsWith("Endereço:")) {
    const partes = notas
      .replace(/^Endereço:\s*/, "")
      .split(",")
      .map((s) => s.trim());
    [endFb, bairroFb, cidadeFb, ufFb, cepFb] = [
      partes[0] ?? "",
      partes[1] ?? "",
      partes[2] ?? "",
      partes[3] ?? "",
      partes[4] ?? "",
    ];
  }

  const isoData = (v: unknown): string =>
    typeof v === "string" ? v.slice(0, 10) : "";

  return {
    id: p.id as string,
    full_name: (p.full_name as string | null) ?? "",
    social_name: (p.social_name as string | null) ?? "",
    cpf: (p.cpf as string | null) ?? "",
    cns: (p.cns as string | null) ?? "",
    birth_date: isoData(p.birth_date),
    gender: (p.gender as string | null) ?? "",
    mother_name: (p.mother_name as string | null) ?? "",
    naturality: (p.naturality as string | null) ?? "",
    nationality: (p.nationality as string | null) ?? "",
    race: (p.race as string | null) ?? "",
    ethnicity: (p.ethnicity as string | null) ?? "",
    marital_status: (p.marital_status as string | null) ?? "",
    legal_guardian: (p.legal_guardian as string | null) ?? "",
    blood_type: (p.blood_type as string | null) ?? "",
    convenio: (p.convenio as string | null) ?? "",
    plan: (p.plan as string | null) ?? "",
    origin: (p.origin as string | null) ?? "",
    phone: (p.phone as string | null) ?? "",
    email: (p.email as string | null) ?? "",
    cep: cepCol || cepFb,
    address: endCol || endFb,
    district: bairroCol || bairroFb,
    city: cidadeCol || cidadeFb,
    uf: ufCol || ufFb,
    death_date: isoData(p.death_date),
    death_cause: (p.death_cause as string | null) ?? "",
    // Token do optimistic lock. Vazio em cadastros pré-0044 (coluna ausente):
    // nesse caso o UPDATE não aplica o .eq() e mantém o comportamento antigo.
    updated_at: (p.updated_at as string | null) ?? "",
  };
}

// ── Ficha do paciente (detalhe) ─────────────────────────────────────
export type DadosPessoais = {
  nome: string;
  nomeSocial: string | null;
  cpf: string;
  cns: string;
  nascimento: string;
  idade: string;
  genero: string;
  nomeMae: string;
  naturalidade: string;
  nacionalidade: string;
  raca: string;
  etnia: string;
  estadoCivil: string;
  responsavel: string;
  tipoSanguineo: string;
  convenio: string;
  plano: string;
};

export type Contato = {
  telefone: string;
  email: string;
  cep: string;
  endereco: string;
  bairro: string;
  cidade: string;
  uf: string;
};

export type Alertas = {
  alergia: boolean;
  emTratamento: boolean;
  cardiaco: boolean;
};

/** Um evento na timeline cronológica de passagens do paciente. */
export type PassagemTipo = "consulta" | "exame" | "procedimento" | "evolucao";

export type Passagem = {
  id: string;
  tipo: PassagemTipo;
  titulo: string;
  detalhe: string;
  profissional: string;
  /** ISO para ordenação. */
  iso: string;
  data: string;
};

export type FichaPaciente = {
  id: string;
  ativo: boolean;
  obito: { data: string; causa: string } | null;
  pessoais: DadosPessoais;
  contato: Contato;
  alertas: Alertas;
  manualRecord: string | null;
  /** Caminho no Storage (bucket `prontuarios`) do arquivo de prontuário anexado. */
  manualRecordPath: string | null;
  /** Nome original do arquivo anexado (para exibição/download). */
  manualRecordName: string | null;
  notas: string | null;
  passagens: Passagem[];
};

const GENERO: Record<string, string> = {
  masculino: "Masculino",
  feminino: "Feminino",
  outro: "Outro",
};

function calcIdade(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const anos = Math.floor((Date.now() - d.getTime()) / (365.25 * 24 * 3600 * 1000));
  return `${anos} anos`;
}

function fmtData(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("pt-BR");
}

function fmtDataHora(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${d.toLocaleDateString("pt-BR")} ${d.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

const CONSULTA_STATUS: Record<string, string> = {
  agendado: "Agendado",
  confirmado: "Confirmado",
  em_atendimento: "Em atendimento",
  concluido: "Concluído",
  cancelado: "Cancelado",
  faltou: "Faltou",
};

function profNome(rel: unknown): string {
  const prof = Array.isArray(rel) ? rel[0] : rel;
  if (!prof) return "—";
  const profiles = (prof as { profiles?: unknown }).profiles;
  const profile = Array.isArray(profiles) ? profiles[0] : profiles;
  return (profile as { full_name?: string } | null)?.full_name ?? "—";
}

const DEMO_FICHA: FichaPaciente = {
  id: "1",
  ativo: true,
  obito: null,
  pessoais: {
    nome: "João Pedro Oliveira",
    nomeSocial: null,
    cpf: "111.222.333-44",
    cns: "700 0000 0000 0000",
    nascimento: "15/03/1985",
    idade: "41 anos",
    genero: "Masculino",
    nomeMae: "Ana Oliveira",
    naturalidade: "São Paulo",
    nacionalidade: "Brasileira",
    raca: "Parda",
    etnia: "—",
    estadoCivil: "Casado(a)",
    responsavel: "—",
    tipoSanguineo: "O+",
    convenio: "Unimed",
    plano: "Premium",
  },
  contato: {
    telefone: "(11) 91234-5678",
    email: "joao.oliveira@email.com",
    cep: "01310-100",
    endereco: "Av. Paulista, 1000",
    bairro: "Bela Vista",
    cidade: "São Paulo",
    uf: "SP",
  },
  alertas: { alergia: true, emTratamento: true, cardiaco: true },
  manualRecord:
    "Prontuário manual anexado no cadastro (digitalização das fichas físicas anteriores).",
  manualRecordPath: null,
  manualRecordName: null,
  notas: null,
  passagens: [
    { id: "p1", tipo: "consulta", titulo: "Consulta — Cardiologia", detalhe: "Concluído", profissional: "Dra. Ana Beatriz Costa", iso: "2026-06-12T08:30:00Z", data: "12/06/2026 08:30" },
    { id: "p2", tipo: "exame", titulo: "Hemograma completo", detalhe: "Laboratorial · Concluído", profissional: "Dra. Ana Beatriz Costa", iso: "2026-06-10T10:00:00Z", data: "10/06/2026 10:00" },
    { id: "p3", tipo: "procedimento", titulo: "Curativo simples", detalhe: "Membro inferior direito", profissional: "Enf. Carla Menezes", iso: "2026-05-22T14:15:00Z", data: "22/05/2026 14:15" },
    { id: "p4", tipo: "evolucao", titulo: "Evolução clínica", detalhe: "Retorno. Exames dentro da normalidade.", profissional: "Dra. Ana Beatriz Costa", iso: "2026-05-01T14:00:00Z", data: "01/05/2026 14:00" },
  ],
};

/**
 * Ficha completa de um paciente: dados pessoais + contato/endereço + alertas
 * clínicos + a timeline cronológica de passagens (consultas, exames,
 * procedimentos de enfermagem e evoluções). Resiliente a colunas/tabelas
 * ausentes — cada fonte falha "para vazio" sem derrubar a ficha.
 */
export async function getPatientFicha(id: string): Promise<FichaPaciente | null> {
  if (isDemoMode()) return DEMO_FICHA;

  const supabase = await createClient();

  const { data: p, error } = await supabase
    .from("patients")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error || !p) return null;

  // Endereço: prefere colunas estruturadas (0026); cai para o texto livre em notes.
  const cepCol = (p.cep as string | null) ?? "";
  const endCol = (p.address as string | null) ?? "";
  const bairroCol = (p.district as string | null) ?? "";
  const cidadeCol = (p.city as string | null) ?? "";
  const ufCol = (p.state as string | null) ?? "";
  const temEnderecoEstruturado =
    !!(cepCol || endCol || bairroCol || cidadeCol || ufCol);

  const notas = (p.notes as string | null) ?? null;
  let cepFb = "",
    endFb = "",
    bairroFb = "",
    cidadeFb = "",
    ufFb = "";
  if (!temEnderecoEstruturado && notas?.startsWith("Endereço:")) {
    const partes = notas
      .replace(/^Endereço:\s*/, "")
      .split(",")
      .map((s) => s.trim());
    [endFb, bairroFb, cidadeFb, ufFb, cepFb] = [
      partes[0] ?? "",
      partes[1] ?? "",
      partes[2] ?? "",
      partes[3] ?? "",
      partes[4] ?? "",
    ];
  }

  const genero = (p.gender as string | null) ?? "";

  // ── Timeline: 4 fontes, todas best-effort ──────────────────────────
  const passagens: Passagem[] = [];

  // Consultas (appointments).
  const { data: apps } = await supabase
    .from("appointments")
    .select("id, starts_at, status, reason, professionals(profiles(full_name))")
    .eq("patient_id", id)
    .order("starts_at", { ascending: false });
  for (const a of apps ?? []) {
    const iso = (a.starts_at as string | null) ?? "";
    passagens.push({
      id: `app-${a.id}`,
      tipo: "consulta",
      titulo: (a.reason as string | null) || "Consulta",
      detalhe: CONSULTA_STATUS[(a.status as string) ?? ""] ?? "—",
      profissional: profNome(a.professionals),
      iso,
      data: fmtDataHora(iso),
    });
  }

  // Exames (exam_orders).
  const { data: exams } = await supabase
    .from("exam_orders")
    .select("id, exam_name, category, status, created_at, professionals(profiles(full_name))")
    .eq("patient_id", id)
    .order("created_at", { ascending: false });
  for (const e of exams ?? []) {
    const iso = (e.created_at as string | null) ?? "";
    const cat = (e.category as string | null) === "imagem" ? "Imagem" : "Laboratorial";
    const st = (e.status as string | null) === "concluido" ? "Concluído" : "Solicitado";
    passagens.push({
      id: `exam-${e.id}`,
      tipo: "exame",
      titulo: (e.exam_name as string | null) ?? "Exame",
      detalhe: `${cat} · ${st}`,
      profissional: profNome(e.professionals),
      iso,
      data: fmtDataHora(iso),
    });
  }

  // Procedimentos de enfermagem (nursing_procedures).
  const { data: procs } = await supabase
    .from("nursing_procedures")
    .select("id, name, body_site, professional_name, performed_at")
    .eq("patient_id", id)
    .order("performed_at", { ascending: false });
  for (const pr of procs ?? []) {
    const iso = (pr.performed_at as string | null) ?? "";
    passagens.push({
      id: `proc-${pr.id}`,
      tipo: "procedimento",
      titulo: (pr.name as string | null) ?? "Procedimento",
      detalhe: (pr.body_site as string | null) ?? "—",
      profissional: (pr.professional_name as string | null) ?? "—",
      iso,
      data: fmtDataHora(iso),
    });
  }

  // Evoluções (medical_records).
  const { data: recs } = await supabase
    .from("medical_records")
    .select("id, content, created_at, professionals(profiles(full_name))")
    .eq("patient_id", id)
    .order("created_at", { ascending: false });
  for (const r of recs ?? []) {
    const iso = (r.created_at as string | null) ?? "";
    passagens.push({
      id: `rec-${r.id}`,
      tipo: "evolucao",
      titulo: "Evolução clínica",
      detalhe: (r.content as string | null) ?? "",
      profissional: profNome(r.professionals),
      iso,
      data: fmtDataHora(iso),
    });
  }

  // Ordena toda a timeline por data desc.
  passagens.sort((a, b) => (a.iso < b.iso ? 1 : a.iso > b.iso ? -1 : 0));

  const deathDate = p.death_date as string | null;

  return {
    id: p.id as string,
    ativo: deathDate ? false : p.active !== false,
    obito: deathDate
      ? { data: fmtData(deathDate), causa: (p.death_cause as string | null) ?? "—" }
      : null,
    pessoais: {
      nome: (p.full_name as string | null) ?? "—",
      nomeSocial: (p.social_name as string | null) ?? null,
      cpf: (p.cpf as string | null) ?? "—",
      cns: (p.cns as string | null) ?? "—",
      nascimento: fmtData(p.birth_date as string | null),
      idade: calcIdade(p.birth_date as string | null),
      genero: GENERO[genero] ?? (genero || "—"),
      nomeMae: (p.mother_name as string | null) ?? "—",
      naturalidade: (p.naturality as string | null) ?? "—",
      nacionalidade: (p.nationality as string | null) ?? "—",
      raca: (p.race as string | null) ?? "—",
      etnia: (p.ethnicity as string | null) ?? "—",
      estadoCivil: (p.marital_status as string | null) ?? "—",
      responsavel: (p.legal_guardian as string | null) ?? "—",
      tipoSanguineo: (p.blood_type as string | null) ?? "—",
      convenio: (p.convenio as string | null) ?? "—",
      plano: (p.plan as string | null) ?? "—",
    },
    contato: {
      telefone: (p.phone as string | null) ?? "—",
      email: (p.email as string | null) ?? "—",
      cep: cepCol || cepFb || "—",
      endereco: endCol || endFb || "—",
      bairro: bairroCol || bairroFb || "—",
      cidade: cidadeCol || cidadeFb || "—",
      uf: ufCol || ufFb || "—",
    },
    alertas: {
      alergia: !!p.allergies,
      emTratamento: !!p.in_treatment,
      cardiaco: !!p.cardiac,
    },
    manualRecord: (p.manual_record as string | null) ?? null,
    manualRecordPath: (p.manual_record_path as string | null) ?? null,
    manualRecordName: (p.manual_record_name as string | null) ?? null,
    notas:
      notas && !notas.startsWith("Endereço:") ? notas : null,
    passagens,
  };
}

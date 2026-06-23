import { createClient } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/supabase/config";
import { getCurrentUser } from "@/lib/auth";
import { type FilaItem } from "@/lib/data/queue";

export type Identificacao = {
  nome: string;
  registro: string;
  idade: string;
  nascimento: string;
  genero: string;
  nomeMae: string;
  convenio: string;
  manualRecord: string | null;
  /** Caminho no Storage (bucket `prontuarios`) do arquivo anexado no cadastro. */
  manualRecordPath: string | null;
  /** Nome original do arquivo anexado. */
  manualRecordName: string | null;
};

export type SinaisVitais = {
  recordedAt: string;
  pa: string;
  fc: string;
  fr: string;
  temp: string;
  peso: string;
  altura: string;
  spo2: string;
  glucose: string;
} | null;

export type Evolucao = {
  id: string;
  data: string;
  profissional: string;
  conteudo: string;
};

/** Item de medicamento ativo (último itinerário de prescrição do paciente). */
export type PrescricaoAtivaItem = {
  id: string;
  medicamento: string;
  dosagem: string;
  duracao: string;
};

/** Exame solicitado com seu status atual. */
export type ExameResumo = {
  id: string;
  nome: string;
  categoria: string;
  status: string;
};

export type Resumo = {
  identificacao: Identificacao;
  vitais: SinaisVitais;
  evolucoes: Evolucao[];
  /** Medicamentos da prescrição mais recente (visão 360º inline). */
  prescricoesAtivas: PrescricaoAtivaItem[];
  /** Exames solicitados do paciente (com status). */
  examesSolicitados: ExameResumo[];
};

/** Especialidade do profissional logado (default do Prontuário). Null = todas. */
export async function getMySpecialty(): Promise<string | null> {
  if (isDemoMode()) return null;
  const current = await getCurrentUser();
  if (!current) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("professionals")
    .select("specialty")
    .eq("profile_id", current.userId)
    .maybeSingle();
  return (data?.specialty as string | null) ?? null;
}

/** HH:MM local a partir de um timestamp ISO (— quando inválido). */
function formatHora(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

/** Início/fim (ISO) de um dia local informado como yyyy-mm-dd. */
function dayRangeISO(dateISO: string): { startISO: string; endISO: string } {
  const [y, m, d] = dateISO.split("-").map(Number);
  const start = new Date(y, (m ?? 1) - 1, d ?? 1);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { startISO: start.toISOString(), endISO: end.toISOString() };
}

/**
 * Atendimentos HISTÓRICOS de uma data passada, a partir de `attendance_records`
 * (ficha administrativa salva na Fila — migration 0037). Mapeia para `FilaItem`
 * para reusar os mesmos cards/lista do Prontuário. Escopo por clínica via RLS
 * (policy attendance_records_staff_all). Demo/erro/ data vazia → [].
 *
 * Como a ficha não guarda senha/prioridade/status de fila, o item é apresentado
 * como "Finalizado" (atendimento já registrado) e o `codigo` (Registro) usa o
 * id curto do registro — mantendo os filtros Registro/Paciente operacionais.
 */
export async function listAtendimentosPorData(
  dateISO: string,
  opts?: { specialty?: string | null },
): Promise<FilaItem[]> {
  if (isDemoMode() || !dateISO) return [];

  try {
    const supabase = await createClient();
    const { startISO, endISO } = dayRangeISO(dateISO);

    let query = supabase
      .from("attendance_records")
      .select(
        "id, patient_id, patient_name, medico, especialidade, convenio, created_at",
      )
      .gte("created_at", startISO)
      .lt("created_at", endISO)
      .order("created_at", { ascending: false });

    if (opts?.specialty) query = query.eq("especialidade", opts.specialty);

    const { data, error } = await query;
    if (error || !data) return [];

    return data.map((r) => ({
      id: r.id as string,
      patientId: (r.patient_id as string | null) ?? null,
      codigo: (r.id as string).slice(0, 8).toUpperCase(),
      paciente: (r.patient_name as string | null) ?? "—",
      hora: formatHora(r.created_at as string | null),
      especialidade: (r.especialidade as string | null) ?? "—",
      medico: (r.medico as string | null) ?? "—",
      convenio: (r.convenio as string | null) ?? "—",
      status: { label: "Finalizado", tone: "ok" },
      statusRaw: "finalizado",
      priorityRaw: "normal",
      appointmentId: null,
      agendado: false,
    }));
  } catch {
    return [];
  }
}

/** Idade em anos a partir da data de nascimento (ISO). */
function calcIdade(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const diff = Date.now() - d.getTime();
  const anos = Math.floor(diff / (365.25 * 24 * 3600 * 1000));
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

const GENERO: Record<string, string> = {
  masculino: "Masculino",
  feminino: "Feminino",
  outro: "Outro",
};

const DEMO_RESUMO: Resumo = {
  identificacao: {
    nome: "Maria Silva Santos",
    registro: "REG-000123",
    idade: "40 anos",
    nascimento: "12/03/1985",
    genero: "Feminino",
    nomeMae: "Joana Silva Santos",
    convenio: "Unimed",
    manualRecord:
      "Prontuário manual anexado no cadastro (digitalização das fichas físicas anteriores).",
    manualRecordPath: null,
    manualRecordName: null,
  },
  vitais: {
    recordedAt: "12/06/2026 08:10",
    pa: "120/80 mmHg",
    fc: "72 bpm",
    fr: "16 irpm",
    temp: "36.5 °C",
    peso: "75 kg",
    altura: "1.75 m",
    spo2: "98 %",
    glucose: "92 mg/dL",
  },
  evolucoes: [
    {
      id: "1",
      data: "12/06/2026 08:30",
      profissional: "Dra. Ana Beatriz Costa",
      conteudo: "Consulta inicial. Paciente refere dor torácica leve...",
    },
    {
      id: "2",
      data: "01/05/2026 14:00",
      profissional: "Dra. Ana Beatriz Costa",
      conteudo: "Retorno. Exames dentro da normalidade.",
    },
  ],
  prescricoesAtivas: [
    {
      id: "m1",
      medicamento: "Dipirona 500mg",
      dosagem: "1 ampola · Endovenosa (EV) · 6/6h",
      duracao: "3 dias",
    },
    {
      id: "m2",
      medicamento: "Omeprazol 40mg",
      dosagem: "1 cp · Oral · 1x ao dia",
      duracao: "14 dias",
    },
  ],
  examesSolicitados: [
    {
      id: "e1",
      nome: "Hemograma completo",
      categoria: "laboratorial",
      status: "solicitado",
    },
    {
      id: "e2",
      nome: "Eletrocardiograma",
      categoria: "imagem",
      status: "concluido",
    },
  ],
};

/** Resumo 360º do paciente para o prontuário. Resiliente à migration 0004. */
export async function getResumo(patientId: string): Promise<Resumo | null> {
  if (isDemoMode()) return DEMO_RESUMO;

  const supabase = await createClient();

  // select('*') não falha se as colunas da 0004 ainda não existirem.
  const { data: p, error } = await supabase
    .from("patients")
    .select("*")
    .eq("id", patientId)
    .maybeSingle();
  if (error || !p) return null;

  // Sinais vitais (try/catch implícito: erro → sem aferição).
  const { data: v } = await supabase
    .from("vital_signs")
    .select("*")
    .eq("patient_id", patientId)
    .order("recorded_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const vitais: SinaisVitais = v
    ? {
        recordedAt: fmtDataHora(v.recorded_at as string),
        pa:
          v.systolic && v.diastolic
            ? `${v.systolic}/${v.diastolic} mmHg`
            : "—",
        fc: v.heart_rate ? `${v.heart_rate} bpm` : "—",
        fr: v.resp_rate ? `${v.resp_rate} irpm` : "—",
        temp: v.temperature ? `${v.temperature} °C` : "—",
        peso: v.weight ? `${v.weight} kg` : "—",
        altura: v.height ? `${v.height} m` : "—",
        spo2: v.spo2 ? `${v.spo2} %` : "—",
        glucose: v.glucose ? `${v.glucose} mg/dL` : "—",
      }
    : null;

  // Evoluções (medical_records).
  const { data: recs } = await supabase
    .from("medical_records")
    .select("id, content, created_at, professionals(profiles(full_name))")
    .eq("patient_id", patientId)
    .order("created_at", { ascending: false });

  const evolucoes: Evolucao[] = (recs ?? []).map((r) => {
    const prof = Array.isArray(r.professionals)
      ? r.professionals[0]
      : r.professionals;
    const profile = Array.isArray(prof?.profiles)
      ? prof?.profiles[0]
      : prof?.profiles;
    return {
      id: r.id as string,
      data: fmtDataHora(r.created_at as string),
      profissional: profile?.full_name ?? "—",
      conteudo: (r.content as string | null) ?? "",
    };
  });

  // Prescrição ATIVA = a mais recente do paciente; mostramos seus medicamentos
  // inline no resumo (medicamento/dosagem/duração). Erro → lista vazia.
  const { data: ultimaPresc } = await supabase
    .from("prescriptions")
    .select(
      "id, prescription_items(id, name, concentration, posology, route, frequency, duration)",
    )
    .eq("patient_id", patientId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const itensPresc = Array.isArray(ultimaPresc?.prescription_items)
    ? ultimaPresc.prescription_items
    : [];
  const prescricoesAtivas: PrescricaoAtivaItem[] = itensPresc.map((it) => {
    const nome = (it.name as string | null) ?? "—";
    const conc = it.concentration as string | null;
    // Dosagem = posologia + via + frequência, separadas por "·" (ignora vazios).
    const dosagem =
      [
        it.posology as string | null,
        it.route as string | null,
        it.frequency as string | null,
      ]
        .filter(Boolean)
        .join(" · ") || "—";
    return {
      id: it.id as string,
      medicamento: conc ? `${nome} ${conc}` : nome,
      dosagem,
      duracao: (it.duration as string | null) ?? "—",
    };
  });

  // Exames solicitados (com status). Erro → lista vazia.
  const { data: exames } = await supabase
    .from("exam_orders")
    .select("id, exam_name, category, status, created_at")
    .eq("patient_id", patientId)
    .order("created_at", { ascending: false });

  const examesSolicitados: ExameResumo[] = (exames ?? []).map((e) => ({
    id: e.id as string,
    nome: (e.exam_name as string | null) ?? "—",
    categoria: (e.category as string | null) ?? "laboratorial",
    status: (e.status as string | null) ?? "solicitado",
  }));

  const genero = (p.gender as string | null) ?? "";

  // Número de atendimento = senha (ticket_code) da entrada de fila mais recente
  // do paciente — é o "Registro Atendimento" usado na lista do prontuário. NÃO é
  // o CPF. Sem entrada na fila (paciente fora de atendimento) → "—".
  const { data: ultimaEntrada } = await supabase
    .from("queue_entries")
    .select("ticket_code")
    .eq("patient_id", patientId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const numeroAtendimento = (ultimaEntrada?.ticket_code as string | null) || "—";

  return {
    identificacao: {
      nome: (p.full_name as string) ?? "—",
      registro: numeroAtendimento,
      idade: calcIdade(p.birth_date as string | null),
      nascimento: fmtData(p.birth_date as string | null),
      genero: GENERO[genero] ?? (genero || "—"),
      nomeMae: (p.mother_name as string | null) ?? "—",
      convenio: (p.convenio as string | null) ?? "—",
      manualRecord: (p.manual_record as string | null) ?? null,
      manualRecordPath: (p.manual_record_path as string | null) ?? null,
      manualRecordName: (p.manual_record_name as string | null) ?? null,
    },
    vitais,
    evolucoes,
    prescricoesAtivas,
    examesSolicitados,
  };
}

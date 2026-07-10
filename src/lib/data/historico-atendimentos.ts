import { createClient } from "@/lib/supabase/server";

// ════════════════════════════════════════════════════════════════
// Histórico do prontuário AGRUPADO POR ATENDIMENTO.
//
// Reúne os documentos clínicos das 5 tabelas (anamneses, prescriptions,
// certificates, exam_orders, medical_records) e os agrupa pela entrada da
// fila (queue_entries) que os originou — o "atendimento". Documentos legados
// (sem queue_entry_id) caem num grupo final "Anteriores / sem atendimento".
//
// Contrato de tipos ACORDADO com o frontend — NÃO renomear.
// ════════════════════════════════════════════════════════════════

export type DocumentoHistorico = {
  tipo:
    | "Anamnese"
    | "Evolução"
    | "Prescrição"
    | "Atestado"
    | "Alta"
    | "Receituário"
    | "Exame";
  titulo: string; // rótulo curto (ex.: nome do exame, "Atestado de N dias", 1ª linha do texto)
  data: string; // "dd/MM/yyyy HH:mm"
  aba: "anamnese" | "evolucao" | "prescricao" | "documentos" | "receituario" | "exames"; // segmento da rota p/ link
};

export type HistoricoAtendimento = {
  queueEntryId: string | null; // null = grupo "Anteriores / sem atendimento"
  atendimentoCodigo: string | null; // queue_entries.attendance_code
  data: string; // data do atendimento ("dd/MM/yyyy"); no grupo null, vazio
  profissional: string;
  especialidade: string;
  documentos: DocumentoHistorico[];
};

// ── Helpers de formatação ───────────────────────────────────────────
function fmtDataHora(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${d.toLocaleDateString("pt-BR")} ${d.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

function fmtData(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("pt-BR");
}

/** Desembrulha relações do PostgREST (que às vezes vêm como array). */
function one<T>(v: unknown): T | null {
  if (Array.isArray(v)) return (v[0] ?? null) as T | null;
  return (v as T) ?? null;
}

/** 1ª linha (curta) de um texto livre, para servir de título. */
function primeiraLinha(texto: string | null | undefined, fallback: string): string {
  if (!texto) return fallback;
  const linha = texto.split("\n").map((l) => l.trim()).find((l) => l.length > 0);
  if (!linha) return fallback;
  return linha.length > 60 ? `${linha.slice(0, 57)}…` : linha;
}

// Estrutura interna: documento + a entrada de fila a que pertence (ou null).
type DocInterno = DocumentoHistorico & { queueEntryId: string | null; ts: number };

const ts = (iso: string | null): number => {
  if (!iso) return 0;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? 0 : t;
};

// ── Fallback demo (para a tela não nascer vazia) ────────────────────
const DEMO_HISTORICO: HistoricoAtendimento[] = [
  {
    queueEntryId: "demo-atd-1",
    atendimentoCodigo: "A001",
    data: "12/06/2026",
    profissional: "Dra. Ana Beatriz Costa",
    especialidade: "Cardiologia",
    documentos: [
      {
        tipo: "Evolução",
        titulo: "Paciente refere dor torácica ao esforço.",
        data: "12/06/2026 09:20",
        aba: "evolucao",
      },
      {
        tipo: "Receituário",
        titulo: "Dipirona 500mg — 1 comp de 6/6h por 3 dias.",
        data: "12/06/2026 09:25",
        aba: "receituario",
      },
      {
        tipo: "Exame",
        titulo: "Eletrocardiograma",
        data: "12/06/2026 09:30",
        aba: "exames",
      },
    ],
  },
  {
    queueEntryId: "demo-atd-2",
    atendimentoCodigo: "A002",
    data: "10/06/2026",
    profissional: "Dra. Ana Beatriz Costa",
    especialidade: "Podológico",
    documentos: [
      {
        tipo: "Anamnese",
        titulo: "Anamnese",
        data: "10/06/2026 10:15",
        aba: "anamnese",
      },
    ],
  },
];

/**
 * Histórico do paciente agrupado por atendimento (entrada da fila).
 * Escopo por RLS (multitenant). Retorna DEMO quando não há dado real.
 */
export async function getHistoricoAtendimentos(
  patientId: string,
): Promise<HistoricoAtendimento[]> {
  const supabase = await createClient();

  // 1) Atendimentos do paciente (entradas da fila).
  const { data: filaData } = await supabase
    .from("queue_entries")
    .select(
      "id, attendance_code, created_at, specialty, status, professionals(profiles(full_name))",
    )
    .eq("patient_id", patientId)
    .order("created_at", { ascending: false });

  // 2) Documentos das 5 tabelas (todos where patient_id eq).
  const [anamnesesRes, prescricoesRes, certificadosRes, examesRes, evolucoesRes] =
    await Promise.all([
      supabase
        .from("anamneses")
        .select("id, queue_entry_id, specialty, created_at")
        .eq("patient_id", patientId),
      supabase
        .from("prescriptions")
        .select("id, queue_entry_id, notes, created_at")
        .eq("patient_id", patientId),
      supabase
        .from("certificates")
        .select("id, queue_entry_id, kind, days, prescription_text, created_at")
        .eq("patient_id", patientId),
      supabase
        .from("exam_orders")
        .select("id, queue_entry_id, exam_name, created_at")
        .eq("patient_id", patientId),
      supabase
        .from("medical_records")
        .select("id, queue_entry_id, content, created_at")
        .eq("patient_id", patientId),
    ]);

  const docs: DocInterno[] = [];

  // Anamneses → aba "anamnese".
  for (const a of anamnesesRes.data ?? []) {
    docs.push({
      tipo: "Anamnese",
      titulo: (a.specialty as string | null)
        ? `Anamnese — ${a.specialty as string}`
        : "Anamnese",
      data: fmtDataHora(a.created_at as string | null),
      aba: "anamnese",
      queueEntryId: (a.queue_entry_id as string | null) ?? null,
      ts: ts(a.created_at as string | null),
    });
  }

  // Prescrições → aba "prescricao".
  for (const p of prescricoesRes.data ?? []) {
    docs.push({
      tipo: "Prescrição",
      titulo: primeiraLinha(p.notes as string | null, "Prescrição"),
      data: fmtDataHora(p.created_at as string | null),
      aba: "prescricao",
      queueEntryId: (p.queue_entry_id as string | null) ?? null,
      ts: ts(p.created_at as string | null),
    });
  }

  // Certificates: atestado | alta → "documentos"; receituário → "receituario".
  // Distinção do RECEITUÁRIO: kind começa com 'receituario' OU prescription_text
  // preenchido (atestado/alta nunca têm prescription_text). Ver 0079.
  for (const c of certificadosRes.data ?? []) {
    const kind = ((c.kind as string | null) ?? "").toLowerCase();
    const temTextoReceita = !!(c.prescription_text as string | null);
    const ehReceituario = kind.startsWith("receituario") || temTextoReceita;

    let tipo: DocumentoHistorico["tipo"];
    let aba: DocumentoHistorico["aba"];
    let titulo: string;

    if (ehReceituario) {
      tipo = "Receituário";
      aba = "receituario";
      titulo = primeiraLinha(
        c.prescription_text as string | null,
        kind === "receituario_especial" ? "Receituário especial" : "Receituário",
      );
    } else if (kind === "alta") {
      tipo = "Alta";
      aba = "documentos";
      titulo = "Alta médica";
    } else {
      tipo = "Atestado";
      aba = "documentos";
      const dias = c.days as number | null;
      titulo = dias ? `Atestado de ${dias} dia(s)` : "Atestado";
    }

    docs.push({
      tipo,
      titulo,
      data: fmtDataHora(c.created_at as string | null),
      aba,
      queueEntryId: (c.queue_entry_id as string | null) ?? null,
      ts: ts(c.created_at as string | null),
    });
  }

  // Solicitações de exame → aba "exames".
  for (const e of examesRes.data ?? []) {
    docs.push({
      tipo: "Exame",
      titulo: (e.exam_name as string | null) ?? "Exame",
      data: fmtDataHora(e.created_at as string | null),
      aba: "exames",
      queueEntryId: (e.queue_entry_id as string | null) ?? null,
      ts: ts(e.created_at as string | null),
    });
  }

  // Prontuário / evolução → aba "evolucao".
  for (const m of evolucoesRes.data ?? []) {
    docs.push({
      tipo: "Evolução",
      titulo: primeiraLinha(m.content as string | null, "Evolução"),
      data: fmtDataHora(m.created_at as string | null),
      aba: "evolucao",
      queueEntryId: (m.queue_entry_id as string | null) ?? null,
      ts: ts(m.created_at as string | null),
    });
  }

  // 3) Agrupa os documentos por queue_entry_id.
  const porAtendimento = new Map<string, DocInterno[]>();
  const legados: DocInterno[] = [];
  for (const d of docs) {
    if (d.queueEntryId) {
      const arr = porAtendimento.get(d.queueEntryId) ?? [];
      arr.push(d);
      porAtendimento.set(d.queueEntryId, arr);
    } else {
      legados.push(d);
    }
  }

  const stripInterno = (d: DocInterno): DocumentoHistorico => ({
    tipo: d.tipo,
    titulo: d.titulo,
    data: d.data,
    aba: d.aba,
  });
  const porDataDesc = (a: DocInterno, b: DocInterno) => b.ts - a.ts;

  // 4) Monta um grupo por atendimento (na ordem das entradas: data desc).
  const grupos: HistoricoAtendimento[] = [];
  for (const q of filaData ?? []) {
    const id = q.id as string;
    const seus = (porAtendimento.get(id) ?? []).sort(porDataDesc);
    if (seus.length === 0) continue; // atendimento sem documento não aparece
    porAtendimento.delete(id);

    const prof = one<{ profiles: unknown }>(q.professionals);
    const profile = one<{ full_name: string | null }>(prof?.profiles);

    grupos.push({
      queueEntryId: id,
      atendimentoCodigo: (q.attendance_code as string | null) ?? null,
      data: fmtData(q.created_at as string | null),
      profissional: profile?.full_name ?? "—",
      especialidade: (q.specialty as string | null) ?? "—",
      documentos: seus.map(stripInterno),
    });
  }

  // Documentos com queue_entry_id apontando p/ uma fila fora do escopo/apagada:
  // trata como legados também (não deixa documento sumir do histórico).
  for (const restantes of porAtendimento.values()) {
    legados.push(...restantes);
  }

  // 5) Grupo final "Anteriores / sem atendimento".
  if (legados.length > 0) {
    grupos.push({
      queueEntryId: null,
      atendimentoCodigo: null,
      data: "",
      profissional: "—",
      especialidade: "—",
      documentos: legados.sort(porDataDesc).map(stripInterno),
    });
  }

  // Fallback demo se não houver nada real.
  if (grupos.length === 0) return DEMO_HISTORICO;

  return grupos;
}

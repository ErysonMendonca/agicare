import { createClient } from "@/lib/supabase/server";
import { listStockProducts } from "@/lib/data/stock";
import { extrairConselho } from "@/lib/clinico/conselho";
import type {
  Medicamento,
  Prescricao,
  Checagem,
} from "@/lib/clinico/prescricao-shared";

// Re-exporta tipos/constantes client-safe (compat com imports existentes do server).
export type {
  Medicamento,
  FrequenciaOpcao,
  PrescricaoMedicamento,
  PrescricaoCuidado,
  Prescricao,
  Checagem,
} from "@/lib/clinico/prescricao-shared";
export {
  CUIDADOS_PREDEFINIDOS,
  FREQUENCIAS,
  VIAS_ADMINISTRACAO,
} from "@/lib/clinico/prescricao-shared";

/** Extrai a concentração do nome do produto (ex.: "Dipirona 500mg" → "500mg"). */
function parseConcentracao(nome: string): string {
  const m = nome.match(/(\d+(?:[.,]\d+)?\s?(?:mg|mcg|g|ml|ui|%)(?:\/\d+\s?ml)?)/i);
  return m ? m[1].replace(/\s+/g, "") : "—";
}

/**
 * Lista medicamentos do estoque para o auto-complete da prescrição,
 * já trazendo a concentração do cadastro. Reusa listStockProducts().
 */
export async function listMedicamentos(): Promise<Medicamento[]> {
  const produtos = await listStockProducts();
  return produtos
    .filter((p) => p.categoria.toLowerCase().includes("medicamento") && p.ativo)
    .map((p) => ({
      id: p.id,
      nome: p.produto,
      concentracao: parseConcentracao(p.produto),
    }));
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

const DEMO_PRESCRICOES: Prescricao[] = [
  {
    id: "demo-presc-1",
    dataHora: "12/06/2026 08:40",
    profissional: "Dra. Ana Beatriz Costa",
    conselho: "CRM-SP 123456",
    observacoes: "Reavaliar em 48h.",
    medicamentos: [
      {
        id: "m1",
        nome: "Dipirona 500mg (ampola)",
        concentracao: "500mg",
        posologia: "1 ampola",
        via: "Endovenosa (EV)",
        duracao: "3 dias",
        frequencia: "6/6h",
        observacoes: "Se dor ou febre.",
      },
    ],
    cuidados: [
      {
        id: "c1",
        nome: "Aferição de sinais vitais",
        frequencia: "6/6h",
        duracao: "3 dias",
        observacoes: "",
      },
    ],
    cancelledAt: null,
    cancelReason: null,
  },
];

/** Lista prescrições do paciente com seus medicamentos e cuidados. */
export async function listPrescricoes(patientId: string): Promise<Prescricao[]> {

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("prescriptions")
    .select(
      "id, notes, created_at, cancelled_at, cancel_reason, professionals(council_name, council_uf, council_number, council_reg, profiles(full_name)), prescription_items(id, name, concentration, posology, route, duration, frequency, observations), care_orders(id, name, frequency, duration, observations)",
    )
    .eq("patient_id", patientId)
    .order("created_at", { ascending: false });

  if (error || !data) return [];

  return data.map((p) => {
    const prof = Array.isArray(p.professionals)
      ? p.professionals[0]
      : p.professionals;
    const profile = Array.isArray(prof?.profiles)
      ? prof?.profiles[0]
      : prof?.profiles;
    const itens = Array.isArray(p.prescription_items)
      ? p.prescription_items
      : [];
    const cuidados = Array.isArray(p.care_orders) ? p.care_orders : [];

    return {
      id: p.id as string,
      dataHora: fmtDataHora(p.created_at as string | null),
      profissional: profile?.full_name ?? "—",
      conselho: extrairConselho(p.professionals),
      observacoes: (p.notes as string | null) ?? "",
      medicamentos: itens.map((it) => ({
        id: it.id as string,
        nome: (it.name as string | null) ?? "—",
        concentracao: (it.concentration as string | null) ?? "—",
        posologia: (it.posology as string | null) ?? "—",
        via: (it.route as string | null) ?? "",
        duracao: (it.duration as string | null) ?? "—",
        frequencia: (it.frequency as string | null) ?? "—",
        observacoes: (it.observations as string | null) ?? "",
      })),
      cuidados: cuidados.map((c) => ({
        id: c.id as string,
        nome: (c.name as string | null) ?? "—",
        frequencia: (c.frequency as string | null) ?? "—",
        duracao: (c.duration as string | null) ?? "—",
        observacoes: (c.observations as string | null) ?? "",
      })),
      cancelledAt: (p.cancelled_at as string | null) ?? null,
      cancelReason: (p.cancel_reason as string | null) ?? null,
    };
  });
}

const DEMO_CHECAGENS: Checagem[] = [
  {
    id: "demo-chk-1",
    tipo: "medicamento",
    rotulo: "Dipirona 500mg",
    frequencia: "6/6h",
    horario: "12/06/2026 12:00",
    status: "pendente",
    checadoEm: null,
  },
  {
    id: "demo-chk-2",
    tipo: "cuidado",
    rotulo: "Aferição de sinais vitais",
    frequencia: "6/6h",
    horario: "12/06/2026 12:00",
    status: "checado",
    checadoEm: "12/06/2026 12:05",
  },
];

/** Lista a fila de checagem (aprazamentos) do paciente, por horário. */
export async function listChecagens(patientId: string): Promise<Checagem[]> {

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("prescription_checks")
    .select(
      "id, source_type, source_label, frequency, scheduled_at, status, checked_at",
    )
    .eq("patient_id", patientId)
    .order("scheduled_at", { ascending: true });

  if (error || !data) return [];

  return data.map((c) => ({
    id: c.id as string,
    tipo: ((c.source_type as string) === "cuidado"
      ? "cuidado"
      : "medicamento") as Checagem["tipo"],
    rotulo: (c.source_label as string | null) ?? "—",
    frequencia: (c.frequency as string | null) ?? "—",
    horario: fmtDataHora(c.scheduled_at as string | null),
    status: ((c.status as string) === "checado"
      ? "checado"
      : "pendente") as Checagem["status"],
    checadoEm: c.checked_at ? fmtDataHora(c.checked_at as string) : null,
  }));
}

/**
 * Tipos e constantes da prescrição — CLIENT-SAFE (sem dependência de servidor).
 * As funções de dados (que usam Supabase server) ficam em src/lib/data/prescricao.ts.
 */

// ── Medicamentos (auto-complete a partir do estoque) ────────────────
export type Medicamento = {
  id: string;
  nome: string;
  /** Concentração derivada do cadastro (ex.: "500mg"). */
  concentracao: string;
};

// ── Catálogo fixo de cuidados (menu pré-definido) ───────────────────
export const CUIDADOS_PREDEFINIDOS = [
  "Aferição de sinais vitais",
  "Curativo",
  "Higiene oral",
  "Mudança de decúbito",
  "Controle de glicemia capilar",
  "Banho no leito",
  "Balanço hídrico",
  "Oxigenoterapia",
] as const;

// ── Vias de administração (5.4) ─────────────────────────────────────
export const VIAS_ADMINISTRACAO = [
  "Oral",
  "Endovenosa (EV)",
  "Intramuscular (IM)",
  "Subcutânea (SC)",
  "Sublingual",
  "Tópica",
  "Inalatória",
  "Retal",
  "Oftálmica",
  "Nasal",
] as const;
export type ViaAdministracao = (typeof VIAS_ADMINISTRACAO)[number];

// ── Frequências (rótulo + intervalo em horas para aprazamento) ──────
export type FrequenciaOpcao = { label: string; intervaloHoras: number };

export const FREQUENCIAS: FrequenciaOpcao[] = [
  { label: "6/6h", intervaloHoras: 6 },
  { label: "8/8h", intervaloHoras: 8 },
  { label: "12/12h", intervaloHoras: 12 },
  { label: "1x ao dia", intervaloHoras: 24 },
  { label: "Dose única", intervaloHoras: 0 },
];

// ── Prescrições registradas ─────────────────────────────────────────
export type PrescricaoMedicamento = {
  id: string;
  nome: string;
  concentracao: string;
  posologia: string;
  /** Via de administração (oral/EV/IM/…). Campo dedicado da 0039. */
  via: string;
  duracao: string;
  frequencia: string;
  observacoes: string;
};

export type PrescricaoCuidado = {
  id: string;
  nome: string;
  frequencia: string;
  duracao: string;
  observacoes: string;
};

export type Prescricao = {
  id: string;
  dataHora: string;
  profissional: string;
  observacoes: string;
  medicamentos: PrescricaoMedicamento[];
  cuidados: PrescricaoCuidado[];
  /** Cancelamento (não destrutivo): null = prescrição ativa. */
  cancelledAt: string | null;
  cancelReason: string | null;
};

// ── Checagem (aprazamentos) ─────────────────────────────────────────
export type Checagem = {
  id: string;
  tipo: "medicamento" | "cuidado";
  rotulo: string;
  frequencia: string;
  horario: string;
  status: "pendente" | "checado";
  checadoEm: string | null;
};

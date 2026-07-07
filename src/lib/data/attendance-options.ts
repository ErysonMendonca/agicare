import { createClient } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/supabase/config";
import {
  ATTENDANCE_OPTION_CATEGORIES,
  type AttendanceOptionCategory,
  type AttendanceOptionsByCategory,
} from "./attendance-options.shared";

// ════════════════════════════════════════════════════════════════
// Opções parametrizáveis da ficha de atendimento (escopo: modal de
// Dados do Atendimento). Server-only; o escopo por clínica é garantido
// pelo RLS (clinic_id = current_clinic_id()). Configuráveis pelo gestor
// em /configuracoes — ver actions/attendance-options.ts.
// Constantes/tipos PUROS vivem em ./attendance-options.shared (client-safe).
// ════════════════════════════════════════════════════════════════

export {
  ATTENDANCE_OPTION_CATEGORIES,
  type AttendanceOptionCategory,
  type AttendanceOption,
  type AttendanceOptionsByCategory,
} from "./attendance-options.shared";

/**
 * Defaults hardcoded (réplica do sistema de referência) usados em modo demo
 * — copiados de fila/DadosAtendimentoModal.tsx l.14-23. Mantém a UI funcional
 * sem banco. `value` = `label` (a UI grava o rótulo selecionado).
 */
const DEMO_OPTIONS: Record<AttendanceOptionCategory, string[]> = {
  origem: ["1 - RECEPÇÃO", "2 - PRONTO ATENDIMENTO", "3 - INTERNAÇÃO"],
  medico: ["1 - MÉDICO PADRÃO", "2 - DRA. MARINA SOUZA", "3 - DR. CARLOS EDUARDO"],
  especialidade: ["1 - MÉDICO CLÍNICO", "2 - CARDIOLOGIA", "3 - ORTOPEDIA"],
  encaminhamento: ["1 - PRIMEIRA CONSULTA", "2 - RETORNO", "3 - URGÊNCIA"],
  carater: ["1 - URGÊNCIA/EMERGÊNCIA", "2 - ELETIVO"],
  procedencia: ["9 - AMBULATÓRIO-CONS", "1 - DOMICÍLIO", "2 - OUTRA UNIDADE"],
  centro_custo: ["187 - RECEPÇÃO PRINCIPAL", "190 - PRONTO ATENDIMENTO"],
  convenio: ["SUS", "Unimed", "Particular", "Bradesco Saúde", "Amil"],
  plano: ["Ambulatorial", "Hospitalar", "Completo"],
  parentesco: ["Pai", "Mãe", "Cônjuge", "Filho(a)", "Outro"],
  // Catálogos de alta têm telas próprias (Motivos/Detalhes de Alta) e são lidos
  // por listAltaCatalogos(); aqui ficam vazios só para satisfazer o Record.
  motivo_alta: [],
  detalhe_alta: [],
  // Catálogos do cadastro de produto (demo).
  tipo_produto: ["Medicamento", "Material", "Solução", "Insumo", "EPI"],
  grupo_produto: ["0001 - Drogas e Medicamentos", "0002 - Material Médico Hospitalar"],
  unidade_medida: ["Ampola (AMP)", "Comprimido (COMP)", "Frasco (FR)", "Unidade (UN)"],
  via_administracao: ["Intramuscular (IM)", "Subcutânea (SC)", "Intravenosa (IV)", "Oral (VO)"],
  principio_ativo: ["Atropina", "Dipirona", "Adrenalina"],
  marca: [],
  localizacao: ["Prateleira A1", "Prateleira B2", "Geladeira 1"],
  classificacao_xyz: ["X", "Y", "Z"],
  tipo_profissional: ["Médico", "Enfermeiro", "Fisioterapeuta", "Nutricionista"],
};

function demoOptions(): AttendanceOptionsByCategory {
  const out: AttendanceOptionsByCategory = {};
  for (const category of ATTENDANCE_OPTION_CATEGORIES) {
    out[category] = DEMO_OPTIONS[category].map((label, i) => ({
      id: `demo-${category}-${i}`,
      label,
      value: label,
    }));
  }
  return out;
}

/**
 * Opções ATIVAS da clínica agrupadas por categoria, ordenadas por sort_order.
 * Em modo demo devolve os defaults hardcoded. Escopo por clínica via RLS.
 */
export async function listAttendanceOptions(): Promise<AttendanceOptionsByCategory> {
  if (isDemoMode()) return demoOptions();

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("attendance_options")
    .select("id, category, label, value, sort_order")
    .eq("active", true)
    .order("category", { ascending: true })
    .order("sort_order", { ascending: true });

  if (error || !data) return {};

  const out: AttendanceOptionsByCategory = {};
  for (const row of data as {
    id: string;
    category: string;
    label: string;
    value: string;
  }[]) {
    (out[row.category] ??= []).push({
      id: row.id,
      label: row.label,
      value: row.value,
    });
  }
  return out;
}

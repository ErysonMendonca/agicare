import { createClient } from "@/lib/supabase/server";
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
 * Opções ATIVAS da clínica agrupadas por categoria, ordenadas por sort_order.
 * Em modo demo devolve os defaults hardcoded. Escopo por clínica via RLS.
 */
export async function listAttendanceOptions(): Promise<AttendanceOptionsByCategory> {

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

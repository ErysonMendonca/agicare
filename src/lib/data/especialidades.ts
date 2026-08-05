import { createClient } from "@/lib/supabase/server";

// ════════════════════════════════════════════════════════════════
// Catálogo de Especialidades (attendance_options, category='especialidade').
// Server-only; escopo por clínica via RLS. Diferente de listAttendanceOptions
// (que só traz ATIVAS agrupadas), aqui trazemos TODAS (ativas e inativas) com
// os campos ricos (description/active/sortOrder) para a tela de Configurações.
// ════════════════════════════════════════════════════════════════

export type Especialidade = {
  id: string;
  label: string;
  description: string;
  active: boolean;
  sortOrder: number;
};

/**
 * Todas as especialidades da clínica (ativas E inativas), ordenadas por
 * sort_order. Em modo demo devolve exemplos hardcoded.
 */
export async function listEspecialidades(): Promise<Especialidade[]> {

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("attendance_options")
    .select("id, label, description, active, sort_order")
    .eq("category", "especialidade")
    .order("sort_order", { ascending: true });

  if (error || !data) return [];

  return (
    data as {
      id: string;
      label: string;
      description: string | null;
      active: boolean;
      sort_order: number | null;
    }[]
  ).map((row) => ({
    id: row.id,
    label: row.label,
    description: row.description ?? "",
    active: row.active ?? true,
    sortOrder: row.sort_order ?? 0,
  }));
}

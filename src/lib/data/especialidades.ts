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

const DEMO_ESPECIALIDADES: Especialidade[] = [
  {
    id: "demo-esp-0",
    label: "1 - MÉDICO CLÍNICO",
    description: "Clínica geral e atendimento de rotina.",
    active: true,
    sortOrder: 0,
  },
  {
    id: "demo-esp-1",
    label: "2 - CARDIOLOGIA",
    description: "Diagnóstico e tratamento de doenças do coração.",
    active: true,
    sortOrder: 1,
  },
  {
    id: "demo-esp-2",
    label: "3 - ORTOPEDIA",
    description: "Cuidados com ossos, articulações e músculos.",
    active: true,
    sortOrder: 2,
  },
  {
    id: "demo-esp-3",
    label: "4 - PEDIATRIA",
    description: "Atendimento infantil (inativa por padrão).",
    active: false,
    sortOrder: 3,
  },
];

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

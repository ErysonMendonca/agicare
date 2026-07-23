import { createClient } from "@/lib/supabase/server";
import type { CatalogoItem } from "@/lib/data/produto-catalogos";

// ════════════════════════════════════════════════════════════════
// Catálogo de INSTRUMENTAL (attendance_options, category='instrumental').
// Lista PLANA (sem parent_id). Espelha o padrão de leitura do Setor
// Fornecedor (product-requests.ts). RLS escopa por clínica.
//
// Diferença para "Materiais": instrumental é reutilizável e NÃO gera baixa
// de estoque — é apenas um catálogo selecionável associado ao procedimento.
// ════════════════════════════════════════════════════════════════

/** Instrumental disponível para associar a um procedimento (Select/checkbox). */
export type InstrumentalOption = {
  id: string;
  nome: string;
};

/** Instrumentais ATIVOS da clínica (p/ a etapa do wizard), ordenados. */
export async function listInstrumentais(): Promise<InstrumentalOption[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("attendance_options")
    .select("id, label, active, sort_order")
    .eq("category", "instrumental")
    .eq("active", true)
    .order("sort_order", { ascending: true })
    .order("label", { ascending: true });

  if (error || !data) return [];

  return (data as {
    id: string;
    label: string;
    active: boolean | null;
    sort_order: number | null;
  }[]).map((row) => ({ id: row.id, nome: row.label }));
}

/** Todos os instrumentais (ativos + inativos) p/ a tela de Configurações. */
export async function listInstrumentaisConfig(): Promise<CatalogoItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("attendance_options")
    .select("id, label, active, sort_order")
    .eq("category", "instrumental")
    .order("sort_order", { ascending: true })
    .order("label", { ascending: true });

  if (error || !data) return [];

  return (data as {
    id: string;
    label: string;
    active: boolean | null;
    sort_order: number | null;
  }[]).map((row) => ({
    id: row.id,
    label: row.label,
    active: row.active ?? true,
    sortOrder: row.sort_order ?? 0,
  }));
}

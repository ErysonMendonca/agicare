import { createClient } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/supabase/config";

// ════════════════════════════════════════════════════════════════
// Catálogos da ALTA (motivo + detalhe). Reusam public.attendance_options
// nas categorias 'motivo_alta' e 'detalhe_alta'. O detalhe é filtrado pelo
// motivo via attendance_options.parent_id (motivo → id do motivo).
// Server-only; escopo por clínica garantido pelo RLS (active=true).
// ════════════════════════════════════════════════════════════════

export type MotivoAlta = { id: string; label: string };
export type DetalheAlta = { id: string; label: string; parentId: string | null };

const DEMO_MOTIVOS: MotivoAlta[] = [
  { id: "demo-motivo-1", label: "Melhora clínica" },
  { id: "demo-motivo-2", label: "Alta a pedido" },
];

const DEMO_DETALHES: DetalheAlta[] = [
  { id: "demo-detalhe-1", label: "Sintomas resolvidos", parentId: "demo-motivo-1" },
  { id: "demo-detalhe-2", label: "Responsável assinou termo", parentId: "demo-motivo-2" },
];

/**
 * Catálogos ativos de motivo/detalhe de alta da clínica ativa, ordenados por
 * sort_order/label. `detalhe` traz parent_id→parentId para filtrar por motivo.
 * Em modo demo devolve fallback com 2 motivos + 2 detalhes ligados.
 */
export async function listAltaCatalogos(): Promise<{
  motivos: MotivoAlta[];
  detalhes: DetalheAlta[];
}> {
  if (isDemoMode()) return { motivos: DEMO_MOTIVOS, detalhes: DEMO_DETALHES };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("attendance_options")
    .select("id, category, label, parent_id, sort_order")
    .in("category", ["motivo_alta", "detalhe_alta"])
    .eq("active", true)
    .order("sort_order", { ascending: true })
    .order("label", { ascending: true });

  if (error || !data) return { motivos: [], detalhes: [] };

  const rows = data as {
    id: string;
    category: string;
    label: string;
    parent_id: string | null;
    sort_order: number | null;
  }[];

  const motivos: MotivoAlta[] = [];
  const detalhes: DetalheAlta[] = [];
  for (const row of rows) {
    if (row.category === "motivo_alta") {
      motivos.push({ id: row.id, label: row.label });
    } else {
      detalhes.push({ id: row.id, label: row.label, parentId: row.parent_id });
    }
  }

  return { motivos, detalhes };
}

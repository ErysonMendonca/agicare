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

// ════════════════════════════════════════════════════════════════
// Versão para a TELA DE CONFIGURAÇÃO (aba "Motivos e Detalhes de Alta").
// Diferente de listAltaCatalogos (só ativos, p/ o dropdown do modal de Alta):
// traz TODAS (ativas + inativas) e expõe active/sortOrder, para a tabela rica
// com Status e reordenação. NÃO usar no modal de Alta.
// ════════════════════════════════════════════════════════════════

export type MotivoAltaCfg = {
  id: string;
  label: string;
  active: boolean;
  sortOrder: number;
};
export type DetalheAltaCfg = {
  id: string;
  label: string;
  parentId: string | null;
  active: boolean;
  sortOrder: number;
};

const DEMO_MOTIVOS_CFG: MotivoAltaCfg[] = [
  { id: "demo-motivo-1", label: "Melhora clínica", active: true, sortOrder: 0 },
  { id: "demo-motivo-2", label: "Alta a pedido", active: true, sortOrder: 1 },
];
const DEMO_DETALHES_CFG: DetalheAltaCfg[] = [
  { id: "demo-detalhe-1", label: "Sintomas resolvidos", parentId: "demo-motivo-1", active: true, sortOrder: 0 },
  { id: "demo-detalhe-2", label: "Responsável assinou termo", parentId: "demo-motivo-2", active: true, sortOrder: 0 },
];

/** Catálogos de alta (motivo + detalhe) para a config: todos, com active/ordem. */
export async function listAltaCatalogosConfig(): Promise<{
  motivos: MotivoAltaCfg[];
  detalhes: DetalheAltaCfg[];
}> {
  if (isDemoMode())
    return { motivos: DEMO_MOTIVOS_CFG, detalhes: DEMO_DETALHES_CFG };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("attendance_options")
    .select("id, category, label, parent_id, active, sort_order")
    .in("category", ["motivo_alta", "detalhe_alta"])
    .order("sort_order", { ascending: true })
    .order("label", { ascending: true });

  if (error || !data) return { motivos: [], detalhes: [] };

  const rows = data as {
    id: string;
    category: string;
    label: string;
    parent_id: string | null;
    active: boolean | null;
    sort_order: number | null;
  }[];

  const motivos: MotivoAltaCfg[] = [];
  const detalhes: DetalheAltaCfg[] = [];
  for (const row of rows) {
    const base = {
      id: row.id,
      label: row.label,
      active: row.active ?? true,
      sortOrder: row.sort_order ?? 0,
    };
    if (row.category === "motivo_alta") {
      motivos.push(base);
    } else {
      detalhes.push({ ...base, parentId: row.parent_id });
    }
  }

  return { motivos, detalhes };
}

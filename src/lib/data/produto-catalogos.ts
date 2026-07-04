import { createClient } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/supabase/config";

// ════════════════════════════════════════════════════════════════
// Catálogos do cadastro de produto (attendance_options). Estes catálogos
// alimentam a MULTI-SELEÇÃO das abas-filhas do produto (unidades, vias,
// princípios ativos, marcas, localizações) + a classificação XYZ.
//
// Diferente de listAttendanceOptions (só ATIVAS, agrupadas p/ selects), aqui
// trazemos TODAS (ativas E inativas) com os campos ricos por categoria, para a
// tela de gestão no admin. Espelha listEspecialidades. Escopo por clínica (RLS).
// Server-only.
// ════════════════════════════════════════════════════════════════

/** Categorias de attendance_options que compõem os catálogos do produto. */
export const PRODUTO_CATALOGO_CATEGORIES = [
  "unidade_medida",
  "via_administracao",
  "principio_ativo",
  "marca",
  "localizacao",
  "classificacao_xyz",
] as const;

export type ProdutoCatalogoCategory =
  (typeof PRODUTO_CATALOGO_CATEGORIES)[number];

export type CatalogoItem = {
  id: string;
  label: string;
  active: boolean;
  sortOrder: number;
};

export type ProdutoCatalogos = Record<ProdutoCatalogoCategory, CatalogoItem[]>;

const DEMO_CATALOGOS: ProdutoCatalogos = {
  unidade_medida: [
    { id: "demo-um-0", label: "Ampola (AMP)", active: true, sortOrder: 0 },
    { id: "demo-um-1", label: "Comprimido (COMP)", active: true, sortOrder: 1 },
    { id: "demo-um-2", label: "Frasco (FR)", active: true, sortOrder: 2 },
    { id: "demo-um-3", label: "Unidade (UN)", active: true, sortOrder: 3 },
  ],
  via_administracao: [
    { id: "demo-va-0", label: "Intramuscular (IM)", active: true, sortOrder: 0 },
    { id: "demo-va-1", label: "Subcutânea (SC)", active: true, sortOrder: 1 },
    { id: "demo-va-2", label: "Intravenosa (IV)", active: true, sortOrder: 2 },
    { id: "demo-va-3", label: "Oral (VO)", active: true, sortOrder: 3 },
  ],
  principio_ativo: [
    { id: "demo-pa-0", label: "Atropina", active: true, sortOrder: 0 },
    { id: "demo-pa-1", label: "Dipirona", active: true, sortOrder: 1 },
    { id: "demo-pa-2", label: "Adrenalina", active: true, sortOrder: 2 },
  ],
  marca: [
    { id: "demo-mc-0", label: "Cristália", active: true, sortOrder: 0 },
    { id: "demo-mc-1", label: "EMS", active: true, sortOrder: 1 },
  ],
  localizacao: [
    { id: "demo-lc-0", label: "Prateleira A1", active: true, sortOrder: 0 },
    { id: "demo-lc-1", label: "Prateleira B2", active: true, sortOrder: 1 },
    { id: "demo-lc-2", label: "Geladeira 1", active: true, sortOrder: 2 },
  ],
  classificacao_xyz: [
    { id: "demo-xyz-0", label: "X", active: true, sortOrder: 0 },
    { id: "demo-xyz-1", label: "Y", active: true, sortOrder: 1 },
    { id: "demo-xyz-2", label: "Z", active: true, sortOrder: 2 },
  ],
};

/**
 * Todos os catálogos do produto (ativos E inativos), agrupados por categoria e
 * ordenados por sort_order. Em modo demo devolve exemplos hardcoded. Escopo por
 * clínica via RLS. Categorias sem registro no banco vêm como lista vazia.
 */
export async function listProdutoCatalogos(): Promise<ProdutoCatalogos> {
  if (isDemoMode()) return DEMO_CATALOGOS;

  // Base: toda categoria começa vazia (garante o Record completo, tipado).
  const out = Object.fromEntries(
    PRODUTO_CATALOGO_CATEGORIES.map((c) => [c, [] as CatalogoItem[]]),
  ) as ProdutoCatalogos;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("attendance_options")
    .select("id, category, label, active, sort_order")
    .in("category", PRODUTO_CATALOGO_CATEGORIES as unknown as string[])
    .order("category", { ascending: true })
    .order("sort_order", { ascending: true });

  if (error || !data) return out;

  for (const row of data as {
    id: string;
    category: string;
    label: string;
    active: boolean | null;
    sort_order: number | null;
  }[]) {
    const cat = row.category as ProdutoCatalogoCategory;
    if (!(cat in out)) continue;
    out[cat].push({
      id: row.id,
      label: row.label,
      active: row.active ?? true,
      sortOrder: row.sort_order ?? 0,
    });
  }

  return out;
}

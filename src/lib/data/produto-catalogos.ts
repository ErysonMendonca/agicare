import { createClient } from "@/lib/supabase/server";

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

/**
 * Todos os catálogos do produto (ativos E inativos), agrupados por categoria e
 * ordenados por sort_order. Em modo demo devolve exemplos hardcoded. Escopo por
 * clínica via RLS. Categorias sem registro no banco vêm como lista vazia.
 */
export async function listProdutoCatalogos(): Promise<ProdutoCatalogos> {

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

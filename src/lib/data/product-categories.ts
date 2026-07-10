import { createClient } from "@/lib/supabase/server";

// ════════════════════════════════════════════════════════════════
// Catálogo HIERÁRQUICO de categorias de produto (public.product_categories,
// migration 0105). Três níveis: Grupo → Classificação → Subclassificação.
// Server-only; escopo por clínica via RLS. Traz TODAS (ativas e inativas) para
// a tela de gestão do admin — filtrar por `active` é responsabilidade de quem
// monta os selects do cadastro de produto. Espelha listEspecialidades.
// ════════════════════════════════════════════════════════════════

export type ProductCategoryNode = {
  id: string;
  label: string;
  active: boolean;
  sortOrder: number;
  children: ProductCategoryNode[];
};

const DEMO_PRODUCT_CATEGORIES: ProductCategoryNode[] = [
  {
    id: "demo-cat-0",
    label: "0001 - Drogas e Medicamentos",
    active: true,
    sortOrder: 0,
    children: [
      {
        id: "demo-cat-0-0",
        label: "Antibióticos",
        active: true,
        sortOrder: 0,
        children: [
          {
            id: "demo-cat-0-0-0",
            label: "Penicilinas",
            active: true,
            sortOrder: 0,
            children: [],
          },
          {
            id: "demo-cat-0-0-1",
            label: "Cefalosporinas",
            active: true,
            sortOrder: 1,
            children: [],
          },
        ],
      },
      {
        id: "demo-cat-0-1",
        label: "Analgésicos",
        active: true,
        sortOrder: 1,
        children: [],
      },
    ],
  },
  {
    id: "demo-cat-1",
    label: "0002 - Material Médico Hospitalar",
    active: true,
    sortOrder: 1,
    children: [
      {
        id: "demo-cat-1-0",
        label: "Descartáveis",
        active: true,
        sortOrder: 0,
        children: [],
      },
    ],
  },
];

type Row = {
  id: string;
  parent_id: string | null;
  label: string;
  active: boolean | null;
  sort_order: number | null;
};

/** Ordena in-place a árvore inteira por sortOrder (empate → rótulo). */
function ordenar(nodes: ProductCategoryNode[]): ProductCategoryNode[] {
  nodes.sort(
    (a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label, "pt-BR"),
  );
  for (const n of nodes) ordenar(n.children);
  return nodes;
}

/**
 * Árvore completa (3 níveis) das categorias de produto da clínica ativa,
 * ordenada por sort_order em cada nível. Em modo demo (ou sem dados/erro de
 * leitura) devolve exemplos hardcoded, para a tela nunca nascer vazia.
 *
 * Uma única query traz os 3 níveis; a árvore é montada em memória por parent_id.
 * Nós órfãos (pai fora do resultado — não deveria ocorrer sob RLS, já que a FK
 * é intra-clínica) são descartados para não sumirem no meio da recursão.
 */
export async function listProductCategories(): Promise<ProductCategoryNode[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("product_categories")
    .select("id, parent_id, label, active, sort_order")
    .order("sort_order", { ascending: true });

  if (error || !data || data.length === 0) return DEMO_PRODUCT_CATEGORIES;

  const rows = data as Row[];

  // 1ª passada: cria os nós. 2ª: liga cada filho ao pai.
  const byId = new Map<string, ProductCategoryNode>();
  for (const row of rows) {
    byId.set(row.id, {
      id: row.id,
      label: row.label,
      active: row.active ?? true,
      sortOrder: row.sort_order ?? 0,
      children: [],
    });
  }

  const roots: ProductCategoryNode[] = [];
  for (const row of rows) {
    const node = byId.get(row.id);
    if (!node) continue;
    if (row.parent_id === null) {
      roots.push(node);
      continue;
    }
    byId.get(row.parent_id)?.children.push(node);
  }

  return ordenar(roots);
}

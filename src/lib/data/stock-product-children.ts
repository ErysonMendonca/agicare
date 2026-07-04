import { createClient } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/supabase/config";
import { requireClinic } from "@/lib/tenant";

/**
 * Camada de LEITURA das tabelas-filhas de um produto de estoque (migration
 * 0080). Somente leitura — o escopo por clínica é aplicado pela RLS (as tabelas
 * carregam clinic_id). Em modo demo devolvemos coleções vazias (não há dado
 * real). Todos os tipos são camelCase para consumo direto na UI.
 */

// ── Tipos das filhas (camelCase) ────────────────────────────────────
export type ProductUnit = {
  id: string;
  productId: string;
  unitLabel: string;
  unitType: string | null;
  apresentacao: string | null;
  ordem: number;
  quantidade: number;
  controlaEstoque: boolean;
  active: boolean;
  createdAt: string;
};

export type ProductMinMax = {
  id: string;
  productId: string;
  minQuantity: number;
  maxQuantity: number;
  active: boolean;
  createdAt: string;
};

export type ProductAdminRoute = {
  id: string;
  productId: string;
  routeLabel: string;
  active: boolean;
  createdAt: string;
};

export type ProductActiveIngredient = {
  id: string;
  productId: string;
  ingredientLabel: string;
  active: boolean;
  createdAt: string;
};

export type ProductBrand = {
  id: string;
  productId: string;
  brandLabel: string;
  anvisaRegistration: string | null;
  registrationExpiry: string | null;
  active: boolean;
  createdAt: string;
};

export type ProductRequisitionLocation = {
  id: string;
  productId: string;
  locationLabel: string;
  active: boolean;
  createdAt: string;
};

export type ProductXyzClass = "X" | "Y" | "Z";

export type ProductXyz = {
  id: string;
  productId: string;
  xyzClass: ProductXyzClass;
  startDate: string | null;
  endDate: string | null;
  active: boolean;
  createdAt: string;
};

export type ProdutoChildren = {
  units: ProductUnit[];
  minMax: ProductMinMax[];
  routes: ProductAdminRoute[];
  ingredients: ProductActiveIngredient[];
  brands: ProductBrand[];
  locations: ProductRequisitionLocation[];
  xyz: ProductXyz[];
};

const EMPTY: ProdutoChildren = {
  units: [],
  minMax: [],
  routes: [],
  ingredients: [],
  brands: [],
  locations: [],
  xyz: [],
};

// ── Mapeadores linha(snake) → tipo(camel) ───────────────────────────
/* eslint-disable @typescript-eslint/no-explicit-any */
function mapUnit(r: any): ProductUnit {
  return {
    id: r.id,
    productId: r.product_id,
    unitLabel: r.unit_label ?? "",
    unitType: r.unit_type ?? null,
    apresentacao: r.apresentacao ?? null,
    ordem: Number(r.ordem ?? 0),
    quantidade: Number(r.quantidade ?? 0),
    controlaEstoque: !!r.controla_estoque,
    active: !!r.active,
    createdAt: r.created_at,
  };
}

function mapMinMax(r: any): ProductMinMax {
  return {
    id: r.id,
    productId: r.product_id,
    minQuantity: Number(r.min_quantity ?? 0),
    maxQuantity: Number(r.max_quantity ?? 0),
    active: !!r.active,
    createdAt: r.created_at,
  };
}

function mapRoute(r: any): ProductAdminRoute {
  return {
    id: r.id,
    productId: r.product_id,
    routeLabel: r.route_label ?? "",
    active: !!r.active,
    createdAt: r.created_at,
  };
}

function mapIngredient(r: any): ProductActiveIngredient {
  return {
    id: r.id,
    productId: r.product_id,
    ingredientLabel: r.ingredient_label ?? "",
    active: !!r.active,
    createdAt: r.created_at,
  };
}

function mapBrand(r: any): ProductBrand {
  return {
    id: r.id,
    productId: r.product_id,
    brandLabel: r.brand_label ?? "",
    anvisaRegistration: r.anvisa_registration ?? null,
    registrationExpiry: r.registration_expiry ?? null,
    active: !!r.active,
    createdAt: r.created_at,
  };
}

function mapLocation(r: any): ProductRequisitionLocation {
  return {
    id: r.id,
    productId: r.product_id,
    locationLabel: r.location_label ?? "",
    active: !!r.active,
    createdAt: r.created_at,
  };
}

function mapXyz(r: any): ProductXyz {
  return {
    id: r.id,
    productId: r.product_id,
    xyzClass: (r.xyz_class ?? "X") as ProductXyzClass,
    startDate: r.start_date ?? null,
    endDate: r.end_date ?? null,
    active: !!r.active,
    createdAt: r.created_at,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * Carrega todas as tabelas-filhas de um produto. Escopo por clínica via RLS
 * (as filhas herdam clinic_id). Em demo, devolve coleções vazias. Falhas de
 * consulta degradam para vazio na filha afetada (não quebra a página).
 */
export async function getProdutoChildren(
  productId: string,
): Promise<ProdutoChildren> {
  if (isDemoMode() || !productId) return { ...EMPTY };

  const supabase = await createClient();
  // Filtro clinic_id explícito (defesa em profundidade, além da RLS) — coerente
  // com getProdutoCompleto.
  const clinicId = await requireClinic();

  const [units, minMax, routes, ingredients, brands, locations, xyz] =
    await Promise.all([
      supabase
        .from("product_units")
        .select("*")
        .eq("product_id", productId)
        .eq("clinic_id", clinicId)
        .order("ordem", { ascending: true }),
      supabase
        .from("product_min_max")
        .select("*")
        .eq("product_id", productId)
        .eq("clinic_id", clinicId),
      supabase
        .from("product_admin_routes")
        .select("*")
        .eq("product_id", productId)
        .eq("clinic_id", clinicId),
      supabase
        .from("product_active_ingredients")
        .select("*")
        .eq("product_id", productId)
        .eq("clinic_id", clinicId),
      supabase
        .from("product_brands")
        .select("*")
        .eq("product_id", productId)
        .eq("clinic_id", clinicId),
      supabase
        .from("product_requisition_locations")
        .select("*")
        .eq("product_id", productId)
        .eq("clinic_id", clinicId),
      supabase
        .from("product_xyz")
        .select("*")
        .eq("product_id", productId)
        .eq("clinic_id", clinicId),
    ]);

  return {
    units: (units.data ?? []).map(mapUnit),
    minMax: (minMax.data ?? []).map(mapMinMax),
    routes: (routes.data ?? []).map(mapRoute),
    ingredients: (ingredients.data ?? []).map(mapIngredient),
    brands: (brands.data ?? []).map(mapBrand),
    locations: (locations.data ?? []).map(mapLocation),
    xyz: (xyz.data ?? []).map(mapXyz),
  };
}

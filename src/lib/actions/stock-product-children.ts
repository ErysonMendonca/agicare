"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/supabase/config";
import { requireClinic } from "@/lib/tenant";
import { logAction } from "@/lib/system-log";

// ════════════════════════════════════════════════════════════════════
// CRUD das tabelas-filhas do produto de estoque (migration 0080). Cada
// filha tem seu add/update/remove. Autorização real no servidor (isGestor,
// mesmo gate financeiro de stock.ts) + escopo por clínica (RLS 2ª camada).
// Todo add valida que o product_id pertence à clínica ATIVA antes de
// inserir. Erros são genéricos (console.error guarda o detalhe). Em demo,
// todas as mutações simulam sucesso ({ ok: true }).
// ════════════════════════════════════════════════════════════════════

export type ActionResult = { ok?: boolean; error?: string };

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Gate comum: bloqueia demo + clínica ativa. Autorização de PAPEL fica na RLS
 * (is_staff() + clinic_id), MESMO nível do produto-pai (createStockProduct só
 * exige requireClinic): quem cadastra o produto também gerencia as abas-filhas.
 * Não usa isGestor para não travar o staff de estoque (recepção) que já pode
 * criar/excluir o produto inteiro.
 */
async function gate(): Promise<{ clinicId: string } | { error: string }> {
  if (isDemoMode()) return { error: "Indisponível em modo demonstração." };
  const clinicId = await requireClinic();
  return { clinicId };
}

/**
 * Confirma que o produto existe e pertence à clínica ativa. A FK só garante
 * existência, não a posse; sem isto um id de outro tenant (vindo do client)
 * poderia amarrar filhas cross-tenant. Retorna null se ok, ou a mensagem.
 */
async function validarProduto(
  supabase: Awaited<ReturnType<typeof createClient>>,
  productId: string,
  clinicId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("stock_products")
    .select("id")
    .eq("id", productId)
    .eq("clinic_id", clinicId)
    .maybeSingle();
  return data ? null : "Produto não encontrado nesta clínica.";
}

function revalidateProduto(productId: string) {
  revalidatePath(`/estoque/produtos/${productId}`);
}

// ── Helpers genéricos de escrita ────────────────────────────────────
type Table =
  | "product_units"
  | "product_min_max"
  | "product_admin_routes"
  | "product_active_ingredients"
  | "product_brands"
  | "product_requisition_locations"
  | "product_xyz";

/** Insere uma filha após validar produto/clínica; revalida a página. */
async function insertChild(
  table: Table,
  productId: string,
  row: Record<string, unknown>,
  logSummary: string,
): Promise<ActionResult> {
  const g = await gate();
  if ("error" in g) return g;
  if (!UUID.test(productId)) return { error: "Produto inválido." };

  const supabase = await createClient();
  const erro = await validarProduto(supabase, productId, g.clinicId);
  if (erro) return { error: erro };

  const { error } = await supabase.from(table).insert({
    clinic_id: g.clinicId,
    product_id: productId,
    active: true,
    ...row,
  });
  if (error) {
    console.error(`[${table}] insert falhou:`, error);
    return { error: "Não foi possível adicionar o registro." };
  }

  await logAction({
    action: "create",
    module: "estoque",
    summary: logSummary,
    entity: table,
    entityId: productId,
  });
  revalidateProduto(productId);
  return { ok: true };
}

/** Atualiza uma filha por id (escopo por clínica); revalida a página. */
async function updateChild(
  table: Table,
  id: string,
  productId: string,
  patch: Record<string, unknown>,
  logSummary: string,
): Promise<ActionResult> {
  const g = await gate();
  if ("error" in g) return g;
  if (!UUID.test(id)) return { error: "Identificador inválido." };
  if (Object.keys(patch).length === 0) return { error: "Nada a atualizar." };

  const supabase = await createClient();
  const { error } = await supabase
    .from(table)
    .update(patch)
    .eq("id", id)
    .eq("clinic_id", g.clinicId);
  if (error) {
    console.error(`[${table}] update falhou:`, error);
    return { error: "Não foi possível atualizar o registro." };
  }

  await logAction({
    action: "update",
    module: "estoque",
    summary: logSummary,
    entity: table,
    entityId: id,
  });
  if (productId && UUID.test(productId)) revalidateProduto(productId);
  return { ok: true };
}

/** Remove (hard) uma filha por id (escopo por clínica); revalida a página. */
async function removeChild(
  table: Table,
  id: string,
  productId: string,
  logSummary: string,
): Promise<ActionResult> {
  const g = await gate();
  if ("error" in g) return g;
  if (!UUID.test(id)) return { error: "Identificador inválido." };

  const supabase = await createClient();
  const { error } = await supabase
    .from(table)
    .delete()
    .eq("id", id)
    .eq("clinic_id", g.clinicId);
  if (error) {
    console.error(`[${table}] delete falhou:`, error);
    return { error: "Não foi possível remover o registro." };
  }

  await logAction({
    action: "delete",
    module: "estoque",
    summary: logSummary,
    entity: table,
    entityId: id,
  });
  if (productId && UUID.test(productId)) revalidateProduto(productId);
  return { ok: true };
}

const productId = z.string().regex(UUID, "Produto inválido.");
const label = z.string().trim().min(1, "Informe o rótulo.").max(160);
const numero = z.number().min(0, "Valor inválido.");
const dataOpcional = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v && v !== "" ? v : null));

// ════════════════════════════════════════════════════════════════════
// product_units
// ════════════════════════════════════════════════════════════════════
const unitAddSchema = z.object({
  productId,
  unitLabel: label,
  unitType: z.string().trim().max(80).optional().or(z.literal("")),
  apresentacao: z.string().trim().max(160).optional().or(z.literal("")),
  ordem: z.number().int().min(0).optional(),
  quantidade: numero.optional(),
  controlaEstoque: z.boolean().optional(),
});
const unitUpdateSchema = z
  .object({
    unitLabel: label.optional(),
    unitType: z.string().trim().max(80).optional().or(z.literal("")),
    apresentacao: z.string().trim().max(160).optional().or(z.literal("")),
    ordem: z.number().int().min(0).optional(),
    quantidade: numero.optional(),
    controlaEstoque: z.boolean().optional(),
    active: z.boolean().optional(),
  })
  .refine((o) => Object.keys(o).length > 0, "Nada a atualizar.");

export async function addProductUnit(input: {
  productId: string;
  unitLabel: string;
  unitType?: string;
  apresentacao?: string;
  ordem?: number;
  quantidade?: number;
  controlaEstoque?: boolean;
}): Promise<ActionResult> {
  const p = unitAddSchema.safeParse(input);
  if (!p.success) return { error: p.error.issues[0]?.message ?? "Dados inválidos." };
  const d = p.data;
  return insertChild(
    "product_units",
    d.productId,
    {
      unit_label: d.unitLabel,
      unit_type: d.unitType || null,
      apresentacao: d.apresentacao || null,
      ordem: d.ordem ?? 0,
      quantidade: d.quantidade ?? 0,
      controla_estoque: d.controlaEstoque ?? false,
    },
    `Adicionou a unidade "${d.unitLabel}" ao produto`,
  );
}

export async function updateProductUnit(
  id: string,
  patch: {
    unitLabel?: string;
    unitType?: string;
    apresentacao?: string;
    ordem?: number;
    quantidade?: number;
    controlaEstoque?: boolean;
    active?: boolean;
    productId?: string;
  },
): Promise<ActionResult> {
  const { productId: pid, ...rest } = patch;
  const p = unitUpdateSchema.safeParse(rest);
  if (!p.success) return { error: p.error.issues[0]?.message ?? "Dados inválidos." };
  const d = p.data;
  const row: Record<string, unknown> = {};
  if (d.unitLabel !== undefined) row.unit_label = d.unitLabel;
  if (d.unitType !== undefined) row.unit_type = d.unitType || null;
  if (d.apresentacao !== undefined) row.apresentacao = d.apresentacao || null;
  if (d.ordem !== undefined) row.ordem = d.ordem;
  if (d.quantidade !== undefined) row.quantidade = d.quantidade;
  if (d.controlaEstoque !== undefined) row.controla_estoque = d.controlaEstoque;
  if (d.active !== undefined) row.active = d.active;
  return updateChild("product_units", id, pid ?? "", row, "Atualizou uma unidade do produto");
}

export async function removeProductUnit(
  id: string,
  productId?: string,
): Promise<ActionResult> {
  return removeChild("product_units", id, productId ?? "", "Removeu uma unidade do produto");
}

// ════════════════════════════════════════════════════════════════════
// product_min_max
// ════════════════════════════════════════════════════════════════════
const minMaxAddSchema = z
  .object({ productId, minQuantity: numero, maxQuantity: numero })
  .refine((o) => o.maxQuantity >= o.minQuantity, {
    message: "Máximo deve ser ≥ mínimo.",
    path: ["maxQuantity"],
  });
const minMaxUpdateSchema = z
  .object({
    minQuantity: numero.optional(),
    maxQuantity: numero.optional(),
    active: z.boolean().optional(),
  })
  .refine((o) => Object.keys(o).length > 0, "Nada a atualizar.");

export async function addProductMinMax(input: {
  productId: string;
  minQuantity: number;
  maxQuantity: number;
}): Promise<ActionResult> {
  const p = minMaxAddSchema.safeParse(input);
  if (!p.success) return { error: p.error.issues[0]?.message ?? "Dados inválidos." };
  const d = p.data;
  return insertChild(
    "product_min_max",
    d.productId,
    { min_quantity: d.minQuantity, max_quantity: d.maxQuantity },
    "Adicionou faixa mín/máx ao produto",
  );
}

export async function updateProductMinMax(
  id: string,
  patch: {
    minQuantity?: number;
    maxQuantity?: number;
    active?: boolean;
    productId?: string;
  },
): Promise<ActionResult> {
  const { productId: pid, ...rest } = patch;
  const p = minMaxUpdateSchema.safeParse(rest);
  if (!p.success) return { error: p.error.issues[0]?.message ?? "Dados inválidos." };
  const d = p.data;
  const row: Record<string, unknown> = {};
  if (d.minQuantity !== undefined) row.min_quantity = d.minQuantity;
  if (d.maxQuantity !== undefined) row.max_quantity = d.maxQuantity;
  if (d.active !== undefined) row.active = d.active;
  return updateChild("product_min_max", id, pid ?? "", row, "Atualizou faixa mín/máx do produto");
}

export async function removeProductMinMax(
  id: string,
  productId?: string,
): Promise<ActionResult> {
  return removeChild("product_min_max", id, productId ?? "", "Removeu faixa mín/máx do produto");
}

// ════════════════════════════════════════════════════════════════════
// product_admin_routes
// ════════════════════════════════════════════════════════════════════
const routeAddSchema = z.object({ productId, routeLabel: label });
const routeUpdateSchema = z
  .object({ routeLabel: label.optional(), active: z.boolean().optional() })
  .refine((o) => Object.keys(o).length > 0, "Nada a atualizar.");

export async function addProductAdminRoute(input: {
  productId: string;
  routeLabel: string;
}): Promise<ActionResult> {
  const p = routeAddSchema.safeParse(input);
  if (!p.success) return { error: p.error.issues[0]?.message ?? "Dados inválidos." };
  const d = p.data;
  return insertChild(
    "product_admin_routes",
    d.productId,
    { route_label: d.routeLabel },
    `Adicionou a via "${d.routeLabel}" ao produto`,
  );
}

export async function updateProductAdminRoute(
  id: string,
  patch: { routeLabel?: string; active?: boolean; productId?: string },
): Promise<ActionResult> {
  const { productId: pid, ...rest } = patch;
  const p = routeUpdateSchema.safeParse(rest);
  if (!p.success) return { error: p.error.issues[0]?.message ?? "Dados inválidos." };
  const d = p.data;
  const row: Record<string, unknown> = {};
  if (d.routeLabel !== undefined) row.route_label = d.routeLabel;
  if (d.active !== undefined) row.active = d.active;
  return updateChild("product_admin_routes", id, pid ?? "", row, "Atualizou uma via do produto");
}

export async function removeProductAdminRoute(
  id: string,
  productId?: string,
): Promise<ActionResult> {
  return removeChild("product_admin_routes", id, productId ?? "", "Removeu uma via do produto");
}

// ════════════════════════════════════════════════════════════════════
// product_active_ingredients
// ════════════════════════════════════════════════════════════════════
const ingredientAddSchema = z.object({ productId, ingredientLabel: label });
const ingredientUpdateSchema = z
  .object({ ingredientLabel: label.optional(), active: z.boolean().optional() })
  .refine((o) => Object.keys(o).length > 0, "Nada a atualizar.");

export async function addProductActiveIngredient(input: {
  productId: string;
  ingredientLabel: string;
}): Promise<ActionResult> {
  const p = ingredientAddSchema.safeParse(input);
  if (!p.success) return { error: p.error.issues[0]?.message ?? "Dados inválidos." };
  const d = p.data;
  return insertChild(
    "product_active_ingredients",
    d.productId,
    { ingredient_label: d.ingredientLabel },
    `Adicionou o princípio ativo "${d.ingredientLabel}" ao produto`,
  );
}

export async function updateProductActiveIngredient(
  id: string,
  patch: { ingredientLabel?: string; active?: boolean; productId?: string },
): Promise<ActionResult> {
  const { productId: pid, ...rest } = patch;
  const p = ingredientUpdateSchema.safeParse(rest);
  if (!p.success) return { error: p.error.issues[0]?.message ?? "Dados inválidos." };
  const d = p.data;
  const row: Record<string, unknown> = {};
  if (d.ingredientLabel !== undefined) row.ingredient_label = d.ingredientLabel;
  if (d.active !== undefined) row.active = d.active;
  return updateChild(
    "product_active_ingredients",
    id,
    pid ?? "",
    row,
    "Atualizou um princípio ativo do produto",
  );
}

export async function removeProductActiveIngredient(
  id: string,
  productId?: string,
): Promise<ActionResult> {
  return removeChild(
    "product_active_ingredients",
    id,
    productId ?? "",
    "Removeu um princípio ativo do produto",
  );
}

// ════════════════════════════════════════════════════════════════════
// product_brands
// ════════════════════════════════════════════════════════════════════
const brandAddSchema = z.object({
  productId,
  brandLabel: label,
  anvisaRegistration: z.string().trim().max(120).optional().or(z.literal("")),
  registrationExpiry: dataOpcional,
});
const brandUpdateSchema = z
  .object({
    brandLabel: label.optional(),
    anvisaRegistration: z.string().trim().max(120).optional().or(z.literal("")),
    registrationExpiry: dataOpcional,
    active: z.boolean().optional(),
  })
  .refine((o) => Object.keys(o).length > 0, "Nada a atualizar.");

export async function addProductBrand(input: {
  productId: string;
  brandLabel: string;
  anvisaRegistration?: string;
  registrationExpiry?: string;
}): Promise<ActionResult> {
  const p = brandAddSchema.safeParse(input);
  if (!p.success) return { error: p.error.issues[0]?.message ?? "Dados inválidos." };
  const d = p.data;
  return insertChild(
    "product_brands",
    d.productId,
    {
      brand_label: d.brandLabel,
      anvisa_registration: d.anvisaRegistration || null,
      registration_expiry: d.registrationExpiry,
    },
    `Adicionou a marca "${d.brandLabel}" ao produto`,
  );
}

export async function updateProductBrand(
  id: string,
  patch: {
    brandLabel?: string;
    anvisaRegistration?: string;
    registrationExpiry?: string;
    active?: boolean;
    productId?: string;
  },
): Promise<ActionResult> {
  const { productId: pid, ...rest } = patch;
  const p = brandUpdateSchema.safeParse(rest);
  if (!p.success) return { error: p.error.issues[0]?.message ?? "Dados inválidos." };
  const d = p.data;
  const row: Record<string, unknown> = {};
  if (d.brandLabel !== undefined) row.brand_label = d.brandLabel;
  if (d.anvisaRegistration !== undefined)
    row.anvisa_registration = d.anvisaRegistration || null;
  if (d.registrationExpiry !== undefined)
    row.registration_expiry = d.registrationExpiry;
  if (d.active !== undefined) row.active = d.active;
  return updateChild("product_brands", id, pid ?? "", row, "Atualizou uma marca do produto");
}

export async function removeProductBrand(
  id: string,
  productId?: string,
): Promise<ActionResult> {
  return removeChild("product_brands", id, productId ?? "", "Removeu uma marca do produto");
}

// ════════════════════════════════════════════════════════════════════
// product_requisition_locations
// ════════════════════════════════════════════════════════════════════
const locationAddSchema = z.object({ productId, locationLabel: label });
const locationUpdateSchema = z
  .object({ locationLabel: label.optional(), active: z.boolean().optional() })
  .refine((o) => Object.keys(o).length > 0, "Nada a atualizar.");

export async function addProductRequisitionLocation(input: {
  productId: string;
  locationLabel: string;
}): Promise<ActionResult> {
  const p = locationAddSchema.safeParse(input);
  if (!p.success) return { error: p.error.issues[0]?.message ?? "Dados inválidos." };
  const d = p.data;
  return insertChild(
    "product_requisition_locations",
    d.productId,
    { location_label: d.locationLabel },
    `Adicionou o local de requisição "${d.locationLabel}" ao produto`,
  );
}

export async function updateProductRequisitionLocation(
  id: string,
  patch: { locationLabel?: string; active?: boolean; productId?: string },
): Promise<ActionResult> {
  const { productId: pid, ...rest } = patch;
  const p = locationUpdateSchema.safeParse(rest);
  if (!p.success) return { error: p.error.issues[0]?.message ?? "Dados inválidos." };
  const d = p.data;
  const row: Record<string, unknown> = {};
  if (d.locationLabel !== undefined) row.location_label = d.locationLabel;
  if (d.active !== undefined) row.active = d.active;
  return updateChild(
    "product_requisition_locations",
    id,
    pid ?? "",
    row,
    "Atualizou um local de requisição do produto",
  );
}

export async function removeProductRequisitionLocation(
  id: string,
  productId?: string,
): Promise<ActionResult> {
  return removeChild(
    "product_requisition_locations",
    id,
    productId ?? "",
    "Removeu um local de requisição do produto",
  );
}

// ════════════════════════════════════════════════════════════════════
// product_xyz
// ════════════════════════════════════════════════════════════════════
const xyzClass = z.enum(["X", "Y", "Z"]);
const xyzAddSchema = z.object({
  productId,
  xyzClass,
  startDate: dataOpcional,
  endDate: dataOpcional,
});
const xyzUpdateSchema = z
  .object({
    xyzClass: xyzClass.optional(),
    startDate: dataOpcional,
    endDate: dataOpcional,
    active: z.boolean().optional(),
  })
  .refine((o) => Object.keys(o).length > 0, "Nada a atualizar.");

export async function addProductXyz(input: {
  productId: string;
  xyzClass: "X" | "Y" | "Z";
  startDate?: string;
  endDate?: string;
}): Promise<ActionResult> {
  const p = xyzAddSchema.safeParse(input);
  if (!p.success) return { error: p.error.issues[0]?.message ?? "Dados inválidos." };
  const d = p.data;
  return insertChild(
    "product_xyz",
    d.productId,
    { xyz_class: d.xyzClass, start_date: d.startDate, end_date: d.endDate },
    `Classificou o produto como XYZ "${d.xyzClass}"`,
  );
}

export async function updateProductXyz(
  id: string,
  patch: {
    xyzClass?: "X" | "Y" | "Z";
    startDate?: string;
    endDate?: string;
    active?: boolean;
    productId?: string;
  },
): Promise<ActionResult> {
  const { productId: pid, ...rest } = patch;
  const p = xyzUpdateSchema.safeParse(rest);
  if (!p.success) return { error: p.error.issues[0]?.message ?? "Dados inválidos." };
  const d = p.data;
  const row: Record<string, unknown> = {};
  if (d.xyzClass !== undefined) row.xyz_class = d.xyzClass;
  if (d.startDate !== undefined) row.start_date = d.startDate;
  if (d.endDate !== undefined) row.end_date = d.endDate;
  if (d.active !== undefined) row.active = d.active;
  return updateChild("product_xyz", id, pid ?? "", row, "Atualizou a classificação XYZ do produto");
}

export async function removeProductXyz(
  id: string,
  productId?: string,
): Promise<ActionResult> {
  return removeChild("product_xyz", id, productId ?? "", "Removeu a classificação XYZ do produto");
}

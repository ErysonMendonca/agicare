"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isGestor } from "@/lib/auth";
import { requireClinic } from "@/lib/tenant";
import { logAction } from "@/lib/system-log";

// ════════════════════════════════════════════════════════════════
// CRUD do catálogo hierárquico de categorias de produto (0105).
// Três níveis: 1=Grupo · 2=Classificação · 3=Subclassificação.
//
// Autorização real no servidor (isGestor → papel admin na clínica ativa) +
// escopo por clínica (clinic_id explícito em toda query) — o RLS é a 2ª
// camada, nunca a única. Validação Zod na borda.
// ════════════════════════════════════════════════════════════════

export type ActionResult = { ok?: boolean; error?: string; id?: string };

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const uuid = z.string().trim().regex(UUID, "Identificador inválido.");
const label = z.string().trim().min(1, "Informe o rótulo.").max(120);
const level = z.union([z.literal(1), z.literal(2), z.literal(3)]);

const addSchema = z
  .object({
    parentId: uuid.nullable(),
    level,
    label,
  })
  // Espelha os CHECKs da 0105: raiz sem pai, filhos com pai.
  .refine((o) => (o.level === 1) === (o.parentId === null), {
    message: "Grupo não tem pai; classificação e subclassificação exigem um.",
  });

const updateSchema = z
  .object({
    id: uuid,
    label: label.optional(),
    active: z.boolean().optional(),
  })
  .refine((o) => o.label !== undefined || o.active !== undefined, {
    message: "Nada a atualizar.",
  });

const removeSchema = z.object({ id: uuid });

const reorderSchema = z.object({
  parentId: uuid.nullable(),
  ids: z.array(uuid).min(1, "Nada a reordenar.").max(500),
});

function revalidate() {
  revalidatePath("/configuracoes");
  revalidatePath("/estoque/produtos");
}

/** Gate comum: exige gestor (admin) + clínica ativa. */
async function gate(): Promise<{ clinicId: string } | { error: string }> {
  if (!(await isGestor())) return { error: "Acesso restrito ao gestor." };
  const clinicId = await requireClinic();
  return { clinicId };
}

/**
 * Confirma que `parentId` é uma categoria da PRÓPRIA clínica e do nível
 * imediatamente acima (`level - 1`). Sem isso seria possível pendurar uma
 * subclassificação direto num grupo (furando a árvore de 3 níveis) ou apontar
 * para outro tenant — o RLS só valida o clinic_id da linha INSERIDA, não o da
 * linha referenciada pela FK, e com ON DELETE CASCADE isso permitiria deleção
 * cross-tenant. Retorna null se ok, ou a mensagem de erro.
 */
async function validarParent(
  supabase: Awaited<ReturnType<typeof createClient>>,
  parentId: string,
  nivelFilho: number,
  clinicId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("product_categories")
    .select("id")
    .eq("id", parentId)
    .eq("clinic_id", clinicId)
    .eq("level", nivelFilho - 1)
    .maybeSingle();
  return data ? null : "Categoria pai inválida.";
}

/** Cria uma categoria; sort_order = (max entre os irmãos) + 1. */
export async function addProductCategory(input: {
  parentId: string | null;
  level: number;
  label: string;
}): Promise<ActionResult> {
  const g = await gate();
  if ("error" in g) return g;

  const parsed = addSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const { parentId, level: nivel, label: rotulo } = parsed.data;

  const supabase = await createClient();

  if (parentId) {
    const erro = await validarParent(supabase, parentId, nivel, g.clinicId);
    if (erro) return { error: erro };
  }

  // Próximo sort_order ENTRE OS IRMÃOS (mesmo pai). `is`/`eq` conforme raiz.
  const base = supabase
    .from("product_categories")
    .select("sort_order")
    .eq("clinic_id", g.clinicId);
  const { data: last } = await (parentId
    ? base.eq("parent_id", parentId)
    : base.is("parent_id", null)
  )
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextSort = ((last?.sort_order as number | undefined) ?? -1) + 1;

  const { data: inserted, error } = await supabase
    .from("product_categories")
    .insert({
      clinic_id: g.clinicId,
      parent_id: parentId,
      level: nivel,
      label: rotulo,
      sort_order: nextSort,
      active: true,
    })
    .select("id")
    .single();

  if (error) {
    // uq_product_categories_irmaos (clinic_id, pai, lower(label))
    if (error.code === "23505") {
      return { error: "Já existe uma categoria com esse nome neste nível." };
    }
    return { error: "Não foi possível adicionar a categoria." };
  }

  await logAction({
    action: "create",
    module: "configuracoes",
    summary: `Adicionou a categoria de produto "${rotulo}"`,
    entity: "product_category",
    entityId: inserted?.id as string | undefined,
  });
  revalidate();
  return { ok: true, id: inserted?.id as string | undefined };
}

/** Atualiza rótulo e/ou ativação de uma categoria. */
export async function updateProductCategory(input: {
  id: string;
  label?: string;
  active?: boolean;
}): Promise<ActionResult> {
  const g = await gate();
  if ("error" in g) return g;

  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const { id, ...patch } = parsed.data;

  const supabase = await createClient();
  const { error } = await supabase
    .from("product_categories")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("clinic_id", g.clinicId);

  if (error) {
    if (error.code === "23505") {
      return { error: "Já existe uma categoria com esse nome neste nível." };
    }
    return { error: "Não foi possível atualizar a categoria." };
  }

  await logAction({
    action: "update",
    module: "configuracoes",
    summary: "Atualizou uma categoria de produto",
    entity: "product_category",
    entityId: id,
  });
  revalidate();
  return { ok: true };
}

/**
 * Remove uma categoria. DELETE hard: a FK auto-referente tem ON DELETE CASCADE,
 * então apagar um Grupo apaga suas Classificações e Subclassificações. Como
 * stock_products guarda os rótulos desnormalizados em TEXTO, remover não
 * corrompe o histórico dos produtos já cadastrados.
 * Para "esconder sem apagar", use updateProductCategory({ id, active: false }).
 */
export async function removeProductCategory(input: {
  id: string;
}): Promise<ActionResult> {
  const g = await gate();
  if ("error" in g) return g;

  const parsed = removeSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("product_categories")
    .delete()
    .eq("id", parsed.data.id)
    .eq("clinic_id", g.clinicId);

  if (error) return { error: "Não foi possível remover a categoria." };

  await logAction({
    action: "delete",
    module: "configuracoes",
    summary: "Removeu uma categoria de produto (e suas subcategorias)",
    entity: "product_category",
    entityId: parsed.data.id,
  });
  revalidate();
  return { ok: true };
}

/**
 * Reordena os IRMÃOS de um mesmo pai (`parentId: null` = os grupos raiz): para
 * cada id no índice i, grava sort_order = i. O filtro por clinic_id + pai
 * impede reordenar (ou tocar) nós de outro tenant ou de outro ramo.
 */
export async function reorderProductCategories(input: {
  parentId: string | null;
  ids: string[];
}): Promise<ActionResult> {
  const g = await gate();
  if ("error" in g) return g;

  const parsed = reorderSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const { parentId, ids } = parsed.data;

  const supabase = await createClient();
  const results = await Promise.all(
    ids.map((id, i) => {
      const q = supabase
        .from("product_categories")
        .update({ sort_order: i, updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("clinic_id", g.clinicId);
      return parentId ? q.eq("parent_id", parentId) : q.is("parent_id", null);
    }),
  );

  if (results.some((r) => r.error)) {
    return { error: "Não foi possível reordenar as categorias." };
  }

  await logAction({
    action: "update",
    module: "configuracoes",
    summary: "Reordenou as categorias de produto",
    entity: "product_category",
  });
  revalidatePath("/configuracoes");
  return { ok: true };
}

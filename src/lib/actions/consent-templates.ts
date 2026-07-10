"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isGestor } from "@/lib/auth";
import { requireClinic } from "@/lib/tenant";
import { logAction } from "@/lib/system-log";

// ════════════════════════════════════════════════════════════════
// CRUD do catálogo de termos de consentimento (0107).
//
// Autorização real no servidor (isGestor → papel admin na clínica ativa) +
// escopo por clínica (clinic_id explícito em toda query) — o RLS é a 2ª
// camada, nunca a única. Validação Zod na borda. Espelha product-categories.
// ════════════════════════════════════════════════════════════════

export type ActionResult = { ok?: boolean; error?: string; id?: string };

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const uuid = z.string().trim().regex(UUID, "Identificador inválido.");
const title = z.string().trim().min(1, "Informe o título.").max(200);
const body = z.string().trim().min(1, "Informe o texto do termo.").max(20000);

const addSchema = z.object({ title, body });

const updateSchema = z
  .object({
    id: uuid,
    title: title.optional(),
    body: body.optional(),
    active: z.boolean().optional(),
  })
  .refine(
    (o) =>
      o.title !== undefined || o.body !== undefined || o.active !== undefined,
    { message: "Nada a atualizar." },
  );

const removeSchema = z.object({ id: uuid });

const reorderSchema = z.object({
  ids: z.array(uuid).min(1, "Nada a reordenar.").max(500),
});

/** Gate comum: exige gestor (admin) + clínica ativa. */
async function gate(): Promise<{ clinicId: string } | { error: string }> {
  if (!(await isGestor())) return { error: "Acesso restrito ao gestor." };
  const clinicId = await requireClinic();
  return { clinicId };
}

/** Cria um termo; sort_order = (max entre os termos da clínica) + 1. */
export async function addConsentTemplate(input: {
  title: string;
  body: string;
}): Promise<ActionResult> {
  const g = await gate();
  if ("error" in g) return g;

  const parsed = addSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const supabase = await createClient();

  const { data: last } = await supabase
    .from("consent_templates")
    .select("sort_order")
    .eq("clinic_id", g.clinicId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextSort = ((last?.sort_order as number | undefined) ?? -1) + 1;

  const { data: inserted, error } = await supabase
    .from("consent_templates")
    .insert({
      clinic_id: g.clinicId,
      title: parsed.data.title,
      body: parsed.data.body,
      sort_order: nextSort,
      active: true,
    })
    .select("id")
    .single();

  if (error) return { error: "Não foi possível adicionar o termo." };

  await logAction({
    action: "create",
    module: "configuracoes",
    summary: `Adicionou o termo de consentimento "${parsed.data.title}"`,
    entity: "consent_template",
    entityId: inserted?.id as string | undefined,
  });
  revalidatePath("/configuracoes");
  return { ok: true, id: inserted?.id as string | undefined };
}

/** Atualiza título, texto e/ou ativação de um termo. */
export async function updateConsentTemplate(input: {
  id: string;
  title?: string;
  body?: string;
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
    .from("consent_templates")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("clinic_id", g.clinicId);

  if (error) return { error: "Não foi possível atualizar o termo." };

  await logAction({
    action: "update",
    module: "configuracoes",
    summary: "Atualizou um termo de consentimento",
    entity: "consent_template",
    entityId: id,
  });
  revalidatePath("/configuracoes");
  return { ok: true };
}

/**
 * Remove um termo. DELETE hard: os registros de emissão já gravados em
 * public.consents guardam o context (`termo:<id>`) em texto, então remover o
 * template não corrompe o histórico de emissões. Para "esconder sem apagar",
 * use updateConsentTemplate({ id, active: false }).
 */
export async function removeConsentTemplate(input: {
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
    .from("consent_templates")
    .delete()
    .eq("id", parsed.data.id)
    .eq("clinic_id", g.clinicId);

  if (error) return { error: "Não foi possível remover o termo." };

  await logAction({
    action: "delete",
    module: "configuracoes",
    summary: "Removeu um termo de consentimento",
    entity: "consent_template",
    entityId: parsed.data.id,
  });
  revalidatePath("/configuracoes");
  return { ok: true };
}

/**
 * Reordena os termos da clínica: para cada id no índice i, grava sort_order = i.
 * O filtro por clinic_id impede tocar termos de outro tenant.
 */
export async function reorderConsentTemplates(input: {
  ids: string[];
}): Promise<ActionResult> {
  const g = await gate();
  if ("error" in g) return g;

  const parsed = reorderSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const supabase = await createClient();
  const results = await Promise.all(
    parsed.data.ids.map((id, i) =>
      supabase
        .from("consent_templates")
        .update({ sort_order: i, updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("clinic_id", g.clinicId),
    ),
  );

  if (results.some((r) => r.error)) {
    return { error: "Não foi possível reordenar os termos." };
  }

  await logAction({
    action: "update",
    module: "configuracoes",
    summary: "Reordenou os termos de consentimento",
    entity: "consent_template",
  });
  revalidatePath("/configuracoes");
  return { ok: true };
}

"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/supabase/config";
import { isGestor } from "@/lib/auth";
import { requireClinic } from "@/lib/tenant";
import { ATTENDANCE_OPTION_CATEGORIES } from "@/lib/data/attendance-options.shared";
import { logAction } from "@/lib/system-log";

// ════════════════════════════════════════════════════════════════
// CRUD das opções da ficha de atendimento (gestor). Autorização real no
// servidor (isGestor) + escopo por clínica (clinic_id) — o RLS é a 2ª
// camada. Validação Zod na borda; categoria restrita ao conjunto válido.
// ════════════════════════════════════════════════════════════════

export type ActionResult = { ok?: boolean; error?: string; id?: string };

const categoria = z.enum(ATTENDANCE_OPTION_CATEGORIES);
const label = z.string().trim().min(1, "Informe o rótulo.").max(120);
const value = z.string().trim().min(1, "Informe o valor.").max(120);
const description = z.string().trim().max(500).optional();

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const parentId = z
  .string()
  .trim()
  .regex(UUID, "Vínculo (motivo) inválido.")
  .optional();

const addSchema = z.object({
  category: categoria,
  label,
  value,
  description,
  parentId,
});
const updateSchema = z
  .object({
    label: label.optional(),
    value: value.optional(),
    description,
    active: z.boolean().optional(),
    sort_order: z.number().int().min(0).optional(),
    parentId,
  })
  .refine((o) => Object.keys(o).length > 0, "Nada a atualizar.");

function revalidate() {
  revalidatePath("/configuracoes");
  revalidatePath("/fila");
}

/** Gate comum: bloqueia demo e exige gestor + clínica ativa. */
async function gate(): Promise<{ clinicId: string } | { error: string }> {
  if (isDemoMode()) return { error: "Indisponível em modo demonstração." };
  if (!(await isGestor())) return { error: "Acesso restrito ao gestor." };
  const clinicId = await requireClinic();
  return { clinicId };
}

/**
 * Confirma que o `parentId` (vínculo pai→filho da cascata) é uma opção da
 * PRÓPRIA clínica e da categoria 'motivo_alta'. Impede amarrar um detalhe a um
 * motivo de outro tenant (o RLS só valida o clinic_id da linha inserida, não o
 * da linha referenciada pela FK) — o que, com ON DELETE CASCADE, permitiria
 * deleção cross-tenant. Retorna null se ok, ou a mensagem de erro.
 */
async function validarParent(
  supabase: Awaited<ReturnType<typeof createClient>>,
  parentId: string,
  clinicId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("attendance_options")
    .select("id")
    .eq("id", parentId)
    .eq("clinic_id", clinicId)
    .eq("category", "motivo_alta")
    .maybeSingle();
  return data ? null : "Motivo (vínculo) inválido.";
}

/** Cria opção; sort_order = (max da categoria) + 1. */
export async function addAttendanceOption(input: {
  category: string;
  label: string;
  value: string;
  description?: string;
  parentId?: string;
}): Promise<ActionResult> {
  const g = await gate();
  if ("error" in g) return g;

  const parsed = addSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const supabase = await createClient();

  if (parsed.data.parentId) {
    const erro = await validarParent(supabase, parsed.data.parentId, g.clinicId);
    if (erro) return { error: erro };
  }

  // Próximo sort_order da categoria (escopo por clínica via RLS).
  const { data: last } = await supabase
    .from("attendance_options")
    .select("sort_order")
    .eq("category", parsed.data.category)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextSort = ((last?.sort_order as number | undefined) ?? -1) + 1;

  const insertPayload: Record<string, unknown> = {
    clinic_id: g.clinicId,
    category: parsed.data.category,
    label: parsed.data.label,
    value: parsed.data.value,
    parent_id: parsed.data.parentId ?? null,
    sort_order: nextSort,
    active: true,
  };
  // Só inclui a coluna description quando enviada (coluna adicionada em 0082).
  if (parsed.data.description !== undefined) {
    insertPayload.description = parsed.data.description;
  }

  const { data: inserted, error } = await supabase
    .from("attendance_options")
    .insert(insertPayload)
    .select("id")
    .single();

  if (error) {
    // unique(clinic_id, category, value)
    if (error.code === "23505") {
      return { error: "Já existe uma opção com esse valor nesta categoria." };
    }
    return { error: "Não foi possível adicionar a opção." };
  }

  await logAction({
    action: "create",
    module: "configuracoes",
    summary: `Adicionou a opção de atendimento "${parsed.data.label}"`,
    entity: "attendance_option",
    entityId: inserted?.id as string | undefined,
  });
  revalidate();
  return { ok: true, id: inserted?.id as string | undefined };
}

/** Atualiza rótulo/valor/ativo/ordem de uma opção. */
export async function updateAttendanceOption(
  id: string,
  patch: {
    label?: string;
    value?: string;
    description?: string;
    active?: boolean;
    sort_order?: number;
    parentId?: string;
  },
): Promise<ActionResult> {
  const g = await gate();
  if ("error" in g) return g;
  if (!UUID.test(id)) return { error: "Identificador inválido." };

  const parsed = updateSchema.safeParse(patch);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  // Mapeia parentId (contrato da action) → parent_id (coluna). Só inclui a
  // chave quando enviada — evita zerar o vínculo em updates parciais.
  const { parentId: pid, ...rest } = parsed.data;
  const updatePayload: Record<string, unknown> = { ...rest };
  if (pid !== undefined) updatePayload.parent_id = pid;

  const supabase = await createClient();

  if (pid) {
    const erro = await validarParent(supabase, pid, g.clinicId);
    if (erro) return { error: erro };
  }
  const { error } = await supabase
    .from("attendance_options")
    .update(updatePayload)
    .eq("id", id)
    .eq("clinic_id", g.clinicId);

  if (error) {
    if (error.code === "23505") {
      return { error: "Já existe uma opção com esse valor nesta categoria." };
    }
    return { error: "Não foi possível atualizar a opção." };
  }

  await logAction({
    action: "update",
    module: "configuracoes",
    summary: "Atualizou uma opção de atendimento",
    entity: "attendance_option",
    entityId: id,
  });
  revalidate();
  return { ok: true };
}

/**
 * Remove uma opção. Optamos por DELETE (hard) — a tabela é puramente de
 * parametrização e não há FK a partir de attendance_records (lá os valores
 * são desnormalizados em texto), então remover não corrompe histórico.
 * Para "desativar sem apagar", use updateAttendanceOption(id, { active:false }).
 */
export async function removeAttendanceOption(
  id: string,
): Promise<ActionResult> {
  const g = await gate();
  if ("error" in g) return g;
  if (!UUID.test(id)) return { error: "Identificador inválido." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("attendance_options")
    .delete()
    .eq("id", id)
    .eq("clinic_id", g.clinicId);

  if (error) return { error: "Não foi possível remover a opção." };

  await logAction({
    action: "delete",
    module: "configuracoes",
    summary: "Removeu uma opção de atendimento",
    entity: "attendance_option",
    entityId: id,
  });
  revalidate();
  return { ok: true };
}

const reorderSchema = z.object({
  category: categoria,
  orderedIds: z
    .array(z.string().trim().regex(UUID, "Identificador inválido."))
    .min(1, "Nada a reordenar.")
    .max(500),
});

/**
 * Reordena as opções de uma categoria: para cada id no índice i, grava
 * sort_order = i. Escopo por clínica + categoria (o RLS é a 2ª camada). Os N
 * updates rodam em paralelo. Retorna { ok } ou { error }.
 */
export async function reorderAttendanceOptions(
  category: string,
  orderedIds: string[],
): Promise<ActionResult> {
  const g = await gate();
  if ("error" in g) return g;

  const parsed = reorderSchema.safeParse({ category, orderedIds });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const supabase = await createClient();

  const results = await Promise.all(
    parsed.data.orderedIds.map((id, i) =>
      supabase
        .from("attendance_options")
        .update({ sort_order: i })
        .eq("id", id)
        .eq("clinic_id", g.clinicId)
        .eq("category", parsed.data.category),
    ),
  );

  if (results.some((r) => r.error)) {
    return { error: "Não foi possível reordenar as opções." };
  }

  await logAction({
    action: "update",
    module: "configuracoes",
    summary: `Reordenou as opções de "${parsed.data.category}"`,
    entity: "attendance_option",
  });
  revalidatePath("/configuracoes");
  return { ok: true };
}

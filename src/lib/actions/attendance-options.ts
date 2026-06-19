"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/supabase/config";
import { isGestor } from "@/lib/auth";
import { requireClinic } from "@/lib/tenant";
import { ATTENDANCE_OPTION_CATEGORIES } from "@/lib/data/attendance-options.shared";

// ════════════════════════════════════════════════════════════════
// CRUD das opções da ficha de atendimento (gestor). Autorização real no
// servidor (isGestor) + escopo por clínica (clinic_id) — o RLS é a 2ª
// camada. Validação Zod na borda; categoria restrita ao conjunto válido.
// ════════════════════════════════════════════════════════════════

export type ActionResult = { ok?: boolean; error?: string };

const categoria = z.enum(ATTENDANCE_OPTION_CATEGORIES);
const label = z.string().trim().min(1, "Informe o rótulo.").max(120);
const value = z.string().trim().min(1, "Informe o valor.").max(120);

const addSchema = z.object({ category: categoria, label, value });
const updateSchema = z
  .object({
    label: label.optional(),
    value: value.optional(),
    active: z.boolean().optional(),
    sort_order: z.number().int().min(0).optional(),
  })
  .refine((o) => Object.keys(o).length > 0, "Nada a atualizar.");

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

/** Cria opção; sort_order = (max da categoria) + 1. */
export async function addAttendanceOption(input: {
  category: string;
  label: string;
  value: string;
}): Promise<ActionResult> {
  const g = await gate();
  if ("error" in g) return g;

  const parsed = addSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const supabase = await createClient();

  // Próximo sort_order da categoria (escopo por clínica via RLS).
  const { data: last } = await supabase
    .from("attendance_options")
    .select("sort_order")
    .eq("category", parsed.data.category)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextSort = ((last?.sort_order as number | undefined) ?? -1) + 1;

  const { error } = await supabase.from("attendance_options").insert({
    clinic_id: g.clinicId,
    category: parsed.data.category,
    label: parsed.data.label,
    value: parsed.data.value,
    sort_order: nextSort,
    active: true,
  });

  if (error) {
    // unique(clinic_id, category, value)
    if (error.code === "23505") {
      return { error: "Já existe uma opção com esse valor nesta categoria." };
    }
    return { error: "Não foi possível adicionar a opção." };
  }

  revalidate();
  return { ok: true };
}

/** Atualiza rótulo/valor/ativo/ordem de uma opção. */
export async function updateAttendanceOption(
  id: string,
  patch: {
    label?: string;
    value?: string;
    active?: boolean;
    sort_order?: number;
  },
): Promise<ActionResult> {
  const g = await gate();
  if ("error" in g) return g;
  if (!UUID.test(id)) return { error: "Identificador inválido." };

  const parsed = updateSchema.safeParse(patch);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("attendance_options")
    .update(parsed.data)
    .eq("id", id);

  if (error) {
    if (error.code === "23505") {
      return { error: "Já existe uma opção com esse valor nesta categoria." };
    }
    return { error: "Não foi possível atualizar a opção." };
  }

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
    .eq("id", id);

  if (error) return { error: "Não foi possível remover a opção." };

  revalidate();
  return { ok: true };
}

"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isGestor } from "@/lib/auth";
import { logAction } from "@/lib/system-log";

// ════════════════════════════════════════════════════════════════
// CRUD do catálogo GLOBAL de CIDs (cid_codes). Autorização real no
// servidor (isGestor); RLS é a 2ª camada. Validação Zod na borda.
// A tabela é global (não tem clinic_id).
// ════════════════════════════════════════════════════════════════

export type ActionResult = { ok?: boolean; error?: string };

const code = z
  .string()
  .trim()
  .min(1, "Informe o código.")
  .max(20)
  .transform((v) => v.toUpperCase());
const description = z.string().trim().min(1, "Informe a descrição.").max(300);

const addSchema = z.object({ code, description });
const updateSchema = z.object({ code, description });

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function revalidate() {
  revalidatePath("/configuracoes");
}

/** Gate comum: bloqueia demo e exige gestor. */
async function gate(): Promise<{ ok: true } | { error: string }> {
  if (!(await isGestor())) return { error: "Acesso restrito ao gestor." };
  return { ok: true };
}

/** Cria um CID no catálogo global. */
export async function addCid(input: {
  code: string;
  description: string;
}): Promise<ActionResult> {
  const g = await gate();
  if ("error" in g) return g;

  const parsed = addSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("cid_codes").insert({
    code: parsed.data.code,
    description: parsed.data.description,
    active: true,
  });

  if (error) {
    if (error.code === "23505") {
      return { error: "Já existe um CID com esse código." };
    }
    return { error: "Não foi possível adicionar o CID." };
  }

  await logAction({
    action: "create",
    module: "configuracoes",
    summary: `Adicionou o CID "${parsed.data.code}"`,
    entity: "cid_code",
  });
  revalidate();
  return { ok: true };
}

/** Atualiza código/descrição de um CID. */
export async function updateCid(
  id: string,
  patch: { code: string; description: string },
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
    .from("cid_codes")
    .update({ code: parsed.data.code, description: parsed.data.description })
    .eq("id", id);

  if (error) {
    if (error.code === "23505") {
      return { error: "Já existe um CID com esse código." };
    }
    return { error: "Não foi possível atualizar o CID." };
  }

  await logAction({
    action: "update",
    module: "configuracoes",
    summary: "Atualizou um CID do catálogo",
    entity: "cid_code",
    entityId: id,
  });
  revalidate();
  return { ok: true };
}

/** Remove um CID do catálogo global. */
export async function removeCid(id: string): Promise<ActionResult> {
  const g = await gate();
  if ("error" in g) return g;
  if (!UUID.test(id)) return { error: "Identificador inválido." };

  const supabase = await createClient();
  const { error } = await supabase.from("cid_codes").delete().eq("id", id);

  if (error) return { error: "Não foi possível remover o CID." };

  await logAction({
    action: "delete",
    module: "configuracoes",
    summary: "Removeu um CID do catálogo",
    entity: "cid_code",
    entityId: id,
  });
  revalidate();
  return { ok: true };
}

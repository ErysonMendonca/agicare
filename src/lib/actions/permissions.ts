"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isGestor } from "@/lib/auth";
import { requireClinic } from "@/lib/tenant";
import { MODULES, type PermissionRow } from "@/lib/permissions";

export type ActionState = { error?: string; ok?: boolean } | undefined;

/**
 * Schema da matriz vinda do client. Cada linha é um (papel, módulo) com a
 * visibilidade e o escopo escolhidos pelo admin. Validação Zod na borda:
 * papel/módulo/escopo restritos a enums; canView booleano.
 */
const rowSchema = z.object({
  role: z.enum(["admin", "medico", "recepcao", "paciente"]),
  module: z.enum(MODULES as [string, ...string[]]),
  canView: z.boolean(),
  scope: z.enum(["own", "all"]),
});

const payloadSchema = z.array(rowSchema).min(1, "Nenhuma permissão informada.");

/**
 * Persiste a matriz de permissões (módulo Perfis de Acesso). Gestor-only.
 * Upsert em `role_permissions` (onConflict role,module). A policy write-admin
 * da 0019 autoriza apenas o admin logado — não usamos service-role.
 */
export async function savePermissions(
  rows: PermissionRow[],
): Promise<ActionState> {
  // Reforço de autorização no servidor (config sensível; o gate do proxy é otimista).
  if (!(await isGestor())) return { error: "Acesso restrito ao gestor." };



  const parsed = payloadSchema.safeParse(rows);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  // Trava de segurança / contrato "admin = acesso total". O admin SEMPRE
  // enxerga tudo da plataforma, independentemente do que veio do client.
  // Normalizamos TODA linha de admin (não só `permissoes`) para canView:true
  // e scope:'all' no servidor — a UI já trava o admin como read-only, mas a
  // action não pode confiar no payload (poderia vir adulterado e trancar o
  // admin para fora de módulos, inclusive de forma irreversível).
  const safeRows = parsed.data.map((r) =>
    r.role === "admin" ? { ...r, canView: true, scope: "all" as const } : r,
  );

  // PK de role_permissions é (clinic_id, role, module) após a 0020. O clinic_id
  // SEMPRE vem do servidor (clínica ativa), NUNCA do payload do client.
  const clinicId = await requireClinic();

  const now = new Date().toISOString();
  const payload = safeRows.map((r) => ({
    clinic_id: clinicId,
    role: r.role,
    module: r.module,
    can_view: r.canView,
    scope: r.scope,
    updated_at: now,
  }));

  const supabase = await createClient();
  const { error } = await supabase
    .from("role_permissions")
    .upsert(payload, { onConflict: "clinic_id,role,module" });

  if (error) return { error: error.message };

  // O menu lateral e os guards dependem da matriz → revalida a rota e o layout.
  revalidatePath("/permissoes");
  revalidatePath("/", "layout");
  return { ok: true };
}

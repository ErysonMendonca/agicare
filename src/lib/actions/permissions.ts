"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isGestor } from "@/lib/auth";
import { requireClinic } from "@/lib/tenant";
import { MODULES, type PermissionRow } from "@/lib/permissions";

export type ActionState = { error?: string; ok?: boolean } | undefined;

/**
 * Schema da matriz vinda do client. Cada linha é um (papel, módulo) com as
 * quatro ações granulares e o escopo escolhidos pelo admin. Validação Zod na
 * borda: papel/módulo/escopo restritos a enums; ações booleanas.
 */
const rowSchema = z.object({
  role: z.enum(["admin", "medico", "recepcao", "paciente"]),
  module: z.enum(MODULES as [string, ...string[]]),
  canView: z.boolean(),
  canCreate: z.boolean(),
  canEdit: z.boolean(),
  canDelete: z.boolean(),
  scope: z.enum(["own", "all"]),
});

const payloadSchema = z.array(rowSchema).min(1, "Nenhuma permissão informada.");

/**
 * Persiste a matriz de permissões (módulo Perfis de Acesso). Gestor-only: este
 * módulo NÃO é concedível pela matriz, porque a policy write-admin da 0019/0021
 * só autoriza o admin a gravar em `role_permissions` (não usamos service-role).
 * Essa RLS é a última barreira contra escalada de privilégio — quem edita a
 * matriz pode se autopromover.
 * Upsert em `role_permissions` (onConflict clinic_id,role,module).
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
  // enxerga tudo e age em tudo, independentemente do que veio do client.
  // Normalizamos TODA linha de admin (não só `permissoes`) para as 4 ações
  // true e scope:'all' no servidor — a UI já trava o admin como read-only, mas
  // a action não pode confiar no payload (poderia vir adulterado e trancar o
  // admin para fora de módulos, inclusive de forma irreversível).
  // Além disso, aplicamos a invariante "sem Ver, sem ação" no servidor: a UI já
  // desabilita as ações quando `canView` está desmarcado, mas o payload pode vir
  // adulterado com canView:false + canEdit:true, e `can()` no client não é a
  // fonte da verdade — o banco é.
  const safeRows = parsed.data.map((r) => {
    if (r.role === "admin") {
      return {
        ...r,
        canView: true,
        canCreate: true,
        canEdit: true,
        canDelete: true,
        scope: "all" as const,
      };
    }
    if (!r.canView) {
      return { ...r, canCreate: false, canEdit: false, canDelete: false };
    }
    return r;
  });

  // PK de role_permissions é (clinic_id, role, module) após a 0020. O clinic_id
  // SEMPRE vem do servidor (clínica ativa), NUNCA do payload do client.
  const clinicId = await requireClinic();

  const now = new Date().toISOString();
  const payload = safeRows.map((r) => ({
    clinic_id: clinicId,
    role: r.role,
    module: r.module,
    can_view: r.canView,
    can_create: r.canCreate,
    can_edit: r.canEdit,
    can_delete: r.canDelete,
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

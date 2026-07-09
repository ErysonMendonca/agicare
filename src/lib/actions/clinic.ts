"use server";

import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/service";
import { getCurrentUser } from "@/lib/auth";
import { DEMO_CLINIC_ID, multitenantSchemaMissing } from "@/lib/tenant";

/**
 * Server Actions de TENANT (seleção/troca de clínica ativa).
 *
 * Fluxo de "clínica ativa" (multitenant):
 *  1. O usuário escolhe uma clínica da qual é membro ATIVO.
 *  2. Gravamos `app_metadata.active_clinic_id` no usuário via SERVICE-ROLE
 *     (`auth.admin.updateUserById`) — é a única forma de mexer em app_metadata.
 *  3. Sinalizamos ao CLIENT para chamar `supabase.auth.refreshSession()`. O
 *     refresh re-emite o Access Token, o Custom Access Token Hook (0022) lê a
 *     membership e re-carimba o claim `active_clinic_id`. A partir daí a RLS
 *     (0021) passa a enxergar a clínica escolhida.
 *
 * ANTI-IDOR: validamos no servidor que o usuário possui membership ATIVA na
 * clínica alvo ANTES de gravar o claim. Sem isso, qualquer um poderia setar a
 * clínica de outro tenant.
 */

export type SetClinicState =
  | { ok?: boolean; error?: string; refresh?: boolean }
  | undefined;

// Regex de UUID permissiva (formato 8-4-4-4-12). NÃO usar z.string().uuid():
// o Zod exige nibble de versão 1-5, o que reprova a clínica default
// (00000000-0000-0000-0000-000000000001), quebrando o login mono-clínica.
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const schema = z.object({
  clinicId: z.string().regex(UUID_RE, "Clínica inválida."),
});

export async function setActiveClinic(clinicId: string): Promise<SetClinicState> {
  const parsed = schema.safeParse({ clinicId });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Clínica inválida." };
  }
  const targetClinicId = parsed.data.clinicId;



  const current = await getCurrentUser();
  if (!current) return { error: "Sessão expirada." };

  const service = createServiceClient();

  // ANTI-IDOR: confirma membership ATIVA do usuário logado na clínica alvo.
  // (service-role ignora RLS, então a checagem precisa ser explícita aqui.)
  const { data: membership, error: memberError } = await service
    .from("clinic_members")
    .select("clinic_id")
    .eq("user_id", current.userId)
    .eq("clinic_id", targetClinicId)
    .eq("active", true)
    .maybeSingle();

  if (memberError) {
    // Multitenant não provisionado → mono-clínica: nada a gravar, segue direto.
    if (multitenantSchemaMissing(memberError)) {
      return { ok: true, refresh: false };
    }
    return { error: "Não foi possível validar o acesso à clínica." };
  }
  if (!membership) {
    return { error: "Você não pertence a esta clínica." };
  }

  // Grava o claim de clínica ativa. Mesclamos com o app_metadata existente para
  // não descartar outros metadados.
  const { error: updateError } = await service.auth.admin.updateUserById(
    current.userId,
    {
      app_metadata: { active_clinic_id: targetClinicId },
    },
  );

  if (updateError) {
    return { error: "Não foi possível selecionar a clínica." };
  }

  // refresh=true → o CLIENT precisa chamar refreshSession() para o hook
  // re-carimbar o JWT com a nova clínica antes de prosseguir ao dashboard.
  return { ok: true, refresh: true };
}

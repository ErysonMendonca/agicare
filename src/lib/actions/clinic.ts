"use server";

import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/service";
import { getCurrentUser } from "@/lib/auth";
import { multitenantSchemaMissing } from "@/lib/tenant";
import { definirClinicaAtiva } from "@/lib/db/auth";

/**
 * Server Actions de TENANT (seleção/troca de clínica ativa).
 *
 * Fluxo de "clínica ativa" (multitenant):
 *  1. O usuário escolhe uma clínica da qual é membro ATIVO.
 *  2. Gravamos a clínica ativa na SESSÃO (cookie assinado). No Supabase isso
 *     era o claim `app_metadata.active_clinic_id`, recarimbado no JWT pelo
 *     Custom Access Token Hook (0022).
 *  3. A partir daí o cliente de banco passa a injetar esse clinic_id em toda
 *     consulta — é o que substitui a RLS (0021) no MySQL.
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

  // Grava a clínica ativa NA SESSÃO. No Supabase isso era um claim em
  // app_metadata, recarimbado no JWT pelo hook da 0022; com sessão própria
  // basta reemitir o cookie assinado. `definirClinicaAtiva` revalida a
  // membership por conta própria (segunda barreira anti-IDOR).
  const gravou = await definirClinicaAtiva(targetClinicId);
  if (!gravou) {
    return { error: "Não foi possível selecionar a clínica." };
  }

  // refresh=true → o client reemite o cookie e navega. Mantido para não
  // alterar o contrato com a tela de login.
  return { ok: true, refresh: true };
}

"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/supabase/config";
import { getCurrentUser } from "@/lib/auth";
import { getSettings } from "@/lib/data/settings";
import { buildSenhaSchema, normalizePolicy } from "@/lib/validation/password";

/**
 * Conta do PRÓPRIO usuário logado (self-service). Hoje: troca de senha.
 *
 * Server-only: usa o cliente de servidor (cookies + RLS) e nunca registra a
 * senha em log (LGPD / segurança).
 */

export type ChangePasswordState = { error?: string; ok?: boolean };

export type ChangePasswordInput = {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
};

/**
 * Troca a senha do usuário autenticado.
 *
 * Fluxo (defensivo):
 *  1) Recusa em modo demo (sem credencial real para reautenticar).
 *  2) Exige sessão (e e-mail) — fail-closed.
 *  3) Valida na borda com Zod, usando a POLÍTICA vigente da clínica
 *     (clinic_settings.security.passwordPolicy; baseline 'alta' = mín 10 + símbolo).
 *  4) PROVA a posse da senha atual reautenticando (signInWithPassword) —
 *     impede que uma sessão sequestrada troque a senha sem conhecer a atual.
 *  5) Atualiza a senha (updateUser). Erros do provider não vazam detalhe.
 */
export async function changePassword(
  input: ChangePasswordInput,
): Promise<ChangePasswordState> {
  // Em demo não há backend de auth real para reautenticar/atualizar.
  if (isDemoMode()) {
    return { error: "Troca de senha indisponível no modo demonstração." };
  }

  const current = await getCurrentUser();
  if (!current?.email) {
    return { error: "Sessão expirada. Faça login novamente." };
  }

  // Política vigente da clínica (fallback: baseline 'alta').
  const settings = await getSettings();
  const policy = normalizePolicy(settings.security.passwordPolicy);

  const schema = z
    .object({
      currentPassword: z.string().min(1, "Informe sua senha atual."),
      newPassword: buildSenhaSchema(policy),
      confirmPassword: z.string().min(1, "Confirme a nova senha."),
    })
    .refine((d) => d.newPassword === d.confirmPassword, {
      path: ["confirmPassword"],
      message: "A confirmação não confere com a nova senha.",
    })
    .refine((d) => d.newPassword !== d.currentPassword, {
      path: ["newPassword"],
      message: "A nova senha deve ser diferente da atual.",
    });

  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const supabase = await createClient();

  // 1) Reautentica para provar a posse da senha atual (anti-sequestro de sessão).
  const { error: reauthError } = await supabase.auth.signInWithPassword({
    email: current.email,
    password: parsed.data.currentPassword,
  });
  if (reauthError) {
    return { error: "Senha atual incorreta." };
  }

  // 2) Atualiza para a nova senha.
  const { error: updateError } = await supabase.auth.updateUser({
    password: parsed.data.newPassword,
  });
  if (updateError) {
    // Sem vazar detalhe interno do provider de auth.
    return { error: "Não foi possível atualizar a senha. Tente novamente." };
  }

  return { ok: true };
}

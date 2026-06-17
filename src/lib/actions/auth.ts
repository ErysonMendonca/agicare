"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/supabase/config";
import {
  getMyClinics,
  isMultitenantProvisioned,
  type MyClinic,
} from "@/lib/tenant";
import { setActiveClinic } from "@/lib/actions/clinic";

/**
 * Estado do login. A tela reage a:
 *  • error                → mostra a mensagem.
 *  • needsClinic + clinics → usuário tem VÁRIAS clínicas: renderizar o seletor.
 *  • refresh              → o client deve chamar refreshSession() e navegar.
 *
 * O seletor de clínica é populado SÓ PÓS-autenticação (das memberships do
 * usuário) — nunca antes, para não vazar a lista de tenants publicamente.
 */
export type AuthState =
  | {
      error?: string;
      needsClinic?: boolean;
      clinics?: MyClinic[];
      refresh?: boolean;
    }
  | undefined;

/**
 * Login. Em modo demo (sem Supabase, fora de prod) entra direto.
 * Com Supabase configurado, autentica via e-mail + senha e RESOLVE a clínica ativa:
 *  • 1 clínica  → auto-seleciona (setActiveClinic) e sinaliza refresh ao client.
 *  • N clínicas → devolve a lista para o seletor (needsClinic).
 *  • 0 clínicas → erro (sem tenant, a RLS negaria tudo).
 * O campo "usuario" do formulário é tratado como e-mail.
 */
export async function signIn(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  if (isDemoMode()) redirect("/dashboard");

  const email = String(formData.get("usuario") ?? "").trim();
  const password = String(formData.get("senha") ?? "");

  if (!email || !password) return { error: "Informe usuário e senha." };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: "Credenciais inválidas." };

  // Mono-clínica (multitenant não provisionado no banco): não há claim de
  // clínica a gravar — entra direto. Evita o setActiveClinic com o
  // DEMO_CLINIC_ID (que reprovaria no .uuid() do Zod).
  if (!(await isMultitenantProvisioned())) {
    return { refresh: true };
  }

  // Pós-autenticação: resolve a clínica ativa a partir das memberships.
  const clinics = await getMyClinics();

  if (clinics.length === 0) {
    // Sem vínculo de clínica → não há tenant; a RLS negaria todo acesso.
    await supabase.auth.signOut();
    return { error: "Seu usuário não está vinculado a nenhuma clínica." };
  }

  if (clinics.length === 1) {
    const res = await setActiveClinic(clinics[0].id);
    if (res?.error) return { error: res.error };
    // refresh=true → o client chama refreshSession() antes de ir ao dashboard
    // (re-emite o token p/ o hook carimbar active_clinic_id).
    return { refresh: true };
  }

  // Várias clínicas → o usuário escolhe no seletor.
  return { needsClinic: true, clinics };
}

/**
 * Confirma a clínica escolhida no seletor (passo 2 do login com múltiplas
 * clínicas). Valida a membership via setActiveClinic (anti-IDOR) e sinaliza
 * refresh ao client.
 */
export async function selectClinic(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  if (isDemoMode()) redirect("/dashboard");

  const clinicId = String(formData.get("clinicId") ?? "").trim();
  if (!clinicId) return { error: "Selecione uma clínica." };

  const res = await setActiveClinic(clinicId);
  if (res?.error) {
    // Re-popula o seletor para o usuário tentar de novo.
    const clinics = await getMyClinics();
    return { error: res.error, needsClinic: true, clinics };
  }
  return { refresh: true };
}

/** Logout e volta para a tela de login. */
export async function signOut(): Promise<void> {
  if (!isDemoMode()) {
    const supabase = await createClient();
    await supabase.auth.signOut();
  }
  redirect("/");
}

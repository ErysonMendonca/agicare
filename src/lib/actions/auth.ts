"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import {
  getMyClinics,
  isMultitenantProvisioned,
  type MyClinic,
} from "@/lib/tenant";
import { setActiveClinic } from "@/lib/actions/clinic";
import {
  isRateLimited,
  registerHit,
  clientIp,
  retryLabel,
} from "@/lib/rate-limit";

// Login: no máx. 3 tentativas FALHAS por IP+e-mail em 30 min.
const LOGIN_LIMIT = 3;
const LOGIN_WINDOW_MS = 30 * 60 * 1000;

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
 * O campo "usuario" resolve para um nome de acesso (username). Se contiver "@"
 * é tratado como e-mail direto (compat com admins antigos).
 */
export async function signIn(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {

  const usuario = String(formData.get("usuario") ?? "").trim();
  const password = String(formData.get("senha") ?? "");

  if (!usuario || !password) return { error: "Informe usuário e senha." };

  const usuarioNorm = usuario.toLowerCase();

  // Rate-limit anti força-bruta: bloqueia após LOGIN_LIMIT falhas na janela.
  const rlKey = `login:${await clientIp()}:${usuarioNorm}`;
  const limited = isRateLimited(rlKey, LOGIN_LIMIT);
  if (!limited.ok) {
    return {
      error: `Muitas tentativas de login. Tente novamente em ${retryLabel(limited.retryAfterSec)}.`,
    };
  }

  // Resolve o e-mail de autenticação:
  //  • Se o input tem "@" → é e-mail direto (compat com admins antigos).
  //  • Caso contrário → é username: busca em profiles (service-role, ignora RLS)
  //    e obtém o e-mail real do Auth via getUserById. Erros são genéricos para
  //    não revelar se o usuário existe.
  let resolvedEmail: string;
  if (usuario.includes("@")) {
    resolvedEmail = usuario;
  } else {
    const svc = createServiceClient();
    const { data: profile } = await svc
      .from("profiles")
      .select("id")
      .eq("username", usuarioNorm)
      .maybeSingle();

    const userId = profile?.id as string | undefined;
    if (!userId) {
      registerHit(rlKey, LOGIN_WINDOW_MS);
      return { error: "Credenciais inválidas." };
    }

    const { data: authUser, error: authErr } =
      await svc.auth.admin.getUserById(userId);
    const realEmail = authUser?.user?.email;
    if (authErr || !realEmail) {
      registerHit(rlKey, LOGIN_WINDOW_MS);
      return { error: "Credenciais inválidas." };
    }
    resolvedEmail = realEmail;
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: resolvedEmail,
    password,
  });
  if (error) {
    // Conta só as FALHAS (login bem-sucedido não gasta o limite).
    registerHit(rlKey, LOGIN_WINDOW_MS);
    return { error: "Credenciais inválidas." };
  }

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
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}

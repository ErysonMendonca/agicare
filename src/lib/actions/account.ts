"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getCurrentUser } from "@/lib/auth";
import { getActiveClinicId } from "@/lib/tenant";
import { getSettings } from "@/lib/data/settings";
import { buildSenhaSchema, normalizePolicy } from "@/lib/validation/password";
import { consume, retryLabel } from "@/lib/rate-limit";

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


  const current = await getCurrentUser();
  if (!current?.email) {
    return { error: "Sessão expirada. Faça login novamente." };
  }

  // Rate-limit da troca de senha (reautentica com a senha atual = alvo de
  // força-bruta): no máx. 5 tentativas por usuário em 15 min.
  const rl = consume(`change-pass:${current.userId}`, 5, 15 * 60 * 1000);
  if (!rl.ok) {
    return {
      error: `Muitas tentativas. Tente novamente em ${retryLabel(rl.retryAfterSec)}.`,
    };
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

/** "" → null; string trim caso contrário. */
function nn(v: string): string | null {
  const t = v.trim();
  return t === "" ? null : t;
}

/**
 * Troca o nome de acesso (username) do PRÓPRIO usuário logado.
 *
 * - Fail-closed: exige sessão; nunca aceita id do cliente (usa userId da sessão).
 * - Rate-limit: enumeração de usernames existentes é abuso → 10 tentativas/15min.
 * - Grava via SERVICE-ROLE escopado a `.eq("id", userId)` para tratar duplicidade
 *   de forma uniforme (o índice único parcial dispara 23505).
 */
export async function changeUsername(input: {
  username: string;
}): Promise<{ ok?: boolean; error?: string }> {
  const current = await getCurrentUser();
  if (!current) return { error: "Sessão expirada. Faça login novamente." };

  // Login por username é exclusivo de staff (mesma política do fluxo admin em
  // usuarios.ts). Paciente não define nome de acesso.
  if (current.profile?.role === "paciente") {
    return { error: "Este tipo de conta não usa nome de acesso." };
  }

  const rl = consume(`change-username:${current.userId}`, 10, 15 * 60 * 1000);
  if (!rl.ok) {
    return {
      error: `Muitas tentativas. Tente novamente em ${retryLabel(rl.retryAfterSec)}.`,
    };
  }

  const schema = z.object({
    username: z
      .string()
      .trim()
      .toLowerCase()
      .regex(
        /^[a-z0-9._-]{3,40}$/,
        "Usuário inválido (3-40: letras minúsculas, números, . _ -).",
      ),
  });

  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const service = createServiceClient();
  const { error } = await service
    .from("profiles")
    .update({ username: parsed.data.username })
    .eq("id", current.userId);

  if (error) {
    const dup =
      error.code === "23505" || /duplicate|unique/i.test(error.message ?? "");
    if (dup) return { error: "Este nome de acesso já está em uso." };
    return { error: "Não foi possível atualizar o nome de acesso." };
  }

  revalidatePath("/conta");
  return { ok: true };
}

/**
 * Atualiza dados pessoais/contato/endereço do PRÓPRIO usuário logado.
 *
 * - `profiles` (full_name, phone): via RLS own (createClient, id = auth.uid()).
 * - `professionals` (dados pessoais/endereço): escrita é ADMIN-ONLY na RLS, então
 *   usa SERVICE-ROLE escopado ESTRITAMENTE à própria linha
 *   (`.eq("profile_id", userId).eq("clinic_id", clinicId)`). Só atualiza se a
 *   linha já existir — nunca cria professionals aqui.
 * - NUNCA toca em role, active, clinic_id, council*, credentials (anti-escalonamento).
 */
export async function updateMyAccount(input: {
  full_name: string;
  social_name?: string;
  birth_date?: string;
  sex?: string;
  phone?: string;
  contactEmail?: string;
  cep?: string;
  address?: string;
  address_number?: string;
  complement?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
}): Promise<{ ok?: boolean; error?: string }> {
  const current = await getCurrentUser();
  if (!current) return { error: "Sessão expirada. Faça login novamente." };



  const optStr = z.string().trim().optional();
  const schema = z.object({
    full_name: z.string().trim().min(2, "Informe o nome completo."),
    social_name: optStr,
    birth_date: z
      .union([
        z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data de nascimento inválida."),
        z.literal(""),
      ])
      .optional(),
    sex: optStr,
    phone: optStr,
    contactEmail: z
      .union([z.string().trim().email("E-mail inválido."), z.literal("")])
      .optional(),
    cep: optStr,
    address: optStr,
    address_number: optStr,
    complement: optStr,
    neighborhood: optStr,
    city: optStr,
    state: optStr,
  });

  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const d = parsed.data;
  const g = (v?: string) => (v ?? "").trim();

  const userId = current.userId;

  // 1) Identidade (profiles) — RLS own basta.
  const supabase = await createClient();
  const { error: profileError } = await supabase
    .from("profiles")
    .update({ full_name: d.full_name.trim(), phone: nn(g(d.phone)) })
    .eq("id", userId);

  if (profileError) {
    return { error: "Não foi possível salvar os dados básicos." };
  }

  // 2) Dados pessoais/endereço (professionals) — só se houver linha própria na
  //    clínica ativa. Escrita é admin-only na RLS → service-role escopado.
  const clinicId = await getActiveClinicId();
  if (clinicId) {
    const service = createServiceClient();
    const { data: prof } = await service
      .from("professionals")
      .select("id")
      .eq("profile_id", userId)
      .eq("clinic_id", clinicId)
      .maybeSingle();

    if (prof) {
      const { error: profError } = await service
        .from("professionals")
        .update({
          social_name: nn(g(d.social_name)),
          birth_date: nn(g(d.birth_date)),
          sex: nn(g(d.sex)),
          email: nn(g(d.contactEmail)),
          cep: nn(g(d.cep)),
          address: nn(g(d.address)),
          address_number: nn(g(d.address_number)),
          complement: nn(g(d.complement)),
          neighborhood: nn(g(d.neighborhood)),
          city: nn(g(d.city)),
          state: nn(g(d.state)),
        })
        .eq("profile_id", userId)
        .eq("clinic_id", clinicId);

      if (profError) {
        return { error: "Não foi possível salvar os dados pessoais." };
      }
    }
  }

  revalidatePath("/conta");
  return { ok: true };
}

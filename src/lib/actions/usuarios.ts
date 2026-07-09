"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import {
  withTenantService,
  TenantAuthError,
} from "@/lib/supabase/tenant-service";
import { requireAction } from "@/lib/permissions";
import { getSettings } from "@/lib/data/settings";
import { buildSenhaSchema, normalizePolicy } from "@/lib/validation/password";
import { consume, retryLabel } from "@/lib/rate-limit";

export type ActionState = { error?: string; ok?: boolean } | undefined;

function revalidar() {
  revalidatePath("/permissoes");
}

const BASE = z.enum(["admin", "medico", "recepcao"]);

// ── Criar cargo personalizado ────────────────────────────────────
const cargoSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome do cargo.").max(60),
  base_role: BASE,
});
export type NovoCargoInput = z.input<typeof cargoSchema>;

/** Cria um cargo (rótulo) que herda o acesso de um cargo-base. Admin-only. */
export async function criarCargo(input: NovoCargoInput): Promise<ActionState> {
  // Gate de módulo (o withTenantService abaixo ainda exige admin da clínica).
  const denied = await requireAction("usuarios", "create");
  if (denied) return { error: denied };

  const parsed = cargoSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const d = parsed.data;
  try {
    return await withTenantService(async ({ svc, clinicId }) => {
      const { error } = await svc.from("cargos").insert({
        clinic_id: clinicId,
        name: d.name,
        base_role: d.base_role,
      });
      if (error) {
        if (error.code === "23505") {
          return { error: "Já existe um cargo com esse nome." };
        }
        return { error: "Não foi possível criar o cargo." };
      }
      revalidar();
      return { ok: true };
    });
  } catch (e) {
    if (e instanceof TenantAuthError) return { error: e.message };
    return { error: "Não foi possível criar o cargo." };
  }
}

// ── Atribuir cargo a um usuário ──────────────────────────────────
// value = "base:<role>" (cargo-base puro) OU "cargo:<uuid>" (cargo personalizado).
const atribuirSchema = z.object({
  userId: z.string().uuid("Usuário inválido."),
  value: z.string().min(1, "Selecione um cargo."),
});
export type AtribuirCargoInput = z.input<typeof atribuirSchema>;

/** Define o cargo (e o acesso via role-base) de um membro da clínica. Admin-only. */
export async function atribuirCargo(input: AtribuirCargoInput): Promise<ActionState> {
  const denied = await requireAction("usuarios", "edit");
  if (denied) return { error: denied };

  const parsed = atribuirSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const { userId, value } = parsed.data;

  try {
    return await withTenantService(async ({ svc, clinicId }) => {
      let baseRole: string;
      let cargoId: string | null = null;

      if (value.startsWith("cargo:")) {
        const id = value.slice("cargo:".length);
        const { data: cargo, error } = await svc
          .from("cargos")
          .select("id, base_role")
          .eq("id", id)
          .eq("clinic_id", clinicId)
          .maybeSingle();
        if (error || !cargo) return { error: "Cargo não encontrado." };
        baseRole = cargo.base_role as string;
        cargoId = cargo.id as string;
      } else if (value.startsWith("base:")) {
        const parsedBase = BASE.safeParse(value.slice("base:".length));
        if (!parsedBase.success) return { error: "Cargo-base inválido." };
        baseRole = parsedBase.data;
      } else {
        return { error: "Cargo inválido." };
      }

      // Não deixar rebaixar o ÚLTIMO admin ativo (evita auto-lockout da clínica).
      if (baseRole !== "admin") {
        const { data: alvo } = await svc
          .from("clinic_members")
          .select("role")
          .eq("clinic_id", clinicId)
          .eq("user_id", userId)
          .maybeSingle();
        if (alvo?.role === "admin") {
          const { count } = await svc
            .from("clinic_members")
            .select("user_id", { count: "exact", head: true })
            .eq("clinic_id", clinicId)
            .eq("role", "admin")
            .eq("active", true);
          if ((count ?? 0) <= 1) {
            return {
              error: "Não é possível rebaixar o último administrador da clínica.",
            };
          }
        }
      }

      // Só altera membros DESTA clínica que não sejam paciente (defesa extra).
      const { data: upd, error: updErr } = await svc
        .from("clinic_members")
        .update({ role: baseRole, cargo_id: cargoId })
        .eq("clinic_id", clinicId)
        .eq("user_id", userId)
        .neq("role", "paciente")
        .select("user_id");
      if (updErr) return { error: "Não foi possível atribuir o cargo." };
      if (!upd || upd.length === 0) {
        return { error: "Usuário não é membro desta clínica." };
      }
      revalidar();
      return { ok: true };
    });
  } catch (e) {
    if (e instanceof TenantAuthError) return { error: e.message };
    return { error: "Não foi possível atribuir o cargo." };
  }
}

// ── Definir senha de um usuário (não-paciente) ───────────────────
/** Admin define/redefine a senha de um membro da clínica (exceto paciente). */
export async function definirSenha(input: {
  userId: string;
  newPassword: string;
}): Promise<ActionState> {
  const denied = await requireAction("usuarios", "edit");
  if (denied) return { error: denied };

  // Política de senha vigente da clínica (mesma da troca self-service).
  const settings = await getSettings();
  const policy = normalizePolicy(settings.security.passwordPolicy);
  const schema = z.object({
    userId: z.string().uuid("Usuário inválido."),
    newPassword: buildSenhaSchema(policy),
  });
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const { userId, newPassword } = parsed.data;

  // Rate-limit por alvo (userId já validado como uuid): 10 def. por 15 min.
  const rl = consume(`set-pass:${userId}`, 10, 15 * 60 * 1000);
  if (!rl.ok) {
    return {
      error: `Muitas tentativas para este usuário. Tente novamente em ${retryLabel(rl.retryAfterSec)}.`,
    };
  }

  try {
    return await withTenantService(async ({ svc, clinicId }) => {
      // O alvo DEVE ser membro desta clínica e NÃO pode ser paciente.
      const { data: membro, error: mErr } = await svc
        .from("clinic_members")
        .select("role")
        .eq("clinic_id", clinicId)
        .eq("user_id", userId)
        .maybeSingle();
      if (mErr) return { error: "Falha ao validar o usuário." };
      if (!membro) return { error: "Usuário não é membro desta clínica." };
      if (membro.role === "paciente") {
        return { error: "Não é possível definir senha de paciente." };
      }

      const { error } = await svc.auth.admin.updateUserById(userId, {
        password: newPassword,
      });
      if (error) return { error: "Não foi possível atualizar a senha." };
      return { ok: true };
    });
  } catch (e) {
    if (e instanceof TenantAuthError) return { error: e.message };
    return { error: "Não foi possível atualizar a senha." };
  }
}

// ── Definir usuário (username) de um membro (não-paciente) ────────
/** Admin define/redefine o nome de acesso (username) de um membro da clínica. */
export async function definirUsuario(input: {
  userId: string;
  username: string;
}): Promise<ActionState> {
  const denied = await requireAction("usuarios", "edit");
  if (denied) return { error: denied };

  const schema = z.object({
    userId: z.string().uuid("Usuário inválido."),
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
  const { userId, username } = parsed.data;

  // Rate-limit por alvo (userId já validado como uuid): 10 def. por 15 min.
  const rl = consume(`set-user:${userId}`, 10, 15 * 60 * 1000);
  if (!rl.ok) {
    return {
      error: `Muitas tentativas para este usuário. Tente novamente em ${retryLabel(rl.retryAfterSec)}.`,
    };
  }

  try {
    return await withTenantService(async ({ svc, clinicId }) => {
      // O alvo DEVE ser membro desta clínica e NÃO pode ser paciente.
      const { data: membro, error: mErr } = await svc
        .from("clinic_members")
        .select("role")
        .eq("clinic_id", clinicId)
        .eq("user_id", userId)
        .maybeSingle();
      if (mErr) return { error: "Falha ao validar o usuário." };
      if (!membro) return { error: "Usuário não é membro desta clínica." };
      if (membro.role === "paciente") {
        return { error: "Não é possível definir usuário de paciente." };
      }

      const { error } = await svc
        .from("profiles")
        .update({ username })
        .eq("id", userId);
      if (error) {
        if (
          error.code === "23505" ||
          /duplicate|unique/i.test(error.message ?? "")
        ) {
          return { error: "Já existe um usuário com esse nome de acesso." };
        }
        return { error: "Não foi possível definir o usuário." };
      }
      revalidar();
      return { ok: true };
    });
  } catch (e) {
    if (e instanceof TenantAuthError) return { error: e.message };
    return { error: "Não foi possível definir o usuário." };
  }
}

// ── Apagar cargo personalizado ──────────────────────────────────
export async function excluirCargo(cargoId: string): Promise<ActionState> {
  const denied = await requireAction("usuarios", "delete");
  if (denied) return { error: denied };

  if (!cargoId) return { error: "Cargo inválido." };
  try {
    return await withTenantService(async ({ svc, clinicId }) => {
      const { error } = await svc
        .from("cargos")
        .delete()
        .eq("id", cargoId)
        .eq("clinic_id", clinicId);
      if (error) {
        return { error: "Não foi possível excluir o cargo." };
      }
      revalidar();
      return { ok: true };
    });
  } catch (e) {
    if (e instanceof TenantAuthError) return { error: e.message };
    return { error: "Não foi possível excluir o cargo." };
  }
}


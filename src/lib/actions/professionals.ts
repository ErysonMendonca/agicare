"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isDemoMode } from "@/lib/supabase/config";
import {
  withTenantService,
  TenantAuthError,
} from "@/lib/supabase/tenant-service";

export type ActionState = { error?: string; ok?: boolean } | undefined;

/** Texto opcional ("" é aceito e tratado como ausente na persistência). */
const opt = z.string().trim().optional().or(z.literal(""));

/**
 * Papéis aceitos para um profissional cadastrado por esta tela.
 * Restringimos a `medico`/`recepcao` de propósito: evita escalonar para `admin`
 * através do formulário. (O enum do banco também não tem `enfermeiro`.)
 */
const roleSchema = z.enum(["medico", "recepcao"]);

/** Campos comuns a criar e editar (sem e-mail, que só existe na criação). */
const baseSchema = z.object({
  full_name: z.string().trim().min(2, "Informe o nome completo."),
  specialty: opt,
  council_reg: opt, // registro do conselho (rótulo "Conselho" na UI)
  phone: opt,
  role: roleSchema.default("medico"),
  // Endereço (colunas adicionadas em 0012_professionals_address.sql)
  cep: opt,
  address: opt,
  address_number: opt,
  complement: opt,
  neighborhood: opt,
  city: opt,
  state: opt,
  // Observações (4º bloco do cadastro — escopo 11.2; coluna em 0034).
  notes: opt,
});

const createSchema = baseSchema.extend({
  email: z.string().trim().email("E-mail inválido."),
  // Status inicial do profissional (toggle disponível também na criação).
  active: z.enum(["true", "false"]).optional(),
});

const updateSchema = baseSchema.extend({
  active: z.enum(["true", "false"]).optional(),
});

/** Monta o bloco de endereço para persistência (string vazia → null). */
function addressPayload(d: z.infer<typeof baseSchema>) {
  return {
    cep: d.cep || null,
    address: d.address || null,
    address_number: d.address_number || null,
    complement: d.complement || null,
    neighborhood: d.neighborhood || null,
    city: d.city || null,
    state: d.state || null,
  };
}

/**
 * Procura um usuário Auth existente por e-mail (case-insensitive), paginando a
 * admin API. Service-role only. Retorna o id ou null.
 */
async function findUserIdByEmail(
  svc: SupabaseClient,
  email: string,
): Promise<string | null> {
  const target = email.trim().toLowerCase();
  // A admin API não expõe getByEmail; paginamos listUsers (páginas de 200).
  for (let page = 1; page <= 25; page++) {
    const { data, error } = await svc.auth.admin.listUsers({ page, perPage: 200 });
    if (error || !data) return null;
    const hit = data.users.find((u) => u.email?.toLowerCase() === target);
    if (hit) return hit.id;
    if (data.users.length < 200) break; // última página
  }
  return null;
}

/**
 * Cria/associa um profissional à CLÍNICA ATIVA do admin — fluxo de convite híbrido.
 *
 * Autorização e tenant: tudo passa por `withTenantService`, que valida que o
 * logado é admin ATIVO na clínica ativa e entrega `{ svc, clinicId }`. O
 * `clinic_id` SEMPRE vem do servidor (clínica ativa), NUNCA do formulário.
 *
 * Fluxo:
 *  • Usuário JÁ existe (e-mail encontrado em auth.users) → NÃO cria conta;
 *    apenas associa: insere clinic_members(clinic_id ativa, user_id, role) e
 *    garante a linha em professionals (com clinic_id). (E-mail de notificação
 *    fica como follow-up — ver TODO.)
 *  • Usuário NÃO existe → cria a conta Auth (trigger handle_new_user gera o
 *    profile), associa via clinic_members e cria professionals com clinic_id.
 *    Em falha após createUser → rollback deleteUser (sem órfãos).
 *
 * Assinatura `(prev, formData)` p/ uso com useActionState (padrão do projeto).
 */
export async function createProfessional(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = createSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const d = parsed.data;
  // Status inicial (default ativo). Espelha o toggle de status da edição: só
  // afeta professionals.active; a membership na clínica permanece ativa.
  const ativo = d.active ? d.active === "true" : true;

  // Modo demo: sem banco — apenas simula sucesso (não toca dado real).
  if (isDemoMode()) return { ok: true };

  try {
    return await withTenantService(async ({ svc, clinicId }) => {
      // 1) Já existe conta com este e-mail? → associação direta (sem criar conta).
      const existingUserId = await findUserIdByEmail(svc, d.email);

      if (existingUserId) {
        // 1a) Garante a membership na clínica ativa (papel da tela).
        const { error: memberError } = await svc
          .from("clinic_members")
          .upsert(
            {
              clinic_id: clinicId,
              user_id: existingUserId,
              role: d.role,
              active: true,
            },
            { onConflict: "clinic_id,user_id" },
          );
        if (memberError) {
          return { error: "Não foi possível associar o profissional à clínica." };
        }

        // 1b) Garante a linha clínica DESTA clínica (não recria se já existir).
        const { data: existingProf } = await svc
          .from("professionals")
          .select("id")
          .eq("profile_id", existingUserId)
          .eq("clinic_id", clinicId)
          .maybeSingle();

        if (!existingProf) {
          const { error: profError } = await svc.from("professionals").insert({
            profile_id: existingUserId,
            clinic_id: clinicId,
            specialty: d.specialty || null,
            council_reg: d.council_reg || null,
            active: ativo,
            notes: d.notes || null,
            ...addressPayload(d),
          });
          if (profError) {
            return { error: "Não foi possível concluir o cadastro do profissional." };
          }
        }

        // TODO(multitenant): notificar o usuário por e-mail que foi adicionado
        //   a uma nova clínica (convite/aviso). Opcional — fora do escopo atual.
        revalidatePath("/profissionais");
        return { ok: true };
      }

      // 2) Não existe → cria a conta Auth. email_confirm=true para não disparar
      //    e-mail aqui; o convite/definição de senha fica como follow-up.
      const { data: created, error: authError } = await svc.auth.admin.createUser({
        email: d.email,
        email_confirm: true,
        user_metadata: { full_name: d.full_name, role: d.role },
      });

      if (authError || !created?.user) {
        const msg = authError?.message ?? "";
        if (/already|registered|exists/i.test(msg)) {
          return { error: "Já existe um usuário com este e-mail." };
        }
        return { error: "Não foi possível criar a conta do profissional." };
      }

      const userId = created.user.id;

      // 2a) Completa o profile criado pelo trigger (profile é GLOBAL → sem clinic_id).
      const { error: profileError } = await svc
        .from("profiles")
        .update({ full_name: d.full_name, role: d.role, phone: d.phone || null })
        .eq("id", userId);

      if (profileError) {
        await svc.auth.admin.deleteUser(userId);
        return { error: "Não foi possível salvar os dados do profissional." };
      }

      // 2b) Membership na clínica ativa (papel POR clínica).
      const { error: memberError } = await svc.from("clinic_members").insert({
        clinic_id: clinicId,
        user_id: userId,
        role: d.role,
        active: true,
      });
      if (memberError) {
        await svc.auth.admin.deleteUser(userId);
        return { error: "Não foi possível associar o profissional à clínica." };
      }

      // 2c) Linha clínica DESTA clínica.
      const { error: profError } = await svc.from("professionals").insert({
        profile_id: userId,
        clinic_id: clinicId,
        specialty: d.specialty || null,
        council_reg: d.council_reg || null,
        active: ativo,
        notes: d.notes || null,
        ...addressPayload(d),
      });

      if (profError) {
        // Rollback: evita órfão em auth.users/profiles/clinic_members.
        await svc.auth.admin.deleteUser(userId);
        return { error: "Não foi possível concluir o cadastro do profissional." };
      }

      revalidatePath("/profissionais");
      return { ok: true };
    });
  } catch (e) {
    if (e instanceof TenantAuthError) return { error: e.message };
    return { error: "Não foi possível concluir o cadastro do profissional." };
  }
}

/**
 * Atualiza um profissional existente e o profile vinculado.
 * `id` é fixado via `.bind(null, id)` no client; daí `(id, prev, formData)`.
 * Não altera e-mail/conta Auth aqui (fora de escopo).
 *
 * Tenant: o select e o update em professionals filtram por `clinic_id` da
 * clínica ativa — fecha o IDOR cross-tenant (não dá para editar profissional
 * de outra clínica passando um id arbitrário).
 */
export async function updateProfessional(
  id: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  if (!id) return { error: "Profissional inválido." };

  const parsed = updateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const d = parsed.data;

  if (isDemoMode()) return { ok: true };

  try {
    return await withTenantService(async ({ svc, clinicId }) => {
      // Descobre o profile vinculado — SOMENTE dentro da clínica ativa (anti-IDOR).
      const { data: prof, error: fetchError } = await svc
        .from("professionals")
        .select("profile_id")
        .eq("id", id)
        .eq("clinic_id", clinicId)
        .maybeSingle();

      if (fetchError || !prof) {
        return { error: "Profissional não encontrado." };
      }

      const { error: profError } = await svc
        .from("professionals")
        .update({
          specialty: d.specialty || null,
          council_reg: d.council_reg || null,
          active: d.active ? d.active === "true" : true,
          notes: d.notes || null,
          ...addressPayload(d),
        })
        .eq("id", id)
        .eq("clinic_id", clinicId);

      if (profError) {
        return { error: "Não foi possível atualizar o profissional." };
      }

      // profiles é GLOBAL (1:1 com auth.users) → sem filtro de clinic_id.
      const { error: profileError } = await svc
        .from("profiles")
        .update({ full_name: d.full_name, role: d.role, phone: d.phone || null })
        .eq("id", prof.profile_id);

      if (profileError) {
        return { error: "Não foi possível atualizar os dados do profissional." };
      }

      revalidatePath("/profissionais");
      return { ok: true };
    });
  } catch (e) {
    if (e instanceof TenantAuthError) return { error: e.message };
    return { error: "Não foi possível atualizar o profissional." };
  }
}

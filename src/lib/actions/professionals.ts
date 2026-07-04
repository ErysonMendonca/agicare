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

/** Texto opcional ("" é aceito e tratado como ausente na persistência). Limite
 *  de tamanho defensivo (evita blobs/DoS via campo). */
const opt = z.string().trim().max(2000).optional().or(z.literal(""));

/**
 * Papéis aceitos para um profissional cadastrado por esta tela.
 * Restringimos a `medico`/`recepcao` de propósito: evita escalonar para `admin`
 * através do formulário. (O enum do banco também não tem `enfermeiro`.)
 */
const roleSchema = z.enum(["medico", "recepcao"]);

/** Credenciamento de convênio (TISS 3.0) — vários por profissional (0070). */
const credentialSchema = z.object({
  convenio: opt,
  vigencia: opt,
  convenio_code: opt,
  lab_code: opt,
  tiss_login: opt,
  tiss_password: opt,
  recebe_eletivo: z.boolean().optional().default(false),
  recebe_urgencia: z.boolean().optional().default(false),
  recebe_internacao: z.boolean().optional().default(false),
  xml_tag: opt,
  cpf_or_convenio_code: opt,
});
export type CredencialConvenio = z.infer<typeof credentialSchema>;

/** Campo oculto `credentials`: JSON com a lista de credenciamentos. */
const credentialsField = z
  .string()
  .optional()
  .transform((s) => {
    if (!s) return [];
    try {
      const arr = JSON.parse(s);
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  })
  .pipe(z.array(credentialSchema).max(50, "Limite de convênios excedido."));

/** Campos comuns a criar e editar (sem e-mail, que só existe na criação). */
const baseSchema = z.object({
  full_name: z.string().trim().min(2, "Informe o nome completo."),
  // Dados pessoais (0070)
  person_type: z.enum(["cpf", "cnpj"]).optional().or(z.literal("")),
  document: opt, // nº do CPF/CNPJ
  social_name: opt,
  birth_date: opt,
  sex: opt,
  gender: opt,
  mother_name: opt,
  race: opt,
  birthplace: opt,
  nationality: opt,
  // Tipo de profissional
  specialty: opt,
  cns: opt,
  cnes: opt,
  // Conselho detalhado (0070)
  council_number: opt,
  council_name: opt,
  council_uf: opt,
  council_expiry: opt,
  council_reg: opt, // legado (derivado dos campos acima p/ a listagem)
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
  // Credenciamento de convênio (0070) — lista via campo oculto JSON.
  credentials: credentialsField,
});

const createSchema = baseSchema.extend({
  // Nome de acesso (login). Sempre minúsculo; e-mail sintético interno é
  // derivado como `${username}@agicare.local` para o Supabase Auth.
  username: z
    .string()
    .trim()
    .toLowerCase()
    .regex(
      /^[a-z0-9._-]{3,40}$/,
      "Usuário inválido (3-40 caracteres: letras minúsculas, números, . _ -).",
    ),
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

/** Deriva o council_reg legado (usado na listagem/coluna "CRM") dos campos
 *  detalhados do conselho. Ex.: "CRM/SP 123456". Fallback ao council_reg cru. */
function derivarCouncilReg(d: z.infer<typeof baseSchema>): string | null {
  const orgUf = [d.council_name, d.council_uf].filter(Boolean).join("/");
  const composto = [orgUf, d.council_number].filter(Boolean).join(" ").trim();
  return composto || d.council_reg || null;
}

/** Campos do cadastro completo (dados pessoais + tipo + conselho) → colunas 0070. */
function professionalPayload(d: z.infer<typeof baseSchema>) {
  return {
    person_type: d.person_type || null,
    document: d.document || null,
    social_name: d.social_name || null,
    birth_date: d.birth_date || null,
    sex: d.sex || null,
    gender: d.gender || null,
    mother_name: d.mother_name || null,
    race: d.race || null,
    birthplace: d.birthplace || null,
    nationality: d.nationality || null,
    cns: d.cns || null,
    cnes: d.cnes || null,
    council_number: d.council_number || null,
    council_name: d.council_name || null,
    council_uf: d.council_uf || null,
    council_expiry: d.council_expiry || null,
    council_reg: derivarCouncilReg(d),
  };
}

/** Uma credencial tem conteúdo? (evita gravar linhas totalmente vazias.) */
function credencialPreenchida(c: CredencialConvenio): boolean {
  return !!(
    c.convenio ||
    c.vigencia ||
    c.convenio_code ||
    c.lab_code ||
    c.tiss_login ||
    c.tiss_password ||
    c.xml_tag ||
    c.cpf_or_convenio_code ||
    c.recebe_eletivo ||
    c.recebe_urgencia ||
    c.recebe_internacao
  );
}

/**
 * Substitui (replace) os credenciamentos de convênio de um profissional:
 * apaga os existentes e insere a lista enviada (só as linhas preenchidas).
 * Usa o cliente service-role (svc) — a tabela é RLS admin-only. Escopa clinic_id.
 */
async function replaceCredentials(
  svc: SupabaseClient,
  clinicId: string,
  professionalId: string,
  creds: CredencialConvenio[],
): Promise<string | null> {
  const { error: delErr } = await svc
    .from("professional_insurance_credentials")
    .delete()
    .eq("professional_id", professionalId)
    .eq("clinic_id", clinicId);
  if (delErr) return delErr.message;

  const linhas = creds.filter(credencialPreenchida).map((c) => ({
    clinic_id: clinicId,
    professional_id: professionalId,
    convenio: c.convenio || null,
    vigencia: c.vigencia || null,
    convenio_code: c.convenio_code || null,
    lab_code: c.lab_code || null,
    tiss_login: c.tiss_login || null,
    tiss_password: c.tiss_password || null,
    recebe_eletivo: !!c.recebe_eletivo,
    recebe_urgencia: !!c.recebe_urgencia,
    recebe_internacao: !!c.recebe_internacao,
    xml_tag: c.xml_tag || null,
    cpf_or_convenio_code: c.cpf_or_convenio_code || null,
  }));
  if (linhas.length === 0) return null;

  const { error: insErr } = await svc
    .from("professional_insurance_credentials")
    .insert(linhas);
  return insErr?.message ?? null;
}

/**
 * Procura um usuário existente pelo nome de acesso (username) na tabela
 * `profiles` (citext unique). Service-role only. Retorna o id (profile.id ==
 * auth.users.id) ou null.
 */
async function findUserIdByUsername(
  svc: SupabaseClient,
  username: string,
): Promise<string | null> {
  const { data } = await svc
    .from("profiles")
    .select("id")
    .eq("username", username)
    .maybeSingle();
  return (data?.id as string | undefined) ?? null;
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
  // E-mail sintético interno para o Supabase Auth (o login real é por username).
  const syntheticEmail = `${d.username}@agicare.local`;
  // Status inicial (default ativo). Espelha o toggle de status da edição: só
  // afeta professionals.active; a membership na clínica permanece ativa.
  const ativo = d.active ? d.active === "true" : true;

  // Modo demo: sem banco — apenas simula sucesso (não toca dado real).
  if (isDemoMode()) return { ok: true };

  try {
    return await withTenantService(async ({ svc, clinicId }) => {
      // 1) Já existe conta com este username? → associação direta (sem criar conta).
      const existingUserId = await findUserIdByUsername(svc, d.username);

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

        let professionalId = existingProf?.id as string | undefined;
        if (!existingProf) {
          const { data: novo, error: profError } = await svc
            .from("professionals")
            .insert({
              profile_id: existingUserId,
              clinic_id: clinicId,
              specialty: d.specialty || null,
              active: ativo,
              notes: d.notes || null,
              ...professionalPayload(d),
              ...addressPayload(d),
            })
            .select("id")
            .single();
          if (profError || !novo) {
            return { error: "Não foi possível concluir o cadastro do profissional." };
          }
          professionalId = novo.id as string;
        } else {
          // Já vinculado a esta clínica → atualiza os dados do cadastro completo.
          const { error: upErr } = await svc
            .from("professionals")
            .update({
              specialty: d.specialty || null,
              active: ativo,
              notes: d.notes || null,
              ...professionalPayload(d),
              ...addressPayload(d),
            })
            .eq("id", existingProf.id)
            .eq("clinic_id", clinicId);
          if (upErr) {
            return { error: "Não foi possível atualizar o profissional." };
          }
        }

        if (professionalId) {
          const credErr = await replaceCredentials(
            svc,
            clinicId,
            professionalId,
            d.credentials,
          );
          if (credErr) {
            revalidatePath("/profissionais");
            return { error: "Não foi possível salvar o credenciamento de convênio." };
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
        email: syntheticEmail,
        email_confirm: true,
        user_metadata: { full_name: d.full_name, role: d.role },
      });

      if (authError || !created?.user) {
        const msg = authError?.message ?? "";
        if (/already|registered|exists/i.test(msg)) {
          return { error: "Já existe um usuário com este nome de acesso." };
        }
        return { error: "Não foi possível criar a conta do profissional." };
      }

      const userId = created.user.id;

      // 2a) Completa o profile criado pelo trigger (profile é GLOBAL → sem clinic_id).
      const { error: profileError } = await svc
        .from("profiles")
        .update({
          full_name: d.full_name,
          role: d.role,
          phone: d.phone || null,
          username: d.username,
        })
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
      const { data: novoProf, error: profError } = await svc
        .from("professionals")
        .insert({
          profile_id: userId,
          clinic_id: clinicId,
          specialty: d.specialty || null,
          active: ativo,
          notes: d.notes || null,
          ...professionalPayload(d),
          ...addressPayload(d),
        })
        .select("id")
        .single();

      if (profError || !novoProf) {
        // Rollback: evita órfão em auth.users/profiles/clinic_members.
        await svc.auth.admin.deleteUser(userId);
        return { error: "Não foi possível concluir o cadastro do profissional." };
      }

      // 2d) Credenciamento de convênio (0070). Falha aqui NÃO faz rollback da
      //     conta (profissional já criado) — só reporta para reenvio.
      const credErr = await replaceCredentials(
        svc,
        clinicId,
        novoProf.id as string,
        d.credentials,
      );
      if (credErr) {
        revalidatePath("/profissionais");
        return { error: "Profissional criado, mas falhou o credenciamento de convênio." };
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
          active: d.active ? d.active === "true" : true,
          notes: d.notes || null,
          ...professionalPayload(d),
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

      // Substitui o credenciamento de convênio (0070).
      const credErr = await replaceCredentials(svc, clinicId, id, d.credentials);
      if (credErr) {
        return { error: "Não foi possível salvar o credenciamento de convênio." };
      }

      revalidatePath("/profissionais");
      return { ok: true };
    });
  } catch (e) {
    if (e instanceof TenantAuthError) return { error: e.message };
    return { error: "Não foi possível atualizar o profissional." };
  }
}

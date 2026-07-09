"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  withTenantService,
  TenantAuthError,
} from "@/lib/supabase/tenant-service";

export type ActionState = { 
  error?: string; 
  ok?: boolean; 
  fieldErrors?: Record<string, string[]>;
  data?: any;
} | undefined;

/** Texto opcional ("" é aceito e tratado como ausente na persistência). Limite
 *  de tamanho defensivo (evita blobs/DoS via campo). */
const opt = z.string().trim().max(2000).optional().or(z.literal(""));

/**
 * Papel e cargo do profissional. Pode vir no formato 'baseRole' ou 'baseRole:cargoId'.
 */
const roleSchema = z.string();

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

/** Campos comuns a criar e editar. */
const baseSchema = z.object({
  full_name: z.string().trim().min(2, "Informe o nome completo."),
  // E-mail de CONTATO real do profissional (opcional). Diferente do e-mail
  // sintético interno do Auth (derivado do username). Coluna em 0085.
  email: z
    .string()
    .trim()
    .email("E-mail inválido.")
    .optional()
    .or(z.literal("")),
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
  professional_type: opt,
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
  // Departamento (Administrativo)
  department: opt,
  job_title: opt,
  // Observações (4º bloco do cadastro — escopo 11.2; coluna em 0034).
  notes: opt,
  // Credenciamento de convênio (0070) — lista via campo oculto JSON.
  credentials: credentialsField,
});

const createSchema = baseSchema.extend({
  // Credenciais (JSON literal do stringify do client).
  credentials: z
    .string()
    .optional()
    .transform((val) => {
      if (!val) return [];
      try {
        return JSON.parse(val) as CredencialConvenio[];
      } catch {
        return [];
      }
    }),
  // Status inicial do profissional (toggle disponível também na criação).
  active: z.enum(["true", "false"]).optional(),
  username: z.string().trim().min(3, "O usuário de login deve ter ao menos 3 caracteres."),
  password: z.string().min(6, "A senha deve ter no mínimo 6 caracteres."),
  confirm_password: z.string(),
}).refine((data) => data.password === data.confirm_password, {
  message: "As senhas não coincidem.",
  path: ["confirm_password"],
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
    professional_type: d.professional_type || null,
    council_number: d.council_number || null,
    council_name: d.council_name || null,
    council_uf: d.council_uf || null,
    council_expiry: d.council_expiry || null,
    council_reg: derivarCouncilReg(d),
    // E-mail de contato real (0085). Comum a create e update.
    email: d.email || null,
    // Departamento
    department: d.department || null,
    job_title: d.job_title || null,
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
 * Cria um profissional NOVO na CLÍNICA ATIVA do admin (sem credenciais).
 *
 * Autorização e tenant: tudo passa por `withTenantService`, que valida que o
 * logado é admin ATIVO na clínica ativa e entrega `{ svc, clinicId }`. O
 * `clinic_id` SEMPRE vem do servidor (clínica ativa), NUNCA do formulário.
 *
 * Fluxo: cria SEMPRE uma conta Auth nova (sem senha e com e-mail sintético
 * único), associa via clinic_members e cria a linha em professionals. O
 * usuário (username) e a senha são definidos DEPOIS em
 * "Perfis de Acesso › Usuários". Em falha após createUser → rollback deleteUser
 * (sem órfãos).
 *
 * Assinatura `(prev, formData)` p/ uso com useActionState (padrão do projeto).
 */
export async function createProfessional(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = createSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { 
      error: "Verifique os campos em vermelho e tente novamente.", 
      fieldErrors: parsed.error.flatten().fieldErrors,
      data: Object.fromEntries(formData)
    };
  }
  const d = parsed.data;
  // Status inicial (default ativo). Espelha o toggle de status da edição: só
  // afeta professionals.active; a membership na clínica permanece ativa.
  const ativo = d.active ? d.active === "true" : true;

  // Modo demo: sem banco — apenas simula sucesso (não toca dado real).

  try {
    return await withTenantService(async ({ svc, clinicId }) => {
      // Cria a conta Auth COM login e senha, agora integrados na criação do prof.
      // Usa um e-mail sintético baseado no username.
      const synthEmail = `${d.username}@agicare.local`;
      const { data: created, error: authError } = await svc.auth.admin.createUser({
        email: synthEmail,
        password: d.password,
        email_confirm: true,
        user_metadata: { full_name: d.full_name, role: d.role, username: d.username },
      });

      if (authError || !created?.user) {
        return { error: "Não foi possível criar a conta do profissional." };
      }

      const userId = created.user.id;

      // Completa o profile criado pelo trigger (profile é GLOBAL → sem clinic_id).
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
        return { error: "Não foi possível salvar os dados do perfil." };
      }

      // Membership na clínica ativa (papel POR clínica).
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

      // Linha clínica DESTA clínica.
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

      // Credenciamento de convênio (0070). Falha aqui NÃO faz rollback da
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

/** Schema para criação da equipe administrativa (com login e senha) */
const createAdminSchema = baseSchema.extend({
  active: z.enum(["true", "false"]).optional(),
  username: z.string().trim().min(3, "O usuário de login deve ter ao menos 3 caracteres."),
  password: z.string().trim().min(6, "A senha deve ter no mínimo 6 caracteres."),
  confirm_password: z.string(),
}).refine((data) => data.password === data.confirm_password, {
  message: "As senhas não coincidem.",
  path: ["confirm_password"],
});

/**
 * Cria um membro da Equipe Administrativa NOVO na CLÍNICA ATIVA.
 * Diferente da equipe clínica, a equipe administrativa já define a senha e o
 * username no momento do cadastro.
 */
export async function createAdminProfessional(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = createAdminSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { 
      error: "Verifique os campos em vermelho e tente novamente.",
      fieldErrors: parsed.error.flatten().fieldErrors,
      data: Object.fromEntries(formData)
    };
  }
  const d = parsed.data;
  const ativo = d.active ? d.active === "true" : true;


  try {
    return await withTenantService(async ({ svc, clinicId }) => {
      // Parse custom role
      const [parsedBaseRole, parsedCargoId] = d.role.split(":");
      const finalRole = parsedBaseRole || "recepcao";
      const cargoId = parsedCargoId || null;

      // Verifica se o username já existe antes de tentar criar
      const { data: existingProfile } = await svc
        .from("profiles")
        .select("id")
        .eq("username", d.username)
        .maybeSingle();

      if (existingProfile) {
        return { 
          error: "Verifique os campos em vermelho e tente novamente.",
          fieldErrors: { username: ["Este nome de usuário já está em uso. Escolha outro."] },
          data: Object.fromEntries(formData)
        };
      }

      // Cria a conta Auth COM o login (username) e senha fornecidos
      const synthEmail = `${d.username}@agicare.local`;
      const { data: created, error: authError } = await svc.auth.admin.createUser({
        email: synthEmail,
        password: d.password,
        email_confirm: true,
        user_metadata: { full_name: d.full_name, role: finalRole, username: d.username },
      });

      if (authError || !created?.user) {
        const msg = authError?.message ?? "Desconhecido";
        // Email sintético já existe = username duplicado
        if (msg.toLowerCase().includes("already") || msg.toLowerCase().includes("duplicate") || msg.toLowerCase().includes("unique")) {
          return {
            error: "Verifique os campos em vermelho e tente novamente.",
            fieldErrors: { username: ["Este nome de usuário já está em uso. Escolha outro."] },
            data: Object.fromEntries(formData)
          };
        }
        return { error: "Erro ao criar conta: " + msg };
      }

      const userId = created.user.id;

      // Completa o profile criado pelo trigger
      const { error: profileError } = await svc
        .from("profiles")
        .update({
          full_name: d.full_name,
          role: finalRole,
          phone: d.phone || null,
          username: d.username,
        })
        .eq("id", userId);

      if (profileError) {
        await svc.auth.admin.deleteUser(userId);
        return { error: "Não foi possível salvar os dados do perfil: " + profileError.message };
      }

      // Membership na clínica ativa
      const { error: memberError } = await svc.from("clinic_members").insert({
        clinic_id: clinicId,
        user_id: userId,
        role: finalRole,
        cargo_id: cargoId,
        active: true,
      });
      
      if (memberError) {
        await svc.auth.admin.deleteUser(userId);
        return { error: "Não foi possível vincular à clínica: " + memberError.message };
      }

      // Registro na tabela professionals
      const payload = {
        ...professionalPayload(d),
        ...addressPayload(d),
      };

      const { error: profError } = await svc.from("professionals").insert({
        id: userId,
        profile_id: userId,
        clinic_id: clinicId,
        active: ativo,
        ...payload,
      });

      if (profError) {
        await svc.auth.admin.deleteUser(userId);
        return { error: "Erro ao salvar os detalhes do profissional: " + profError.message };
      }

      return { ok: true };
    });
  } catch (err) {
    if (err instanceof TenantAuthError) return { error: err.message };
    const msg = err instanceof Error ? err.message : String(err);
    return { error: "Ocorreu um erro inesperado: " + msg };
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
    return { 
      error: "Verifique os campos em vermelho e tente novamente.",
      fieldErrors: parsed.error.flatten().fieldErrors,
      data: Object.fromEntries(formData)
    };
  }
  const d = parsed.data;


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

      // Parse custom role
      const [parsedBaseRole, parsedCargoId] = d.role.split(":");
      const finalRole = parsedBaseRole || "recepcao";
      const cargoId = parsedCargoId || null;

      // profiles é GLOBAL (1:1 com auth.users) → sem filtro de clinic_id.
      const { error: profileError } = await svc
        .from("profiles")
        .update({ full_name: d.full_name, role: finalRole, phone: d.phone || null })
        .eq("id", prof.profile_id);

      if (profileError) {
        return { error: "Não foi possível atualizar os dados do profissional." };
      }

      // Atualiza também o membership na clínica (para cargo_id e role)
      await svc
        .from("clinic_members")
        .update({ role: finalRole, cargo_id: cargoId })
        .eq("user_id", prof.profile_id)
        .eq("clinic_id", clinicId);

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

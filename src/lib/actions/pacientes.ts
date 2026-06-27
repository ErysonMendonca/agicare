"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/supabase/config";
import { requireClinic, getActiveClinicId, DEMO_CLINIC_ID } from "@/lib/tenant";
import { getCurrentUser, requireClinico } from "@/lib/auth";
import { canView } from "@/lib/permissions";
import { isValidCPF } from "@/lib/cpf";
import { isValidCNS } from "@/lib/cns";
import { getPatientEditavel, type PacienteEditavel } from "@/lib/data/patients";

export type ActionState =
  | { error?: string; ok?: boolean; patientId?: string; clinicId?: string }
  | undefined;

const texto = z.string().trim().optional().or(z.literal(""));

// Campos do cadastro (3 abas §6.1/§6.2). Centralizado para reuso entre o
// cadastro (createPacienteCompleto) e a edição (updatePaciente) — mesmo contrato.
const pacienteCampos = {
  // Dados pessoais
  full_name: z.string().trim().min(2, "Informe o nome completo."),
  social_name: texto,
  cpf: texto,
  cns: texto,
  birth_date: texto,
  gender: texto,
  mother_name: texto,
  naturality: texto,
  nationality: texto,
  race: texto,
  ethnicity: texto,
  marital_status: texto,
  legal_guardian: texto,
  blood_type: texto,
  // Convênio (não-SUS exige plano)
  convenio: texto,
  plan: texto,
  // Origem / canal de captação (alimenta o BI "Origem dos Pacientes")
  origin: texto,
  // Contato e endereço
  phone: texto,
  cell: texto,
  email: z.string().trim().email("E-mail inválido.").optional().or(z.literal("")),
  cep: texto,
  address: texto,
  district: texto,
  city: texto,
  uf: texto,
  // Histórico / óbito
  death_date: texto,
  death_cause: texto,
} as const;

// Mesmas regras de negócio (DV de CPF/CNS + convênio exige plano) aplicadas tanto
// ao cadastro quanto à edição, garantindo paridade de validação na borda.
type PacienteInput = z.infer<z.ZodObject<typeof pacienteCampos>>;
function comRegras<S extends z.ZodType<PacienteInput>>(schema: S) {
  return schema
    .refine((d) => !d.cpf || isValidCPF(d.cpf), {
      message: "CPF inválido (dígito verificador).",
      path: ["cpf"],
    })
    .refine((d) => !d.cns || isValidCNS(d.cns), {
      message: "CNS inválido (dígito verificador).",
      path: ["cns"],
    })
    .refine(
      (d) =>
        !d.convenio ||
        d.convenio.toLowerCase() === "sus" ||
        d.convenio.toLowerCase() === "particular" ||
        !!d.plan,
      { message: "Convênio (não-SUS) exige o plano.", path: ["plan"] },
    );
}

const pacienteSchema = comRegras(z.object(pacienteCampos));

const pacienteUpdateSchema = comRegras(
  z.object({
    id: z.string().trim().min(1, "Paciente inválido."),
    // Token de optimistic lock embarcado pelo form (updated_at carregado na
    // abertura da edição — ver 0044). Opcional p/ resiliência a cadastros
    // pré-0044, em que a coluna pode não existir.
    updated_at: z.string().trim().optional().or(z.literal("")),
    ...pacienteCampos,
  }),
);

/**
 * Cadastro completo de paciente (3 abas). Valida CPF/CNS e regra de convênio.
 * Endereço de contato (logradouro/bairro/cidade) é concatenado em `notes`
 * para resiliência (colunas de endereço não fazem parte da 0010).
 * Persiste via cliente de servidor (RLS staff). Em modo demo, simula sucesso.
 *
 * Devolve `patientId` + `clinicId` da linha criada: o cliente precisa deles
 * para montar o path do anexo de prontuário no Storage (mesmo layout do
 * protético — `prontuarios/<clinic_id>/<patient_id>/<arquivo>`).
 */
export async function createPacienteCompleto(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = pacienteSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  if (isDemoMode()) {
    return { ok: true, patientId: `demo-pac-${Date.now()}`, clinicId: DEMO_CLINIC_ID };
  }

  const d = parsed.data;
  const enderecoPartes = [d.address, d.district, d.city, d.uf, d.cep].filter(
    Boolean,
  );
  const notas =
    enderecoPartes.length > 0 ? `Endereço: ${enderecoPartes.join(", ")}` : null;

  const clinicId = await requireClinic();
  const supabase = await createClient();

  // Anti-duplicidade no CADASTRO (antes só existia na edição): espelha a
  // barreira do índice único 0046 — bloqueia CPF/CNS já usado por outro
  // paciente da clínica antes de inserir.
  const dup = await acharDuplicadoExcluindo(supabase, clinicId, {
    cpf: d.cpf ?? "",
    cns: d.cns ?? "",
  });
  if (dup) return { error: dup };

  const { data: novo, error } = await supabase
    .from("patients")
    .insert({
      clinic_id: clinicId,
      full_name: d.full_name,
      social_name: d.social_name || null,
      cpf: d.cpf || null,
      cns: d.cns || null,
      birth_date: d.birth_date || null,
      gender: d.gender || null,
      mother_name: d.mother_name || null,
      naturality: d.naturality || null,
      nationality: d.nationality || null,
      race: d.race || null,
      ethnicity: d.ethnicity || null,
      marital_status: d.marital_status || null,
      legal_guardian: d.legal_guardian || null,
      blood_type: d.blood_type || null,
      convenio: d.convenio || null,
      plan: d.plan || null,
      origin: d.origin || null,
      phone: d.cell || d.phone || null,
      email: d.email || null,
      notes: notas,
      death_date: d.death_date || null,
      death_cause: d.death_cause || null,
      active: !d.death_date, // óbito → inativo
    })
    .select("id")
    .single();

  if (error || !novo) {
    if (error?.code === "23505") {
      return { error: "CPF ou CNS já cadastrado para outro paciente nesta clínica." };
    }
    return { error: error?.message ?? "Falha ao cadastrar o paciente." };
  }

  revalidatePath("/pacientes");
  return { ok: true, patientId: novo.id as string, clinicId };
}

// ── Paciente AVULSO (cadastro mínimo no agendamento — 0049) ─────────
// LGPD: no agendamento avulso guardamos só o dado MÍNIMO (Nome/Telefone/CPF).
// O cadastro fica `registration_complete=false` e é COMPLETADO no check-in.
const avulsoSchema = z.object({
  nome: z.string().trim().min(2, "Informe o nome do paciente."),
  telefone: z.string().trim().min(8, "Informe um telefone válido."),
  cpf: z
    .string()
    .trim()
    .min(1, "Informe o CPF.")
    .refine(isValidCPF, "CPF inválido (dígito verificador)."),
});

/**
 * Cria um paciente AVULSO (cadastro mínimo) para o agendamento avulso.
 * Anti-duplicidade: se já existir paciente com o mesmo CPF na clínica, REUSA
 * (retorna o id existente, sem duplicar) — espelha o índice único 0046.
 * Guarda só Nome/Telefone/CPF e `registration_complete=false`; o restante é
 * preenchido no check-in (completarCadastroAvulso). Demo: simula sucesso.
 *
 * Assinatura é contrato com o módulo de Agenda — não alterar sem alinhar.
 */
export async function criarPacienteAvulso(input: {
  nome: string;
  telefone: string;
  cpf: string;
}): Promise<{
  ok?: boolean;
  patientId?: string;
  error?: string;
  /** true = reaproveitou um paciente já existente com o mesmo CPF (anti-duplicidade),
   * em vez de criar um novo. A Agenda avisa o usuário para ele saber que NÃO é
   * um cadastro novo (o cadastro existente pode já estar completo). */
  reused?: boolean;
}> {
  const parsed = avulsoSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const d = parsed.data;

  if (isDemoMode()) {
    return { ok: true, patientId: `demo-avulso-${Date.now()}` };
  }

  const guard = await requirePacientesAccess();
  if ("error" in guard) return { error: guard.error };

  const clinicId = await requireClinic();
  const supabase = await createClient();

  // Anti-duplicidade: reusa o paciente da clínica com o mesmo CPF (só-dígitos).
  const existenteId = await acharPacientePorCpf(supabase, clinicId, d.cpf);
  if (existenteId) return { ok: true, patientId: existenteId, reused: true };

  const { data: novo, error } = await supabase
    .from("patients")
    .insert({
      clinic_id: clinicId,
      full_name: d.nome,
      phone: d.telefone,
      cpf: d.cpf,
      registration_complete: false,
    })
    .select("id")
    .single();

  if (error || !novo) {
    // Corrida no índice único 0046 (outro request gravou o mesmo CPF) → reusa.
    if (error?.code === "23505") {
      const id = await acharPacientePorCpf(supabase, clinicId, d.cpf);
      if (id) return { ok: true, patientId: id, reused: true };
      return { error: "CPF já cadastrado nesta clínica." };
    }
    return { error: "Não foi possível criar o paciente." };
  }

  revalidatePath("/pacientes");
  return { ok: true, patientId: novo.id as string, reused: false };
}

// Completar cadastro do avulso (no check-in): preenche os campos faltantes e
// marca registration_complete=true. Nome + nascimento são o mínimo p/ concluir.
const completarAvulsoSchema = z
  .object({
    id: z.string().trim().min(1, "Paciente inválido."),
    full_name: z.string().trim().min(2, "Informe o nome completo."),
    birth_date: z.string().trim().min(1, "Informe a data de nascimento."),
    email: z.string().trim().email("E-mail inválido.").optional().or(z.literal("")),
    convenio: texto,
    plan: texto,
    phone: texto,
    cpf: texto,
  })
  .refine((d) => !d.cpf || isValidCPF(d.cpf), {
    message: "CPF inválido (dígito verificador).",
    path: ["cpf"],
  })
  .refine(
    (d) =>
      !d.convenio ||
      d.convenio.toLowerCase() === "sus" ||
      d.convenio.toLowerCase() === "particular" ||
      !!d.plan,
    { message: "Convênio (não-SUS) exige o plano.", path: ["plan"] },
  );

/**
 * Completa o cadastro de um paciente AVULSO no check-in: grava os campos
 * informados e seta `registration_complete=true`. É UPDATE PARCIAL — só toca
 * nas colunas enviadas (não zera o que não veio no formulário, ao contrário do
 * updatePaciente, que é o overwrite completo das 3 abas). Reusa as guardas/
 * helpers do módulo (requirePacientesAccess, anti-duplicidade de CPF). Demo:
 * simula sucesso.
 */
export async function completarCadastroAvulso(input: {
  id: string;
  full_name: string;
  birth_date: string;
  email?: string;
  convenio?: string;
  plan?: string;
  phone?: string;
  cpf?: string;
}): Promise<{ ok?: boolean; patientId?: string; error?: string }> {
  const parsed = completarAvulsoSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const d = parsed.data;

  if (isDemoMode()) return { ok: true, patientId: d.id };

  const guard = await requirePacientesAccess();
  if ("error" in guard) return { error: guard.error };

  const clinicId = await requireClinic();
  const supabase = await createClient();

  // Se o CPF for ajustado aqui, não pode colidir com OUTRO paciente da clínica.
  if (d.cpf) {
    const dup = await acharDuplicadoExcluindo(
      supabase,
      clinicId,
      { cpf: d.cpf, cns: "" },
      d.id,
    );
    if (dup) return { error: dup };
  }

  const patch: Record<string, unknown> = {
    registration_complete: true,
    full_name: d.full_name,
    birth_date: d.birth_date,
  };
  if (d.email) patch.email = d.email;
  if (d.convenio) patch.convenio = d.convenio;
  if (d.plan) patch.plan = d.plan;
  if (d.phone) patch.phone = d.phone;
  if (d.cpf) patch.cpf = d.cpf;

  const { data: upd, error } = await supabase
    .from("patients")
    .update(patch)
    .eq("id", d.id)
    .eq("clinic_id", clinicId)
    .select("id")
    .maybeSingle();

  if (error) {
    if (error.code === "23505") {
      return { error: "CPF já cadastrado para outro paciente nesta clínica." };
    }
    return { error: "Não foi possível completar o cadastro." };
  }
  if (!upd) return { error: "Paciente não encontrado nesta clínica." };

  revalidatePath("/pacientes");
  revalidatePath(`/pacientes/${d.id}`);
  revalidatePath("/fila");
  return { ok: true, patientId: d.id };
}

const obitoSchema = z.object({
  id: z.string().min(1, "Paciente inválido."),
  death_date: z.string().trim().min(1, "Informe a data do óbito."),
  death_cause: z.string().trim().optional().or(z.literal("")),
});

/** Registra óbito de um paciente já cadastrado e o marca como inativo. */
export async function registrarObito(
  id: string,
  death_date: string,
  death_cause: string,
): Promise<ActionState> {
  const parsed = obitoSchema.safeParse({ id, death_date, death_cause });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  if (isDemoMode()) return { ok: true };

  // Defesa-em-profundidade (além da RLS): registrar óbito é ação de staff do
  // módulo, igual ao cadastro/edição — não confiar só na RLS.
  const guard = await requirePacientesAccess();
  if ("error" in guard) return { error: guard.error };

  const clinicId = await requireClinic();
  const supabase = await createClient();
  const { error } = await supabase
    .from("patients")
    .update({
      death_date: parsed.data.death_date,
      death_cause: parsed.data.death_cause || null,
      active: false,
    })
    .eq("id", parsed.data.id)
    .eq("clinic_id", clinicId);

  if (error) return { error: error.message };

  revalidatePath("/pacientes");
  return { ok: true };
}

/**
 * Edição completa do cadastro do paciente (mesmas 3 abas/contrato do cadastro).
 * Reusa o schema do cadastro (DV de CPF/CNS + regra de convênio) e exige acesso
 * de staff ao módulo (requirePacientesAccess); a RLS por clínica é a 2ª camada.
 *
 * Diferente do cadastro (que concatena o endereço em `notes`), a edição grava o
 * endereço nas COLUNAS estruturadas (cep/address/district/city/state=UF) da 0026
 * — exatamente as que a Ficha lê primeiro, deixando leitura e escrita coerentes.
 *
 * O UPDATE é escopado por `id` + `clinic_id` da clínica ativa (defesa explícita,
 * além da RLS). Devolve `patientId`/`clinicId` para o cliente reusar o fluxo de
 * upload do anexo de prontuário (mesmo do cadastro). Demo: simula sucesso.
 */
export async function updatePaciente(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = pacienteUpdateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const d = parsed.data;

  if (isDemoMode()) {
    return { ok: true, patientId: d.id, clinicId: DEMO_CLINIC_ID };
  }

  const guard = await requirePacientesAccess();
  if ("error" in guard) return { error: guard.error };

  const clinicId = await requireClinic();
  const supabase = await createClient();

  // Anti-duplicidade na edição: se um CPF/CNS for informado, ele não pode
  // colidir com OUTRO paciente da mesma clínica (exclui o próprio id). Reusa a
  // mesma normalização (só-dígitos) da busca do cadastro.
  const dupErro = await acharDuplicadoExcluindo(
    supabase,
    clinicId,
    { cpf: d.cpf || "", cns: d.cns || "" },
    d.id,
  );
  if (dupErro) return { error: dupErro };

  let q = supabase
    .from("patients")
    .update({
      // Avulso: o check-in agora completa o cadastro pela ficha completa.
      // Idempotente — paciente normal já é true; reafirmar não muda nada.
      registration_complete: true,
      full_name: d.full_name,
      social_name: d.social_name || null,
      cpf: d.cpf || null,
      cns: d.cns || null,
      birth_date: d.birth_date || null,
      gender: d.gender || null,
      mother_name: d.mother_name || null,
      naturality: d.naturality || null,
      nationality: d.nationality || null,
      race: d.race || null,
      ethnicity: d.ethnicity || null,
      marital_status: d.marital_status || null,
      legal_guardian: d.legal_guardian || null,
      blood_type: d.blood_type || null,
      convenio: d.convenio || null,
      plan: d.plan || null,
      origin: d.origin || null,
      phone: d.cell || d.phone || null,
      email: d.email || null,
      cep: d.cep || null,
      address: d.address || null,
      district: d.district || null,
      city: d.city || null,
      state: d.uf || null,
      death_date: d.death_date || null,
      death_cause: d.death_cause || null,
      // Óbito → inativa. SEM óbito NÃO mexe em `active` (preserva): senão editar
      // qualquer campo de um inativo-sem-óbito o reativaria silenciosamente.
      ...(d.death_date ? { active: false } : {}),
    })
    .eq("id", d.id)
    .eq("clinic_id", clinicId);

  // OPTIMISTIC LOCK: só casa a linha cujo updated_at é o que foi carregado na
  // abertura da edição. Se outro usuário gravou no meio, o trigger (0044)
  // mudou o updated_at e o match falha → tratamos como conflito abaixo. Token
  // ausente (cadastro pré-0044) cai no comportamento antigo (sem lock).
  const lock = (d.updated_at ?? "").trim();
  if (lock) q = q.eq("updated_at", lock);

  const { data: atualizado, error } = await q.select("id").maybeSingle();

  if (error) {
    // Rede de segurança do índice único 0046 (corrida que passou pela checagem).
    if (error.code === "23505") {
      return { error: "CPF ou CNS já cadastrado para outro paciente nesta clínica." };
    }
    return { error: error.message };
  }
  if (!atualizado) {
    // Linha não casou. Distingue conflito de concorrência (existe na clínica,
    // mas o updated_at divergiu) de "não encontrado" (não existe nesta clínica).
    const { data: existe } = await supabase
      .from("patients")
      .select("id")
      .eq("id", d.id)
      .eq("clinic_id", clinicId)
      .maybeSingle();
    if (existe) {
      return {
        error:
          "Cadastro alterado por outro usuário. Recarregue e tente de novo.",
      };
    }
    return { error: "Paciente não encontrado nesta clínica." };
  }

  revalidatePath("/pacientes");
  revalidatePath(`/pacientes/${d.id}`);
  revalidatePath(`/prontuario/${d.id}`);
  return { ok: true, patientId: d.id, clinicId };
}

/**
 * Carrega os dados CRUS (sem formatação) de um paciente para pré-preencher o
 * formulário de edição. Restrita a staff do módulo (requirePacientesAccess) e
 * isolada pela clínica ativa (RLS). Usada pelo menu "Editar cadastro" da lista,
 * que precisa buscar a ficha completa sob demanda. Demo: devolve o paciente mock.
 */
export async function getPacienteEditavel(
  id: string,
): Promise<{ error?: string; paciente?: PacienteEditavel }> {
  if (!id) return { error: "Paciente inválido." };

  if (isDemoMode()) {
    const paciente = await getPatientEditavel(id);
    return paciente ? { paciente } : { error: "Paciente não encontrado." };
  }

  const guard = await requirePacientesAccess();
  if ("error" in guard) return { error: guard.error };

  const paciente = await getPatientEditavel(id);
  if (!paciente) return { error: "Paciente não encontrado." };
  return { paciente };
}

/**
 * Reforço de autorização (server-side) para as ações do módulo Pacientes:
 * exige sessão e permissão de ver o módulo (admin/médico/recepção pela matriz
 * de papéis). A RLS (`patients_staff_all` por clínica) é a 2ª camada. Devolve
 * `{ error }` em vez de redirecionar — para as actions retornarem ao caller.
 */
async function requirePacientesAccess(): Promise<{ error: string } | { ok: true }> {
  const current = await getCurrentUser();
  if (!current) return { error: "Sessão expirada." };
  if (!(await canView("pacientes"))) {
    return { error: "Acesso restrito ao módulo de Pacientes." };
  }
  return { ok: true };
}

// ── Anti-duplicidade (busca por CPF/CNS) ───────────────────────────
const buscaDocSchema = z
  .object({
    cpf: z.string().trim().optional().or(z.literal("")),
    cns: z.string().trim().optional().or(z.literal("")),
  })
  .refine((d) => !!d.cpf || !!d.cns, {
    message: "Informe um CPF ou CNS para a busca.",
  });

export type PacienteDuplicado = { id: string; nome: string; cpf: string; cns: string };

/**
 * Busca pacientes já cadastrados pelo CPF e/ou CNS informados (anti-duplicidade,
 * acionada pelo botão "lupa" do cadastro). Normaliza os documentos para dígitos e
 * compara sem máscara. Restrita a staff e isolada pela clínica ativa (RLS). Em
 * modo demo não há banco — retorna lista vazia (sem falso-positivo).
 */
export async function buscarPacientePorDocumento(input: {
  cpf?: string;
  cns?: string;
}): Promise<{ error?: string; encontrados?: PacienteDuplicado[] }> {
  const parsed = buscaDocSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  if (isDemoMode()) return { encontrados: [] };

  const guard = await requirePacientesAccess();
  if ("error" in guard) return { error: guard.error };

  const cpfRaw = (parsed.data.cpf ?? "").trim();
  const cnsRaw = (parsed.data.cns ?? "").trim();
  const cpf = cpfRaw.replace(/\D/g, "");
  const cns = cnsRaw.replace(/\D/g, "");

  const supabase = await createClient();
  // Pré-filtro por igualdade cobrindo as gravações comuns (com e sem máscara):
  // o documento pode ter sido salvo como digitado. O match definitivo é feito
  // depois, comparando só os dígitos de ambos os lados.
  // Sanitiza valores crus antes do `.or()` do PostgREST (vírgula/parênteses são
  // metacaracteres do parser e um valor forjado quebraria/ampliaria a query, A2).
  const safe = (v: string) => (v ?? "").replace(/[(),]/g, "");
  const ors = new Set<string>();
  if (cpf) {
    ors.add(`cpf.eq.${cpf}`);
    ors.add(`cpf.eq.${formatCpf(cpf)}`);
    const raw = safe(cpfRaw);
    if (raw) ors.add(`cpf.eq.${raw}`);
  }
  if (cns) {
    ors.add(`cns.eq.${cns}`);
    const raw = safe(cnsRaw);
    if (raw) ors.add(`cns.eq.${raw}`);
  }

  const { data, error } = await supabase
    .from("patients")
    .select("id, full_name, cpf, cns")
    .or([...ors].join(","))
    .limit(10);

  if (error) return { error: error.message };

  const encontrados = (data ?? [])
    .filter((p) => {
      const pc = ((p.cpf as string | null) ?? "").replace(/\D/g, "");
      const pn = ((p.cns as string | null) ?? "").replace(/\D/g, "");
      return (cpf && pc === cpf) || (cns && pn === cns);
    })
    .map((p) => ({
      id: p.id as string,
      nome: (p.full_name as string | null) ?? "—",
      cpf: (p.cpf as string | null) ?? "",
      cns: (p.cns as string | null) ?? "",
    }));

  return { encontrados };
}

/** Aplica a máscara 000.000.000-00 a um CPF só-dígitos (p/ casar com gravados com máscara). */
function formatCpf(d: string): string {
  if (d.length !== 11) return d;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

type ServerSupabase = Awaited<ReturnType<typeof createClient>>;

/**
 * Anti-duplicidade na EDIÇÃO: procura outro paciente da mesma clínica com o
 * mesmo CPF e/ou CNS (comparando só os dígitos), EXCLUINDO o próprio `id`.
 * Devolve a mensagem de bloqueio (ou null se estiver livre). Mesma normalização
 * da busca do cadastro (com e sem máscara). Escopa por `clinic_id` explícito
 * (defesa-em-profundidade, além da RLS). Em modo demo a action nem chega aqui.
 */
async function acharDuplicadoExcluindo(
  supabase: ServerSupabase,
  clinicId: string,
  doc: { cpf: string; cns: string },
  excludeId?: string,
): Promise<string | null> {
  const cpf = (doc.cpf ?? "").replace(/\D/g, "");
  const cns = (doc.cns ?? "").replace(/\D/g, "");
  if (!cpf && !cns) return null;

  // Sanitiza valores CRUS antes de injetá-los no filtro `.or()` do PostgREST:
  // vírgula/parênteses são metacaracteres do parser (separam/agrupam condições)
  // e um valor forjado os usaria para quebrar/ampliar a query (A2).
  const safe = (v: string) => (v ?? "").replace(/[(),]/g, "");
  const ors = new Set<string>();
  if (cpf) {
    ors.add(`cpf.eq.${cpf}`);
    ors.add(`cpf.eq.${formatCpf(cpf)}`);
    const raw = safe(doc.cpf);
    if (raw) ors.add(`cpf.eq.${raw}`);
  }
  if (cns) {
    ors.add(`cns.eq.${cns}`);
    const raw = safe(doc.cns);
    if (raw) ors.add(`cns.eq.${raw}`);
  }

  let query = supabase
    .from("patients")
    .select("id, full_name, cpf, cns")
    .eq("clinic_id", clinicId);
  // Na edição, exclui o próprio paciente; no cadastro (sem excludeId), não.
  if (excludeId) query = query.neq("id", excludeId);
  const { data, error } = await query.or([...ors].join(",")).limit(10);

  // Falha de consulta NÃO deve mascarar como "sem duplicado": propaga p/ a UI.
  if (error) return "Falha ao verificar duplicidade de CPF/CNS. Tente de novo.";

  const colide = (data ?? []).find((p) => {
    const pc = ((p.cpf as string | null) ?? "").replace(/\D/g, "");
    const pn = ((p.cns as string | null) ?? "").replace(/\D/g, "");
    return (cpf && pc === cpf) || (cns && pn === cns);
  });
  if (!colide) return null;

  const nome = (colide.full_name as string | null) ?? "outro paciente";
  return `CPF/CNS já cadastrado para ${nome} nesta clínica.`;
}

/**
 * Anti-duplicidade do AVULSO: acha o id do paciente da clínica com o mesmo CPF
 * (comparado por dígitos, com e sem máscara). Retorna o id ou null. Mesma
 * normalização/sanitização do `.or()` da busca do cadastro. Em demo nem chega
 * aqui (a action retorna antes).
 */
async function acharPacientePorCpf(
  supabase: ServerSupabase,
  clinicId: string,
  cpfRaw: string,
): Promise<string | null> {
  const cpf = (cpfRaw ?? "").replace(/\D/g, "");
  if (!cpf) return null;

  const safe = (v: string) => (v ?? "").replace(/[(),]/g, "");
  const ors = new Set<string>();
  ors.add(`cpf.eq.${cpf}`);
  ors.add(`cpf.eq.${formatCpf(cpf)}`);
  const raw = safe(cpfRaw);
  if (raw) ors.add(`cpf.eq.${raw}`);

  const { data, error } = await supabase
    .from("patients")
    .select("id, cpf")
    .eq("clinic_id", clinicId)
    .or([...ors].join(","))
    .limit(10);
  if (error || !data) return null;

  const found = data.find(
    (p) => ((p.cpf as string | null) ?? "").replace(/\D/g, "") === cpf,
  );
  return found ? (found.id as string) : null;
}

// ── Anexo de prontuário manual (Storage: bucket `prontuarios`) ──────
const anexoSchema = z.object({
  patientId: z.string().min(1, "Paciente inválido."),
  storagePath: z.string().trim().min(1, "Caminho do arquivo inválido."),
  fileName: z.string().trim().min(1, "Arquivo inválido."),
});

/**
 * Registra os metadados do arquivo de prontuário manual já enviado ao bucket
 * privado `prontuarios` (o upload binário acontece no browser, igual ao fluxo
 * protético). Grava `manual_record_path` + `manual_record_name` na ficha.
 * Autorização de staff do módulo via requirePacientesAccess (RLS é a 2ª camada).
 */
export async function anexarProntuarioManual(input: {
  patientId: string;
  storagePath: string;
  fileName: string;
}): Promise<ActionState> {
  const parsed = anexoSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  if (isDemoMode()) return { ok: true };

  const guard = await requirePacientesAccess();
  if ("error" in guard) return { error: guard.error };

  // Anti-IDOR: o path DEVE estar dentro da pasta da clínica ativa + do próprio
  // paciente (<clinic_id>/<patient_id>/...). Impede apontar manual_record_path
  // para o arquivo de OUTRO paciente da mesma clínica e bloqueia path traversal.
  const clinicId = await requireClinic();
  const prefixo = `${clinicId}/${parsed.data.patientId}/`;
  const storagePath = parsed.data.storagePath;
  if (!storagePath.startsWith(prefixo) || storagePath.includes("..")) {
    return { error: "Caminho do arquivo inválido." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("patients")
    .update({
      manual_record_path: storagePath,
      manual_record_name: parsed.data.fileName,
    })
    .eq("id", parsed.data.patientId);

  if (error) return { error: error.message };

  revalidatePath("/pacientes");
  revalidatePath(`/pacientes/${parsed.data.patientId}`);
  revalidatePath(`/prontuario/${parsed.data.patientId}`);
  return { ok: true };
}

/**
 * Gera uma URL assinada (5 min) para "puxar" o arquivo de prontuário manual de um
 * paciente. Usada pelos botões da ficha e do prontuário eletrônico. O CONTEÚDO é
 * documento clínico (LGPD) → leitura restrita a admin/médico (requireClinico),
 * mesmo que recepção possa filá-lo no cadastro. Não vaza o path bruto ao client.
 */
export async function getProntuarioManualUrl(
  patientId: string,
): Promise<{ error?: string; url?: string }> {
  if (!patientId) return { error: "Paciente inválido." };
  if (isDemoMode()) {
    return { error: "Anexo indisponível no modo demonstração." };
  }

  const guard = await requireClinico();
  if ("error" in guard) return { error: guard.error };

  const supabase = await createClient();
  const { data: p, error: pErr } = await supabase
    .from("patients")
    .select("manual_record_path")
    .eq("id", patientId)
    .maybeSingle();
  if (pErr) return { error: pErr.message };

  const path = (p?.manual_record_path as string | null) ?? null;
  if (!path) return { error: "Nenhum arquivo de prontuário anexado." };

  const { data, error } = await supabase.storage
    .from("prontuarios")
    .createSignedUrl(path, 300);
  if (error || !data?.signedUrl) {
    return { error: error?.message ?? "Falha ao gerar o link do arquivo." };
  }
  return { url: data.signedUrl };
}

/**
 * Stub HONESTO do "Sincronizar CadSUS": a integração com o barramento do DATASUS
 * exige credencial/certificado que NÃO existe neste ambiente. Não fingimos
 * sucesso — devolvemos um erro claro de "não configurado" para a UI exibir.
 *
 * HANDOFF: para ativar de verdade, configurar o webservice do CADSUS/CNS e
 * trocar este corpo pela chamada real (autenticação + consulta por CNS/CPF).
 */
export async function sincronizarCadSus(): Promise<{ error: string }> {
  const clinicId = await getActiveClinicId();
  if (!clinicId) return { error: "Nenhuma clínica ativa selecionada." };
  return {
    error:
      "Integração com o CadSUS (DATASUS) não configurada neste ambiente. Requer credencial/certificado do barramento.",
  };
}

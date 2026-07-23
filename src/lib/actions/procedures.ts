"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isGestor, getCurrentUser } from "@/lib/auth";
import { requireClinic } from "@/lib/tenant";

export type ActionState = { error?: string; ok?: boolean } | undefined;

/** Converte string ("12,5" ou "12.5" ou "") em número >= 0. */
const numeroOpcional = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v && v !== "" ? Number(v.replace(",", ".")) : 0))
  .pipe(z.number().min(0, "Valor inválido."));

/** Inteiro >= 0 a partir de string. */
const inteiroOpcional = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v && v !== "" ? Math.round(Number(v.replace(",", "."))) : 0))
  .pipe(z.number().int().min(0, "Valor inválido."));

/** Inteiro >= 0 OU null quando vazio (campos opcionais sem default 0). */
const inteiroOuNulo = z
  .string()
  .trim()
  .optional()
  .transform((v) =>
    v && v !== "" ? Math.round(Number(v.replace(",", "."))) : null,
  )
  .pipe(z.number().int().min(0, "Valor inválido.").nullable());

const procedureSchema = z.object({
  // Aba A — Identificação
  // `code` é OPCIONAL: na criação o SKU é gerado no servidor (sequencial por
  // clínica); na edição vem do form (o campo é exibido e enviado).
  code: z.string().trim().optional().or(z.literal("")),
  name: z.string().trim().min(2, "Nome muito curto."),
  category: z.string().trim().optional().or(z.literal("")),
  description: z.string().trim().optional().or(z.literal("")),
  commercial_desc: z.string().trim().optional().or(z.literal("")),
  // Aba B — Tempo e Agenda
  duration_min: inteiroOpcional, // execução
  setup_min: inteiroOpcional,
  cleanup_min: inteiroOpcional,
  // Aba D — Sessões
  sessions: inteiroOpcional,
  session_validity_days: inteiroOuNulo,
  min_age: inteiroOuNulo,
  audience: z.string().trim().optional().or(z.literal("")),
  // Aba E — Orientações e documentos
  pre_instructions: z.string().trim().optional().or(z.literal("")),
  post_instructions: z.string().trim().optional().or(z.literal("")),
  require_consent: z.string().optional(),
  require_anamnese: z.string().optional(),
  // Canal de envio das orientações pré/pós ao paciente (preferência persistida).
  instructions_channel: z
    .enum(["email", "sms", "ambos"])
    .optional()
    .default("email"),
  // Aba F — Financeiro
  price: numeroOpcional,
  cost: numeroOpcional,
  commission_pct: numeroOpcional,
  tax_pct: numeroOpcional,
  active: z.string().optional(),
});

/**
 * Persiste as junções (Aba B — profissionais, Aba C — materiais) e as
 * orientações (Aba E) de um procedimento. Estratégia replace-all: apaga o
 * vínculo atual e reinsere o que veio no form (simples e idempotente).
 * Erros aqui não derrubam o cadastro principal — apenas são reportados.
 */
async function persistirRelacionados(
  supabase: Awaited<ReturnType<typeof createClient>>,
  procedureId: string,
  formData: FormData,
  d: z.infer<typeof procedureSchema>,
): Promise<void> {
  // Aba B — Profissionais habilitados (junção).
  const professionalIds = formData
    .getAll("professional_ids")
    .map((v) => String(v))
    .filter(Boolean);
  await supabase
    .from("procedure_professionals")
    .delete()
    .eq("procedure_id", procedureId);
  if (professionalIds.length > 0) {
    await supabase.from("procedure_professionals").insert(
      professionalIds.map((pid) => ({
        procedure_id: procedureId,
        professional_id: pid,
      })),
    );
  }

  // Aba C — Materiais/insumos consumidos (junção, com a QTD baixada por
  // execução). A qtd. de cada material vem em `material_qty_<productId>`
  // (default 1, mínimo > 0). Estratégia replace-all como as demais abas.
  const materialIds = formData
    .getAll("material_ids")
    .map((v) => String(v))
    .filter(Boolean);
  await supabase
    .from("procedure_materials")
    .delete()
    .eq("procedure_id", procedureId);
  if (materialIds.length > 0) {
    await supabase.from("procedure_materials").insert(
      materialIds.map((mid) => {
        const raw = String(formData.get(`material_qty_${mid}`) ?? "").replace(
          ",",
          ".",
        );
        const qtd = Number(raw);
        return {
          procedure_id: procedureId,
          product_id: mid,
          quantity: Number.isFinite(qtd) && qtd > 0 ? qtd : 1,
        };
      }),
    );
  }

  // Aba C2 — Instrumental (junção com attendance_options, category='instrumental').
  // Catálogo reutilizável, SEM baixa de estoque e SEM quantidade. Estratégia
  // replace-all como as demais abas. Isolado: se a migration 0117 ainda não foi
  // aplicada, a tabela não existe e as operações falham sem derrubar o cadastro.
  const instrumentIds = formData
    .getAll("instrument_ids")
    .map((v) => String(v))
    .filter(Boolean);
  await supabase
    .from("procedure_instruments")
    .delete()
    .eq("procedure_id", procedureId);
  if (instrumentIds.length > 0) {
    await supabase.from("procedure_instruments").insert(
      instrumentIds.map((oid) => ({
        procedure_id: procedureId,
        option_id: oid,
      })),
    );
  }

  // Aba E — Orientações e documentos (upsert 1:1).
  await supabase.from("procedure_instructions").upsert(
    {
      procedure_id: procedureId,
      pre_instructions: d.pre_instructions || null,
      post_instructions: d.post_instructions || null,
      require_consent: d.require_consent === "on",
      require_anamnese: d.require_anamnese === "on",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "procedure_id" },
  );

  // Canal das orientações (coluna da migration 0042) — update ISOLADO: se a
  // migration ainda não foi aplicada, a coluna não existe e este update falha
  // sem derrubar a persistência das orientações acima (degradação segura).
  await supabase
    .from("procedure_instructions")
    .update({ notify_channel: d.instructions_channel })
    .eq("procedure_id", procedureId);
}

/** Sufixo numérico de um código no padrão "PROC-NNNNN" (0 se não casar). */
function sufixoCodigo(code: string): number {
  const m = /^PROC-(\d+)$/.exec(code.trim());
  return m ? parseInt(m[1], 10) : 0;
}

/** Formata o SKU sequencial a partir do número (PROC-00001). */
function formatarCodigo(n: number): string {
  return `PROC-${String(n).padStart(5, "0")}`;
}

/**
 * Gera o próximo SKU sequencial do procedimento PARA A CLÍNICA (server-side).
 * Varre os códigos existentes no padrão "PROC-NNNNN" da clínica e devolve o
 * maior sufixo + 1. Sequência por clínica (isolada via clinic_id). Eventuais
 * colisões com o índice UNIQUE global de `code` são tratadas com retry no insert.
 */
async function gerarCodigoProcedimento(
  supabase: Awaited<ReturnType<typeof createClient>>,
  clinicId: string,
): Promise<string> {
  const { data } = await supabase
    .from("procedures")
    .select("code")
    .eq("clinic_id", clinicId)
    .like("code", "PROC-%");

  let max = 0;
  for (const r of data ?? []) {
    max = Math.max(max, sufixoCodigo(String(r.code ?? "")));
  }
  return formatarCodigo(max + 1);
}

/**
 * Cria um procedimento (cadastro em 6 abas — gestor-only).
 * Calcula a margem líquida a partir de preço, custo, comissão e impostos.
 * O SKU/code é gerado NO SERVIDOR (sequencial por clínica), nunca pelo client.
 * Persiste via cliente de servidor (RLS staff). Em modo demo, simula sucesso.
 */
export async function createProcedure(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  // Reforço de autorização no servidor (gate do proxy é otimista).
  if (!(await isGestor())) return { error: "Acesso restrito ao gestor." };

  const parsed = procedureSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const d = parsed.data;
  const margem = calcMargem(d);


  const clinicId = await requireClinic();
  const supabase = await createClient();

  // SKU sequencial por clínica. O insert tenta gravar; em violação do UNIQUE
  // global de `code` (23505) incrementa o sufixo e tenta de novo (até 5x).
  let code = await gerarCodigoProcedimento(supabase, clinicId);
  let insertedId: string | null = null;

  for (let tentativa = 0; tentativa < 5; tentativa++) {
    const { data: inserted, error } = await supabase
      .from("procedures")
      .insert({
        clinic_id: clinicId,
        code,
        name: d.name,
        category: d.category || null,
        description: d.description || null,
        commercial_desc: d.commercial_desc || null,
        duration_min: d.duration_min,
        setup_min: d.setup_min,
        cleanup_min: d.cleanup_min,
        sessions: d.sessions || 1,
        session_validity_days: d.session_validity_days,
        min_age: d.min_age,
        audience: d.audience || "todos",
        price: d.price,
        cost: d.cost,
        commission_pct: d.commission_pct,
        tax_pct: d.tax_pct,
        margin_pct: margem,
        active: d.active !== "false",
      })
      .select("id")
      .single();

    if (!error && inserted) {
      insertedId = inserted.id as string;
      break;
    }
    // 23505 = unique_violation (code já usado) → bump do sufixo e nova tentativa.
    if (error?.code === "23505") {
      code = formatarCodigo(sufixoCodigo(code) + 1);
      continue;
    }
    return { error: error?.message ?? "Falha ao salvar." };
  }

  if (!insertedId) {
    return { error: "Não foi possível gerar um código único. Tente novamente." };
  }

  // Persiste as abas B (profissionais), C (materiais) e E (orientações).
  await persistirRelacionados(supabase, insertedId, formData, d);

  revalidatePath("/procedimentos");
  return { ok: true };
}

/** Margem líquida (%) a partir de preço, custo, comissão e impostos. */
function calcMargem(d: z.infer<typeof procedureSchema>): number {
  const comissaoValor = (d.price * d.commission_pct) / 100;
  const impostoValor = (d.price * d.tax_pct) / 100;
  const lucroLiquido = d.price - d.cost - comissaoValor - impostoValor;
  return d.price > 0 ? Math.round((lucroLiquido / d.price) * 100) : 0;
}

/**
 * Atualiza um procedimento existente (gestor-only). Mesmo schema do create.
 * Recalcula a margem líquida. NÃO altera `active` — o ciclo ativo/inativo é
 * responsabilidade exclusiva de deleteProcedure (soft-delete). Em demo, simula sucesso.
 */
export async function updateProcedure(
  id: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  if (!id) return { error: "Procedimento inválido." };

  // Reforço de autorização no servidor (gate do proxy é otimista).
  if (!(await isGestor())) return { error: "Acesso restrito ao gestor." };

  const parsed = procedureSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const d = parsed.data;
  const code = d.code?.trim();
  if (!code) return { error: "Código obrigatório." };
  const margem = calcMargem(d);


  const supabase = await createClient();
  const { error } = await supabase
    .from("procedures")
    .update({
      code,
      name: d.name,
      category: d.category || null,
      description: d.description || null,
      commercial_desc: d.commercial_desc || null,
      duration_min: d.duration_min,
      setup_min: d.setup_min,
      cleanup_min: d.cleanup_min,
      sessions: d.sessions || 1,
      session_validity_days: d.session_validity_days,
      min_age: d.min_age,
      audience: d.audience || "todos",
      price: d.price,
      cost: d.cost,
      commission_pct: d.commission_pct,
      tax_pct: d.tax_pct,
      margin_pct: margem,
    })
    .eq("id", id);

  if (error) return { error: error.message };

  // Persiste as abas B (profissionais), C (materiais) e E (orientações).
  await persistirRelacionados(supabase, id, formData, d);

  revalidatePath("/procedimentos");
  return { ok: true };
}

/**
 * Remove um procedimento (gestor-only) via SOFT-DELETE: marca `active=false`,
 * preservando histórico e integridade referencial. Em demo, simula sucesso.
 */
export async function deleteProcedure(id: string): Promise<ActionState> {
  if (!id) return { error: "Procedimento inválido." };

  if (!(await isGestor())) return { error: "Acesso restrito ao gestor." };


  const supabase = await createClient();
  const { error } = await supabase
    .from("procedures")
    .update({ active: false })
    .eq("id", id);

  if (error) return { error: error.message };

  revalidatePath("/procedimentos");
  return { ok: true };
}

/** Colunas copiadas no clone (tudo menos id/created_at/code). */
const DUP_COLS =
  "name, description, category, commercial_desc, duration_min, setup_min, cleanup_min, sessions, session_validity_days, min_age, audience, price, cost, commission_pct, tax_pct, margin_pct, active";

/**
 * DUPLICA um procedimento (gestor-only): cria um novo registro com os mesmos
 * dados, sufixo "(cópia)" no nome e código novo, e clona as junções (Aba B/C)
 * e as orientações (Aba E). Em demo, simula sucesso.
 */
export async function duplicateProcedure(id: string): Promise<ActionState> {
  if (!id) return { error: "Procedimento inválido." };

  if (!(await isGestor())) return { error: "Acesso restrito ao gestor." };


  const clinicId = await requireClinic();
  const supabase = await createClient();

  // Lê o original (RLS staff).
  const { data: orig, error: readErr } = await supabase
    .from("procedures")
    .select(DUP_COLS)
    .eq("id", id)
    .single();

  if (readErr || !orig) return { error: readErr?.message ?? "Procedimento não encontrado." };

  // Código novo SEQUENCIAL por clínica (mesmo gerador/padrão "PROC-NNNNN" do
  // createProcedure), com retry no UNIQUE global de `code` (23505): garante um
  // SKU único e coerente com a sequência da clínica em vez de um sufixo
  // baseado em timestamp (que colidia e quebrava a ordenação).
  let code = await gerarCodigoProcedimento(supabase, clinicId);
  let cloneId: string | null = null;

  for (let tentativa = 0; tentativa < 5; tentativa++) {
    const { data: clone, error: insErr } = await supabase
      .from("procedures")
      .insert({
        ...orig,
        clinic_id: clinicId,
        code,
        name: `${orig.name} (cópia)`,
        active: true,
      })
      .select("id")
      .single();

    if (!insErr && clone) {
      cloneId = clone.id as string;
      break;
    }
    // 23505 = unique_violation (code já usado) → bump do sufixo e nova tentativa.
    if (insErr?.code === "23505") {
      code = formatarCodigo(sufixoCodigo(code) + 1);
      continue;
    }
    return { error: insErr?.message ?? "Falha ao duplicar." };
  }

  if (!cloneId) {
    return { error: "Não foi possível gerar um código único. Tente novamente." };
  }

  // Clona junções (Aba B/C) e orientações (Aba E).
  const { data: profs } = await supabase
    .from("procedure_professionals")
    .select("professional_id")
    .eq("procedure_id", id);
  if (profs && profs.length > 0) {
    await supabase.from("procedure_professionals").insert(
      profs.map((p) => ({
        procedure_id: cloneId,
        professional_id: p.professional_id,
      })),
    );
  }

  const { data: mats } = await supabase
    .from("procedure_materials")
    .select("product_id, quantity")
    .eq("procedure_id", id);
  if (mats && mats.length > 0) {
    await supabase.from("procedure_materials").insert(
      mats.map((m) => ({
        procedure_id: cloneId,
        product_id: m.product_id,
        quantity: m.quantity,
      })),
    );
  }

  // Clona a Aba C2 (instrumental) — junção sem quantidade. Isolado: se a
  // migration 0117 não estiver aplicada, falha sem afetar o restante do clone.
  const { data: tools } = await supabase
    .from("procedure_instruments")
    .select("option_id")
    .eq("procedure_id", id);
  if (tools && tools.length > 0) {
    await supabase.from("procedure_instruments").insert(
      tools.map((t) => ({
        procedure_id: cloneId,
        option_id: t.option_id,
      })),
    );
  }

  const { data: instr } = await supabase
    .from("procedure_instructions")
    .select("pre_instructions, post_instructions, require_consent, require_anamnese")
    .eq("procedure_id", id)
    .maybeSingle();
  if (instr) {
    await supabase.from("procedure_instructions").insert({
      procedure_id: cloneId,
      ...instr,
    });
    // Copia o canal das orientações (coluna 0042) de forma isolada — se a
    // migration não estiver aplicada, falha sem afetar o clone das orientações.
    const { data: canal } = await supabase
      .from("procedure_instructions")
      .select("notify_channel")
      .eq("procedure_id", id)
      .maybeSingle();
    if (canal?.notify_channel) {
      await supabase
        .from("procedure_instructions")
        .update({ notify_channel: canal.notify_channel })
        .eq("procedure_id", cloneId);
    }
  }

  revalidatePath("/procedimentos");
  return { ok: true };
}

/**
 * Registra a EXECUÇÃO/USO de um procedimento (gestor-only).
 *
 * A baixa de estoque NÃO é mais feita aqui em loop (read-then-write, sujeito a
 * corrida/oversell e a estado parcial). Apenas inserimos a EXECUÇÃO em
 * `procedure_executions`; o trigger `trg_baixa_estoque_execucao` (migration
 * 0031) debita cada insumo vinculado e grava o movimento auditável
 * (quem/quando/origem) na MESMA transação. Em demo, simula sucesso.
 */
export async function registrarExecucao(id: string): Promise<ActionState> {
  if (!id) return { error: "Procedimento inválido." };

  if (!(await isGestor())) return { error: "Acesso restrito ao gestor." };


  const current = await getCurrentUser();
  if (!current) return { error: "Sessão expirada." };

  const clinicId = await requireClinic();
  const supabase = await createClient();

  // UX: avisa antes de gravar quando não há nada a baixar.
  const { data: mats, error: matErr } = await supabase
    .from("procedure_materials")
    .select("product_id")
    .eq("procedure_id", id)
    .limit(1);
  if (matErr) return { error: matErr.message };
  if (!mats || mats.length === 0) {
    return { error: "Nenhum material vinculado a este procedimento." };
  }

  // Insere a execução; o trigger aplica a baixa transacional + histórico.
  const { error } = await supabase.from("procedure_executions").insert({
    clinic_id: clinicId,
    procedure_id: id,
    executed_by: current.userId,
  });
  if (error) return { error: error.message };

  revalidatePath("/procedimentos");
  revalidatePath("/estoque");
  return { ok: true };
}

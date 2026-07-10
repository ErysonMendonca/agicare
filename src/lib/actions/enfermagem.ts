"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { requireClinic } from "@/lib/tenant";
import { getAtendimentoAtivo } from "@/lib/data/atendimento";

export type ActionState = { error?: string; ok?: boolean } | undefined;

function revalidate() {
  // Enfermagem virou aba do prontuário; revalida toda a árvore do prontuário.
  // (Os clients também chamam router.refresh() após cada ação.)
  revalidatePath("/prontuario", "layout");
}

/** Nome do profissional logado (desnormalizado nos registros de enfermagem). */
async function profissionalNome(): Promise<string> {
  const current = await getCurrentUser();
  return current?.profile?.full_name ?? "Equipe de Enfermagem";
}

/** id (profiles.id) do operador logado — autoria dos registros. null se sem sessão. */
async function operadorId(): Promise<string | null> {
  const current = await getCurrentUser();
  return current?.userId ?? null;
}

// ── Aférição de Sinais Vitais ───────────────────────────────────────
export type AfericaoInput = {
  patient_id: string;
  systolic?: string;
  diastolic?: string;
  heart_rate?: string;
  resp_rate?: string;
  temperature?: string;
  spo2?: string;
  glucose?: string;
  notes?: string;
  /** Sinais vitais EXTRAS (lista flexível rótulo→valor), opcional. */
  extras?: Array<{ label: string; value: string }>;
};

/** "" / inválido → null; senão número (inteiro por padrão). */
function toNum(v: string | undefined, integer = true): number | null {
  if (!v || v.trim() === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return integer ? Math.trunc(n) : n;
}

/** Lista de pares → objeto { [rótulo]: valor }, descartando itens vazios. */
function buildExtra(
  items: ReadonlyArray<{ label: string; value: string }> | undefined,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const it of items ?? []) {
    const label = it.label.trim();
    const value = it.value.trim();
    if (label && value) out[label] = value;
  }
  return out;
}

export async function registrarAfericao(
  input: AfericaoInput,
): Promise<ActionState> {
  if (!input.patient_id) return { error: "Selecione o paciente." };

  const clinicId = await requireClinic();
  const supabase = await createClient();
  const { error } = await supabase.from("vital_signs").insert({
    clinic_id: clinicId,
    patient_id: input.patient_id,
    systolic: toNum(input.systolic),
    diastolic: toNum(input.diastolic),
    heart_rate: toNum(input.heart_rate),
    resp_rate: toNum(input.resp_rate),
    temperature: toNum(input.temperature, false),
    spo2: toNum(input.spo2),
    glucose: toNum(input.glucose),
    extra: buildExtra(input.extras),
    notes: input.notes?.trim() || null,
  });
  if (error) return { error: error.message };
  revalidate();
  return { ok: true };
}

// ── Anotação de Enfermagem ──────────────────────────────────────────
const anotacaoSchema = z.object({
  patient_id: z.string().min(1, "Selecione o paciente."),
  code: z.string().min(1),
  content: z.string().trim().min(1, "Escreva a anotação."),
});

export async function registrarAnotacao(
  input: z.input<typeof anotacaoSchema>,
): Promise<ActionState> {
  const parsed = anotacaoSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  const clinicId = await requireClinic();
  const supabase = await createClient();
  const ativo = await getAtendimentoAtivo(parsed.data.patient_id);
  const { error } = await supabase.from("nursing_notes").insert({
    clinic_id: clinicId,
    patient_id: parsed.data.patient_id,
    code: parsed.data.code,
    content: parsed.data.content,
    professional_name: await profissionalNome(),
    created_by: await operadorId(),
    queue_entry_id: ativo?.queueEntryId ?? null,
  });
  if (error) return { error: error.message };
  revalidate();
  return { ok: true };
}

// ── Checagem de Cuidados ────────────────────────────────────────────
const checagemSchema = z
  .object({
    id: z.string().min(1, "Cuidado inválido."),
    status: z.enum(["administrado", "aprazado"], {
      message: "Informe se foi administrado ou aprazado.",
    }),
    justification: z.string().trim().optional().or(z.literal("")),
  })
  .refine(
    (d) => d.status === "administrado" || (d.justification ?? "").length > 0,
    { message: "Justifique a não checagem (aprazamento).", path: ["justification"] },
  );

export async function checarCuidado(
  input: z.input<typeof checagemSchema>,
): Promise<ActionState> {
  const parsed = checagemSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  const supabase = await createClient();
  const { error } = await supabase
    .from("care_checks")
    .update({
      status: parsed.data.status,
      justification: parsed.data.justification || null,
      professional_name: await profissionalNome(),
      checked_at: new Date().toISOString(),
    })
    .eq("id", parsed.data.id);
  if (error) return { error: error.message };
  revalidate();
  return { ok: true };
}

const reaprazarSchema = z.object({
  id: z.string().min(1, "Cuidado inválido."),
  scheduled_at: z.string().min(1, "Informe o novo horário."),
});

export async function reaprazarCuidado(
  input: z.input<typeof reaprazarSchema>,
): Promise<ActionState> {
  const parsed = reaprazarSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  const supabase = await createClient();
  const { error } = await supabase
    .from("care_checks")
    .update({
      scheduled_at: new Date(parsed.data.scheduled_at).toISOString(),
      status: "aprazado",
    })
    .eq("id", parsed.data.id);
  if (error) return { error: error.message };
  revalidate();
  return { ok: true };
}

// ── Balanço Hídrico ─────────────────────────────────────────────────
const lancamentoSchema = z.object({
  balance_id: z.string().min(1, "Ciclo de balanço inválido."),
  kind: z.enum(["ganho", "perda"], { message: "Selecione ganho ou perda." }),
  description: z.string().trim().min(1, "Descreva o lançamento."),
  volume_ml: z.coerce.number().positive("Volume deve ser maior que zero."),
});

export async function registrarLancamentoHidrico(
  input: z.input<typeof lancamentoSchema>,
): Promise<ActionState> {
  const parsed = lancamentoSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  const clinicId = await requireClinic();
  const supabase = await createClient();
  const { error } = await supabase.from("fluid_balance_entries").insert({
    clinic_id: clinicId,
    balance_id: parsed.data.balance_id,
    kind: parsed.data.kind,
    description: parsed.data.description,
    volume_ml: parsed.data.volume_ml,
    professional_name: await profissionalNome(),
  });
  if (error) return { error: error.message };
  revalidate();
  return { ok: true };
}

export async function fecharBalancoHidrico(id: string): Promise<ActionState> {
  if (!id) return { error: "Ciclo inválido." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("fluid_balance")
    .update({ closed: true, cycle_end: new Date().toISOString() })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidate();
  return { ok: true };
}

// ── Evolução de Enfermagem ──────────────────────────────────────────
const evolucaoSchema = z.object({
  patient_id: z.string().min(1, "Selecione o paciente."),
  coren: z.string().trim().optional().or(z.literal("")),
  assessment: z.string().trim().min(1, "Preencha a avaliação."),
  reassessment: z.string().trim().optional().or(z.literal("")),
  conduct: z.string().trim().min(1, "Preencha a conduta."),
});

export async function registrarEvolucao(
  input: z.input<typeof evolucaoSchema>,
): Promise<ActionState> {
  const parsed = evolucaoSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  const d = parsed.data;
  const clinicId = await requireClinic();
  const supabase = await createClient();
  const ativo = await getAtendimentoAtivo(d.patient_id);
  const { error } = await supabase.from("nursing_evolutions").insert({
    clinic_id: clinicId,
    patient_id: d.patient_id,
    coren: d.coren || null,
    assessment: d.assessment,
    reassessment: d.reassessment || null,
    conduct: d.conduct,
    professional_name: await profissionalNome(),
    created_by: await operadorId(),
    queue_entry_id: ativo?.queueEntryId ?? null,
  });
  if (error) return { error: error.message };
  revalidate();
  return { ok: true };
}

// ── Escalas de Avaliação ────────────────────────────────────────────
const escalaSchema = z.object({
  patient_id: z.string().min(1, "Selecione o paciente."),
  scale: z.enum(["glasgow", "fugulin", "braden"]),
  score: z.coerce.number().int(),
  classification: z.string().trim().min(1),
});

export async function registrarEscala(
  input: z.input<typeof escalaSchema>,
): Promise<ActionState> {
  const parsed = escalaSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  const d = parsed.data;
  const clinicId = await requireClinic();
  const supabase = await createClient();
  const { error } = await supabase.from("assessment_scales").insert({
    clinic_id: clinicId,
    patient_id: d.patient_id,
    scale: d.scale,
    score: d.score,
    classification: d.classification,
    professional_name: await profissionalNome(),
  });
  if (error) return { error: error.message };
  revalidate();
  return { ok: true };
}

// ── Procedimentos de Enfermagem ─────────────────────────────────────
const procedimentoSchema = z.object({
  patient_id: z.string().min(1, "Selecione o paciente."),
  tuss_code: z.string().trim().optional().or(z.literal("")),
  name: z.string().trim().min(1, "Informe o procedimento."),
  materials: z.string().trim().optional().or(z.literal("")),
  body_site: z.string().trim().optional().or(z.literal("")),
  notes: z.string().trim().optional().or(z.literal("")),
});

export async function registrarProcedimento(
  input: z.input<typeof procedimentoSchema>,
): Promise<ActionState> {
  const parsed = procedimentoSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  const d = parsed.data;
  const clinicId = await requireClinic();
  const supabase = await createClient();
  const ativo = await getAtendimentoAtivo(d.patient_id);
  const { error } = await supabase.from("nursing_procedures").insert({
    clinic_id: clinicId,
    patient_id: d.patient_id,
    tuss_code: d.tuss_code || null,
    name: d.name,
    materials: d.materials || null,
    body_site: d.body_site || null,
    notes: d.notes || null,
    professional_name: await profissionalNome(),
    created_by: await operadorId(),
    queue_entry_id: ativo?.queueEntryId ?? null,
  });
  if (error) return { error: error.message };
  revalidate();
  return { ok: true };
}

// ── SAE (NANDA) — ao salvar gera horários na Checagem ───────────────
const saeSchema = z.object({
  patient_id: z.string().min(1, "Selecione o paciente."),
  coren: z.string().trim().optional().or(z.literal("")),
  nanda_diagnosis: z.string().trim().min(1, "Informe o diagnóstico NANDA."),
  related_factor: z.string().trim().optional().or(z.literal("")),
  prescription: z.string().trim().min(1, "Informe a prescrição de enfermagem."),
  frequency_hours: z.coerce.number().int().positive().max(24),
});

export async function registrarSae(
  input: z.input<typeof saeSchema>,
): Promise<ActionState> {
  const parsed = saeSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  const d = parsed.data;
  const clinicId = await requireClinic();
  const supabase = await createClient();

  const autorId = await operadorId();
  const ativo = await getAtendimentoAtivo(d.patient_id);
  const queueEntryId = ativo?.queueEntryId ?? null;

  const { data: sae, error } = await supabase
    .from("sae_records")
    .insert({
      clinic_id: clinicId,
      patient_id: d.patient_id,
      coren: d.coren || null,
      nanda_diagnosis: d.nanda_diagnosis,
      related_factor: d.related_factor || null,
      prescription: d.prescription,
      frequency_hours: d.frequency_hours,
      created_by: autorId,
      queue_entry_id: queueEntryId,
    })
    .select("id")
    .single();

  if (error || !sae) return { error: error?.message ?? "Falha ao salvar SAE." };

  // Gera os horários do ciclo de 24h na tela de Checagem.
  const base = Date.now();
  const checks = [];
  for (let h = 0; h < 24; h += d.frequency_hours) {
    checks.push({
      clinic_id: clinicId,
      sae_id: sae.id as string,
      patient_id: d.patient_id,
      description: d.prescription,
      scheduled_at: new Date(base + h * 3600 * 1000).toISOString(),
      status: "pendente" as const,
      created_by: autorId,
      queue_entry_id: queueEntryId,
    });
  }
  if (checks.length > 0) {
    await supabase.from("care_checks").insert(checks);
  }

  revalidate();
  return { ok: true };
}

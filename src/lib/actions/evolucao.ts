"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { requireAction } from "@/lib/permissions";
import { getMyProfessionalId } from "@/lib/clinico/professional";
import { requireClinic } from "@/lib/tenant";
import { getAtendimentoAtivo } from "@/lib/data/atendimento";

export type ActionState = { error?: string; ok?: boolean } | undefined;

const evolucaoSchema = z.object({
  patientId: z.string().min(1, "Paciente inválido."),
  dataHora: z.string().min(1, "Informe a data e hora."),
  queixa: z.string().trim().min(1, "Queixa Principal é obrigatória."),
  hda: z.string().trim().min(1, "HDA é obrigatória."),
  exame: z.string().trim().min(1, "Exame Físico é obrigatório."),
  hipotese: z.string().trim().min(1, "Hipótese Diagnóstica é obrigatória."),
  conduta: z.string().trim().min(1, "Conduta / Plano é obrigatória."),
  // Sinais vitais (opcionais, numéricos).
  paSistolica: z.string().trim().optional(),
  paDiastolica: z.string().trim().optional(),
  fc: z.string().trim().optional(),
  temp: z.string().trim().optional(),
  spo2: z.string().trim().optional(),
  // Sinais vitais EXTRAS (lista flexível rótulo→valor), opcional.
  extras: z
    .array(z.object({ label: z.string(), value: z.string() }))
    .optional(),
});

export type EvolucaoInput = z.infer<typeof evolucaoSchema>;

function toInt(v: string | undefined): number | null {
  if (!v) return null;
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) ? Math.round(n) : null;
}

function toNum(v: string | undefined): number | null {
  if (!v) return null;
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) ? n : null;
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

/**
 * Registra uma evolução clínica: grava sinais vitais (vital_signs) e o texto
 * estruturado (medical_records, com created_at retroativo permitido).
 */
export async function registrarEvolucao(input: EvolucaoInput): Promise<ActionState> {
  const parsed = evolucaoSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };


  const current = await getCurrentUser();
  if (!current) return { error: "Sessão expirada." };

  // Defesa em profundidade: permissão de escrita no módulo Prontuário.
  const denied = await requireAction("prontuario", "create");
  if (denied) return { error: denied };

  const clinicId = await requireClinic();
  const supabase = await createClient();
  const professionalId = await getMyProfessionalId(current.userId);
  if (!professionalId)
    return { error: "Profissional não encontrado para o usuário atual." };

  const d = parsed.data;
  const recordedAt = new Date(d.dataHora);
  if (Number.isNaN(recordedAt.getTime()))
    return { error: "Data e hora inválidas." };

  const conteudo = [
    `Queixa Principal: ${d.queixa}`,
    `História da Doença Atual (HDA): ${d.hda}`,
    `Exame Físico: ${d.exame}`,
    `Hipótese Diagnóstica: ${d.hipotese}`,
    `Conduta / Plano: ${d.conduta}`,
  ].join("\n\n");

  // 1) Sinais vitais (só se houver algum valor).
  const sistolica = toInt(d.paSistolica);
  const diastolica = toInt(d.paDiastolica);
  const fc = toInt(d.fc);
  const temp = toNum(d.temp);
  const spo2 = toInt(d.spo2);
  // Sinais extras → objeto { [rótulo]: valor }, ignorando itens vazios.
  const extra = buildExtra(d.extras);
  const temExtras = Object.keys(extra).length > 0;
  const temVitais =
    sistolica != null ||
    diastolica != null ||
    fc != null ||
    temp != null ||
    spo2 != null;

  if (temVitais || temExtras) {
    const { error: vErr } = await supabase.from("vital_signs").insert({
      clinic_id: clinicId,
      patient_id: d.patientId,
      recorded_at: recordedAt.toISOString(),
      systolic: sistolica,
      diastolic: diastolica,
      heart_rate: fc,
      temperature: temp,
      spo2,
      extra,
      recorded_by: current.userId,
    });
    if (vErr) return { error: vErr.message };
  }

  // 2) Evolução (texto).
  // Vincula o registro ao atendimento corrente do paciente (histórico por atendimento).
  const ativo = await getAtendimentoAtivo(d.patientId);
  const { error } = await supabase.from("medical_records").insert({
    clinic_id: clinicId,
    patient_id: d.patientId,
    professional_id: professionalId,
    created_by: current.userId,
    queue_entry_id: ativo?.queueEntryId ?? null,
    content: conteudo,
    created_at: recordedAt.toISOString(),
  });
  if (error) return { error: error.message };

  revalidatePath(`/prontuario/${d.patientId}/evolucao`);
  revalidatePath(`/prontuario/${d.patientId}`);
  return { ok: true };
}

const editarEvolucaoSchema = z.object({
  id: z.string().uuid("Evolução inválida."),
  patientId: z.string().min(1, "Paciente inválido."),
  queixa: z.string().trim().min(1, "Queixa Principal é obrigatória."),
  hda: z.string().trim().min(1, "HDA é obrigatória."),
  exame: z.string().trim().min(1, "Exame Físico é obrigatório."),
  hipotese: z.string().trim().min(1, "Hipótese Diagnóstica é obrigatória."),
  conduta: z.string().trim().min(1, "Conduta / Plano é obrigatória."),
});

export type EditarEvolucaoInput = z.infer<typeof editarEvolucaoSchema>;

/**
 * Edita o texto de uma evolução (medical_records.content). Não mexe em sinais
 * vitais. Bloqueia documentos cancelados (padrão 0111), filtra por clínica.
 * Gate: permissão de edição no módulo Prontuário.
 */
export async function editarEvolucao(
  input: EditarEvolucaoInput,
): Promise<ActionState> {
  const parsed = editarEvolucaoSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  const current = await getCurrentUser();
  if (!current) return { error: "Sessão expirada." };

  const denied = await requireAction("prontuario", "edit");
  if (denied) return { error: denied };

  const clinicId = await requireClinic();
  const supabase = await createClient();
  const d = parsed.data;

  const conteudo = [
    `Queixa Principal: ${d.queixa}`,
    `História da Doença Atual (HDA): ${d.hda}`,
    `Exame Físico: ${d.exame}`,
    `Hipótese Diagnóstica: ${d.hipotese}`,
    `Conduta / Plano: ${d.conduta}`,
  ].join("\n\n");

  const { data: updated, error } = await supabase
    .from("medical_records")
    .update({ content: conteudo })
    .eq("id", d.id)
    .eq("patient_id", d.patientId)
    .eq("clinic_id", clinicId)
    .is("cancelled_at", null)
    .select("id");
  if (error) return { error: error.message };
  if (!updated || updated.length === 0) {
    return { error: "Evolução não encontrada ou cancelada." };
  }

  revalidatePath(`/prontuario/${d.patientId}/evolucao`);
  revalidatePath(`/prontuario/${d.patientId}`);
  return { ok: true };
}

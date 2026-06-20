"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/supabase/config";
import { getCurrentUser, getRole } from "@/lib/auth";
import { requireClinic } from "@/lib/tenant";
import { getAttendanceFlow } from "@/lib/data/attendance-flow";
import { statusAfterStage } from "@/lib/data/attendance-flow.shared";

export type ActionState = { error?: string; ok?: boolean } | undefined;

function revalidateFila() {
  revalidatePath("/fila");
  revalidatePath("/dashboard");
}

/** Gate de staff (admin/medico/recepcao). RLS é a 2ª camada; aqui é explícito. */
async function ensureStaff(): Promise<{ error: string } | { userId: string }> {
  const current = await getCurrentUser();
  if (!current) return { error: "Sessão expirada." };
  const role = await getRole();
  if (role !== "admin" && role !== "medico" && role !== "recepcao") {
    return { error: "Acesso restrito à equipe da clínica." };
  }
  return { userId: current.userId };
}

/** "" / inválido → null; senão número (decimal por padrão). */
function toNum(v: unknown, integer = false): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return integer ? Math.trunc(n) : n;
}

const numLike = z.union([z.string(), z.number()]).nullish();

const triagemSchema = z.object({
  // IDs vêm do FilaItem; string solta (não uuid) p/ não quebrar o modo demo.
  queueEntryId: z.string().trim().min(1, "Entrada da fila inválida."),
  patientId: z.string().trim().min(1).nullish(),
  systolic: numLike,
  diastolic: numLike,
  heart_rate: numLike,
  resp_rate: numLike,
  temperature: numLike,
  weight: numLike,
  height: numLike,
  spo2: numLike,
  glucose: numLike,
  riskLevel: z.enum(["azul", "verde", "amarelo", "laranja", "vermelho"]),
  notes: z.string().trim().max(2000).nullish(),
});

export type SalvarTriagemInput = z.input<typeof triagemSchema>;

/**
 * Registra a TRIAGEM de uma entrada da fila em `triage_records` (multitenant +
 * RLS staff) e AVANÇA o status da fila conforme o fluxo configurado.
 *
 * Fluxo: concluir a etapa 'triagem' move a entrada para o próximo status do
 * pipeline (padrão → 'chamado'). `recorded_by` = usuário logado. Sinais vitais
 * são inteiros (bpm/mmHg) exceto temperatura/peso/altura/glicemia (decimais).
 * Em modo demo, valida e retorna ok sem tocar no banco.
 */
export async function salvarTriagem(
  input: SalvarTriagemInput,
): Promise<ActionState> {
  const parsed = triagemSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const d = parsed.data;

  if (isDemoMode()) return { ok: true };

  const gate = await ensureStaff();
  if ("error" in gate) return gate;

  const clinicId = await requireClinic();
  const supabase = await createClient();

  const { error: insErr } = await supabase.from("triage_records").insert({
    clinic_id: clinicId,
    queue_entry_id: d.queueEntryId,
    patient_id: d.patientId ?? null,
    systolic: toNum(d.systolic, true),
    diastolic: toNum(d.diastolic, true),
    heart_rate: toNum(d.heart_rate, true),
    resp_rate: toNum(d.resp_rate, true),
    temperature: toNum(d.temperature),
    weight: toNum(d.weight),
    height: toNum(d.height),
    spo2: toNum(d.spo2, true),
    glucose: toNum(d.glucose, true),
    risk_level: d.riskLevel,
    notes: d.notes?.trim() ? d.notes.trim() : null,
    recorded_by: gate.userId,
  });

  if (insErr) return { error: "Não foi possível salvar a triagem." };

  // Avança a fila: concluir a triagem → próximo status do fluxo (padrão chamado).
  const stages = await getAttendanceFlow();
  const next = statusAfterStage("triagem", stages);
  const { error: updErr } = await supabase
    .from("queue_entries")
    .update({ status: next })
    .eq("id", d.queueEntryId);

  // Marco temporal (BI espera) — best-effort, não bloqueia se a coluna faltar.
  if (next === "chamado") {
    try {
      await supabase
        .from("queue_entries")
        .update({ called_at: new Date().toISOString() })
        .eq("id", d.queueEntryId);
    } catch {
      /* coluna ausente pré-0029: marco é só p/ BI. */
    }
  }

  if (updErr) return { error: updErr.message };

  revalidateFila();
  return { ok: true };
}

const idSchema = z.string().trim().min(1, "Entrada da fila inválida.");

/**
 * Move a entrada para o status 'triagem' (paciente "em triagem"). Usado quando a
 * recepção/enfermagem inicia a triagem antes de gravar os sinais. Gate staff +
 * clínica ativa. Em modo demo, ok sem tocar no banco.
 */
export async function iniciarTriagem(id: string): Promise<ActionState> {
  const parsed = idSchema.safeParse(id);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  if (isDemoMode()) return { ok: true };

  const gate = await ensureStaff();
  if ("error" in gate) return gate;

  await requireClinic();
  const supabase = await createClient();
  const { error } = await supabase
    .from("queue_entries")
    .update({ status: "triagem" })
    .eq("id", parsed.data);

  if (error) return { error: error.message };

  revalidateFila();
  return { ok: true };
}

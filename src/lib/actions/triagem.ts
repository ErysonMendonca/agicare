"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
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

/** Resposta denormalizada de um campo configurável da triagem. */
const dataItemSchema = z.object({
  id: z.string().trim().min(1),
  label: z.string().trim().min(1),
  value: z.string().max(2000),
});

const triagemSchema = z.object({
  // IDs vêm do FilaItem; string solta (não uuid) p/ não quebrar o modo demo.
  queueEntryId: z.string().trim().min(1, "Entrada da fila inválida."),
  patientId: z.string().trim().min(1).nullish(),
  // Respostas configuráveis (array { id, label, value }) — fonte da verdade.
  data: z.array(dataItemSchema).default([]),
  riskLevel: z
    .enum(["azul", "verde", "amarelo", "laranja", "vermelho"])
    .nullish(),
});

export type SalvarTriagemInput = z.input<typeof triagemSchema>;

/** Colunas estruturadas legadas mantidas para BI/queries (preenchidas se houver). */
const VITAL_INT_IDS = [
  "systolic",
  "diastolic",
  "heart_rate",
  "resp_rate",
  "spo2",
  "glucose",
] as const;
const VITAL_DEC_IDS = ["temperature", "weight", "height"] as const;

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


  const gate = await ensureStaff();
  if ("error" in gate) return gate;

  const clinicId = await requireClinic();
  const supabase = await createClient();

  // Mapa id → value das respostas configuráveis (para colunas legadas + notes).
  const byId = new Map(d.data.map((it) => [it.id, it.value]));
  const notesVal = byId.get("notes")?.trim();

  // Preenche as colunas estruturadas legadas quando os ids existem no template.
  const vitais: Record<string, number | null> = {};
  for (const id of VITAL_INT_IDS) vitais[id] = toNum(byId.get(id), true);
  for (const id of VITAL_DEC_IDS) vitais[id] = toNum(byId.get(id));

  const { error: insErr } = await supabase.from("triage_records").insert({
    clinic_id: clinicId,
    queue_entry_id: d.queueEntryId,
    patient_id: d.patientId ?? null,
    ...vitais,
    data: d.data,
    risk_level: d.riskLevel ?? null,
    notes: notesVal ? notesVal : null,
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

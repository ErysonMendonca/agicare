"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, getRole } from "@/lib/auth";
import { requireAction } from "@/lib/permissions";
import { getMyProfessionalId } from "@/lib/clinico/professional";
import { requireClinic } from "@/lib/tenant";
import { getAtendimentoAtivo } from "@/lib/data/atendimento";
import { logAction } from "@/lib/system-log";

export type ActionState = { error?: string; ok?: boolean } | undefined;

/** Autorização: emitir documentos clínicos é ato do médico (admin como gestor). */
async function guardMedico(): Promise<string | null> {
  const role = await getRole();
  if (role !== "medico" && role !== "admin") {
    return "Apenas o médico pode emitir documentos clínicos.";
  }
  return null;
}

const atestadoSchema = z.object({
  patientId: z.string().min(1, "Paciente inválido."),
  dias: z.coerce.number().int().min(1, "Informe os dias de afastamento."),
  dataAtestado: z.string().trim().min(1, "Informe a data do atestado."),
  diagnostico: z.string().trim().min(1, "Informe o diagnóstico."),
  // CID-10 OPCIONAL por LGPD.
  cid10: z.string().trim().optional(),
  observacao: z.string().trim().optional(),
  exibirCid: z.boolean(),
});

export type AtestadoInput = z.infer<typeof atestadoSchema>;

/** Soma `days` dias a uma data YYYY-MM-DD e devolve YYYY-MM-DD. */
function addDays(dateStr: string, days: number): string {
  // Constrói em UTC para evitar deslocamento de fuso.
  const [y, m, d] = dateStr.split("-").map(Number);
  const base = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
  // Atestado inclusivo: 1 dia começa e termina no mesmo dia → soma (days - 1).
  base.setUTCDate(base.getUTCDate() + Math.max(0, days - 1));
  return base.toISOString().slice(0, 10);
}

/** Emite um atestado médico (CID-10 opcional por LGPD). */
export async function emitirAtestado(input: AtestadoInput): Promise<ActionState> {
  const parsed = atestadoSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };


  const negado = await guardMedico();
  if (negado) return { error: negado };
  // Defesa em profundidade: papel clínico + permissão de módulo na matriz.
  const denied = await requireAction("prontuario", "create");
  if (denied) return { error: denied };

  const current = await getCurrentUser();
  if (!current) return { error: "Sessão expirada." };

  const supabase = await createClient();
  const professionalId = await getMyProfessionalId(current.userId);
  if (!professionalId)
    return { error: "Profissional não encontrado para o usuário atual." };

  const clinicId = await requireClinic();
  const d = parsed.data;
  const endDate = addDays(d.dataAtestado, d.dias);
  // Normaliza o CID (o autocomplete é livre): sem espaços e sempre maiúsculo.
  const cid10 = d.cid10 ? d.cid10.trim().toUpperCase() : null;
  // Vincula o documento ao atendimento corrente do paciente (histórico por atendimento).
  const ativo = await getAtendimentoAtivo(d.patientId);
  const { error } = await supabase.from("certificates").insert({
    clinic_id: clinicId,
    patient_id: d.patientId,
    professional_id: professionalId,
    queue_entry_id: ativo?.queueEntryId ?? null,
    kind: "atestado",
    days: d.dias,
    issue_date: d.dataAtestado,
    start_date: d.dataAtestado,
    end_date: endDate,
    diagnosis: d.diagnostico,
    cid10,
    observation: d.observacao || null,
    show_cid: d.exibirCid,
  });
  if (error) {
    console.error("emitirAtestado insert falhou:", error);
    return { error: "Não foi possível emitir o atestado." };
  }

  await logAction({
    action: "create",
    module: "documentos",
    summary: "Emitiu um atestado médico",
    entity: "certificate",
    entityId: d.patientId,
  });
  revalidatePath(`/prontuario/${d.patientId}/documentos`);
  return { ok: true };
}

const altaSchema = z.object({
  patientId: z.string().min(1, "Paciente inválido."),
  dataAlta: z.string().trim().min(1, "Informe a data e hora da alta."),
  cid10: z.string().trim().optional(),
  motivo: z.string().trim().min(1, "Selecione o motivo."),
  detalhe: z.string().trim().optional(),
  observacao: z.string().trim().optional(),
  exibirCid: z.boolean(),
});

export type AltaInput = z.infer<typeof altaSchema>;

/** Registra uma alta (data/hora, motivo, detalhe, CID opcional e observação). */
export async function darAlta(input: AltaInput): Promise<ActionState> {
  const parsed = altaSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };


  const negado = await guardMedico();
  if (negado) return { error: negado };
  // Alta encerra o atendimento em curso → edição do registro clínico.
  const denied = await requireAction("prontuario", "edit");
  if (denied) return { error: denied };

  const current = await getCurrentUser();
  if (!current) return { error: "Sessão expirada." };

  const supabase = await createClient();
  const professionalId = await getMyProfessionalId(current.userId);
  if (!professionalId)
    return { error: "Profissional não encontrado para o usuário atual." };

  const clinicId = await requireClinic();
  const d = parsed.data;
  // Normaliza o CID (autocomplete livre): sem espaços e sempre maiúsculo.
  const cid10 = d.cid10 ? d.cid10.trim().toUpperCase() : null;
  // Vincula o documento ao atendimento corrente do paciente (histórico por atendimento).
  const ativo = await getAtendimentoAtivo(d.patientId);
  const { error } = await supabase.from("certificates").insert({
    clinic_id: clinicId,
    patient_id: d.patientId,
    professional_id: professionalId,
    queue_entry_id: ativo?.queueEntryId ?? null,
    kind: "alta",
    reason: d.motivo,
    discharge_detail: d.detalhe || null,
    cid10,
    observation: d.observacao || null,
    discharge_at: d.dataAlta,
    show_cid: d.exibirCid,
  });
  if (error) {
    console.error("darAlta insert falhou:", error);
    return { error: "Não foi possível registrar a alta." };
  }

  await logAction({
    action: "create",
    module: "documentos",
    summary: "Registrou uma alta",
    entity: "certificate",
    entityId: d.patientId,
  });
  revalidatePath(`/prontuario/${d.patientId}/documentos`);
  return { ok: true };
}

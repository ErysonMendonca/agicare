"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, requireClinico } from "@/lib/auth";
import { requireAction } from "@/lib/permissions";
import { getMyProfessionalId } from "@/lib/clinico/professional";
import { requireClinic } from "@/lib/tenant";
import { getAtendimentoAtivo } from "@/lib/data/atendimento";
import { FREQUENCIAS } from "@/lib/data/prescricao";
import { logAction } from "@/lib/system-log";

export type ActionState = { error?: string; ok?: boolean } | undefined;

const medicamentoSchema = z.object({
  productId: z.string().optional(),
  nome: z.string().trim().min(1, "Informe o medicamento."),
  concentracao: z.string().trim().optional(),
  posologia: z.string().trim().min(1, "Informe a posologia."),
  via: z.string().trim().optional(),
  duracao: z.string().trim().min(1, "Informe a duração."),
  frequencia: z.string().trim().optional(),
  observacoes: z.string().trim().optional(),
});

const cuidadoSchema = z.object({
  nome: z.string().trim().min(1, "Informe o cuidado."),
  frequencia: z.string().trim().min(1, "Informe a frequência."),
  duracao: z.string().trim().min(1, "Informe a duração."),
  observacoes: z.string().trim().optional(),
});

const prescricaoSchema = z
  .object({
    patientId: z.string().min(1, "Paciente inválido."),
    observacoes: z.string().trim().optional(),
    medicamentos: z.array(medicamentoSchema).default([]),
    cuidados: z.array(cuidadoSchema).default([]),
  })
  .refine((v) => v.medicamentos.length > 0 || v.cuidados.length > 0, {
    message: "Adicione ao menos um medicamento ou cuidado.",
  });

export type PrescricaoInput = z.infer<typeof prescricaoSchema>;

/** Quantidade máxima de aprazamentos gerados por item (protótipo). */
const MAX_CHECKS = 8;

function intervaloHoras(freq: string | undefined): number {
  return FREQUENCIAS.find((f) => f.label === freq)?.intervaloHoras ?? 0;
}

/** Gera os horários de checagem a partir da frequência (a partir de agora). */
function gerarHorarios(freq: string | undefined): Date[] {
  const intervalo = intervaloHoras(freq);
  const agora = new Date();
  if (intervalo <= 0) return [agora]; // dose única / sem intervalo
  const horarios: Date[] = [];
  for (let i = 0; i < MAX_CHECKS; i++) {
    horarios.push(new Date(agora.getTime() + i * intervalo * 3600 * 1000));
  }
  return horarios;
}

type CheckRow = {
  clinic_id: string;
  patient_id: string;
  prescription_id: string;
  source_type: string;
  source_label: string;
  frequency: string;
  scheduled_at: string;
};

/**
 * Monta os aprazamentos PENDENTES (medicamentos + cuidados com frequência).
 * Reutilizado por criarPrescricao e updatePrescricao. O clinic_id (clínica ativa)
 * é carimbado em cada linha filha — sempre o mesmo da prescrição-mãe.
 */
function montarChecks(
  clinicId: string,
  patientId: string,
  prescriptionId: string,
  medicamentos: PrescricaoInput["medicamentos"],
  cuidados: PrescricaoInput["cuidados"],
): CheckRow[] {
  const checks: CheckRow[] = [];

  for (const m of medicamentos) {
    if (!m.frequencia) continue;
    const rotulo = m.concentracao ? `${m.nome} ${m.concentracao}` : m.nome;
    for (const h of gerarHorarios(m.frequencia)) {
      checks.push({
        clinic_id: clinicId,
        patient_id: patientId,
        prescription_id: prescriptionId,
        source_type: "medicamento",
        source_label: rotulo,
        frequency: m.frequencia,
        scheduled_at: h.toISOString(),
      });
    }
  }
  for (const c of cuidados) {
    for (const h of gerarHorarios(c.frequencia)) {
      checks.push({
        clinic_id: clinicId,
        patient_id: patientId,
        prescription_id: prescriptionId,
        source_type: "cuidado",
        source_label: c.nome,
        frequency: c.frequencia,
        scheduled_at: h.toISOString(),
      });
    }
  }
  return checks;
}

/**
 * Cria uma prescrição (medicamentos + cuidados) e gera os aprazamentos de
 * Checagem para os itens que tiverem frequência definida.
 */
export async function criarPrescricao(input: PrescricaoInput): Promise<ActionState> {
  const parsed = prescricaoSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };


  const guard = await requireClinico();
  if ("error" in guard) return { error: guard.error };
  // Defesa em profundidade: papel clínico + permissão de módulo na matriz.
  const denied = await requireAction("prontuario", "create");
  if (denied) return { error: denied };

  const current = await getCurrentUser();
  if (!current) return { error: "Sessão expirada." };

  const clinicId = await requireClinic();
  const supabase = await createClient();
  const professionalId = await getMyProfessionalId(current.userId);
  if (!professionalId)
    return { error: "Profissional não encontrado para o usuário atual." };

  const d = parsed.data;

  // 1) Prescrição.
  // Vincula a prescrição ao atendimento corrente do paciente (histórico por atendimento).
  const ativo = await getAtendimentoAtivo(d.patientId);
  const { data: presc, error: pErr } = await supabase
    .from("prescriptions")
    .insert({
      clinic_id: clinicId,
      patient_id: d.patientId,
      professional_id: professionalId,
      created_by: current.userId,
      queue_entry_id: ativo?.queueEntryId ?? null,
      notes: d.observacoes || null,
    })
    .select("id")
    .single();
  if (pErr || !presc) return { error: pErr?.message ?? "Falha ao prescrever." };

  const prescriptionId = presc.id as string;

  // 2) Medicamentos.
  if (d.medicamentos.length > 0) {
    const { error } = await supabase.from("prescription_items").insert(
      d.medicamentos.map((m) => ({
        clinic_id: clinicId,
        prescription_id: prescriptionId,
        product_id: m.productId || null,
        name: m.nome,
        concentration: m.concentracao || null,
        posology: m.posologia,
        route: m.via || null,
        duration: m.duracao,
        frequency: m.frequencia || null,
        observations: m.observacoes || null,
      })),
    );
    if (error) return { error: error.message };
  }

  // 3) Cuidados.
  if (d.cuidados.length > 0) {
    const { error } = await supabase.from("care_orders").insert(
      d.cuidados.map((c) => ({
        clinic_id: clinicId,
        prescription_id: prescriptionId,
        patient_id: d.patientId,
        name: c.nome,
        frequency: c.frequencia,
        duration: c.duracao,
        observations: c.observacoes || null,
      })),
    );
    if (error) return { error: error.message };
  }

  // 4) Aprazamentos de checagem (medicamentos + cuidados com frequência).
  const checks = montarChecks(
    clinicId,
    d.patientId,
    prescriptionId,
    d.medicamentos,
    d.cuidados,
  );
  if (checks.length > 0) {
    const { error } = await supabase.from("prescription_checks").insert(checks);
    if (error) return { error: error.message };
  }

  revalidatePath(`/prontuario/${d.patientId}/prescricao`);
  revalidatePath(`/prontuario/${d.patientId}/checagem`);
  return { ok: true };
}

/**
 * Edita uma prescrição existente.
 *
 * Estratégia (a mais simples e segura para o protótipo):
 *  - Atualiza os campos da própria prescrição (observações).
 *  - Regenera os itens: apaga TODOS os prescription_items e care_orders da
 *    prescrição e reinsere a partir do formulário (não há checagem por item,
 *    então recriar é seguro).
 *  - Regenera SÓ os aprazamentos PENDENTES: apaga os checks com status
 *    'pendente' e recria a partir dos itens atuais. Os checks já administrados
 *    (status 'checado') são PRESERVADOS — são registro clínico/LGPD do que foi
 *    de fato aplicado e não podem ser perdidos numa edição.
 */
export async function updatePrescricao(
  id: string,
  input: PrescricaoInput,
): Promise<ActionState> {
  if (!id) return { error: "Prescrição inválida." };

  const parsed = prescricaoSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };


  const guard = await requireClinico();
  if ("error" in guard) return { error: guard.error };
  const denied = await requireAction("prontuario", "edit");
  if (denied) return { error: denied };

  const clinicId = await requireClinic();
  const supabase = await createClient();
  const d = parsed.data;

  // Confere se a prescrição existe e pertence ao paciente informado (o RLS já
  // restringe a admin/médico; aqui evitamos editar de outro paciente).
  const { data: presc, error: findErr } = await supabase
    .from("prescriptions")
    .select("id, patient_id")
    .eq("id", id)
    .maybeSingle();
  if (findErr) return { error: findErr.message };
  if (!presc || presc.patient_id !== d.patientId) {
    return { error: "Prescrição não encontrada." };
  }

  // 1) Atualiza a prescrição.
  const { error: upErr } = await supabase
    .from("prescriptions")
    .update({ notes: d.observacoes || null })
    .eq("id", id);
  if (upErr) return { error: upErr.message };

  // 2) Regenera medicamentos.
  const { error: delItensErr } = await supabase
    .from("prescription_items")
    .delete()
    .eq("prescription_id", id);
  if (delItensErr) return { error: delItensErr.message };

  if (d.medicamentos.length > 0) {
    const { error } = await supabase.from("prescription_items").insert(
      d.medicamentos.map((m) => ({
        clinic_id: clinicId,
        prescription_id: id,
        product_id: m.productId || null,
        name: m.nome,
        concentration: m.concentracao || null,
        posology: m.posologia,
        route: m.via || null,
        duration: m.duracao,
        frequency: m.frequencia || null,
        observations: m.observacoes || null,
      })),
    );
    if (error) return { error: error.message };
  }

  // 3) Regenera cuidados.
  const { error: delCuidadosErr } = await supabase
    .from("care_orders")
    .delete()
    .eq("prescription_id", id);
  if (delCuidadosErr) return { error: delCuidadosErr.message };

  if (d.cuidados.length > 0) {
    const { error } = await supabase.from("care_orders").insert(
      d.cuidados.map((c) => ({
        clinic_id: clinicId,
        prescription_id: id,
        patient_id: d.patientId,
        name: c.nome,
        frequency: c.frequencia,
        duration: c.duracao,
        observations: c.observacoes || null,
      })),
    );
    if (error) return { error: error.message };
  }

  // 4) Regenera SÓ os aprazamentos pendentes (preserva os já checados).
  const { error: delChecksErr } = await supabase
    .from("prescription_checks")
    .delete()
    .eq("prescription_id", id)
    .eq("status", "pendente");
  if (delChecksErr) return { error: delChecksErr.message };

  const checks = montarChecks(clinicId, d.patientId, id, d.medicamentos, d.cuidados);
  if (checks.length > 0) {
    const { error } = await supabase.from("prescription_checks").insert(checks);
    if (error) return { error: error.message };
  }

  revalidatePath(`/prontuario/${d.patientId}/prescricao`);
  revalidatePath(`/prontuario/${d.patientId}/checagem`);
  return { ok: true };
}

const excluirSchema = z.object({
  id: z.string().min(1, "Prescrição inválida."),
  patientId: z.string().min(1, "Paciente inválido."),
  motivo: z
    .string()
    .trim()
    .min(3, "Informe o motivo do cancelamento.")
    .max(500, "Motivo muito longo (máx. 500 caracteres)."),
});

/**
 * Cancela uma prescrição (NÃO apaga — padrão 0111).
 *
 * Antes fazia DELETE físico (cascade em itens/cuidados/checks); agora grava
 * o carimbo de cancelamento em `prescriptions` e a prescrição — bem como seus
 * itens, cuidados e aprazamentos — permanece no banco, visível e read-only.
 * Como o cancelamento é não-destrutivo, os aprazamentos já administrados
 * (status 'checado') não correm risco; mas mantemos o BLOQUEIO histórico por
 * segurança/clareza clínica: uma prescrição com itens já aplicados não deve
 * ser cancelada. O nome é mantido por compatibilidade; passou a exigir `motivo`.
 */
export async function deletePrescricao(
  id: string,
  patientId: string,
  motivo: string,
): Promise<ActionState> {
  const parsed = excluirSchema.safeParse({ id, patientId, motivo });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };


  const guard = await requireClinico();
  if ("error" in guard) return { error: guard.error };
  const denied = await requireAction("prontuario", "delete");
  if (denied) return { error: denied };

  const current = await getCurrentUser();
  if (!current) return { error: "Sessão expirada." };

  const clinicId = await requireClinic();
  const supabase = await createClient();

  // Existe algum aprazamento já administrado? Se sim, bloqueia (mesma regra
  // do antigo delete: prescrição já aplicada no paciente não deve ser cancelada).
  const { count, error: cntErr } = await supabase
    .from("prescription_checks")
    .select("id", { count: "exact", head: true })
    .eq("prescription_id", parsed.data.id)
    .eq("status", "checado");
  if (cntErr) return { error: cntErr.message };
  if ((count ?? 0) > 0) {
    return {
      error:
        "Não é possível cancelar: há itens já administrados (checados) nesta prescrição.",
    };
  }

  // Cancelamento não-destrutivo (idempotente: só cancela se ainda ativa).
  const { data: cancelled, error } = await supabase
    .from("prescriptions")
    .update({
      cancelled_at: new Date().toISOString(),
      cancelled_by: current.userId,
      cancel_reason: parsed.data.motivo,
    })
    .eq("id", parsed.data.id)
    .eq("patient_id", parsed.data.patientId)
    .eq("clinic_id", clinicId)
    .is("cancelled_at", null)
    .select("id");
  if (error) {
    console.error("deletePrescricao cancelamento falhou:", error.message);
    return { error: "Não foi possível cancelar a prescrição." };
  }
  if (!cancelled || cancelled.length === 0) {
    return { error: "Prescrição não encontrada ou já cancelada." };
  }

  await logAction({
    action: "delete",
    module: "prontuario",
    summary: "Cancelou uma prescrição",
    entity: "prescriptions",
    entityId: parsed.data.id,
  });

  revalidatePath(`/prontuario/${parsed.data.patientId}/prescricao`);
  revalidatePath(`/prontuario/${parsed.data.patientId}/checagem`);
  return { ok: true };
}

const checarSchema = z.object({
  id: z.string().min(1, "Checagem inválida."),
  patientId: z.string().min(1, "Paciente inválido."),
});

/** Marca um aprazamento como checado (registra quem e quando). */
export async function checarItem(
  id: string,
  patientId: string,
): Promise<ActionState> {
  const parsed = checarSchema.safeParse({ id, patientId });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };


  const guard = await requireClinico();
  if ("error" in guard) return { error: guard.error };
  // Checar item da prescrição = alterar o registro clínico existente.
  const denied = await requireAction("prontuario", "edit");
  if (denied) return { error: denied };

  const current = await getCurrentUser();
  if (!current) return { error: "Sessão expirada." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("prescription_checks")
    .update({
      status: "checado",
      checked_at: new Date().toISOString(),
      checked_by: current.userId,
    })
    .eq("id", parsed.data.id);
  if (error) return { error: error.message };

  revalidatePath(`/prontuario/${parsed.data.patientId}/checagem`);
  return { ok: true };
}

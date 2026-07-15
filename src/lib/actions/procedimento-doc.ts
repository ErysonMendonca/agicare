"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireClinico } from "@/lib/auth";
import { requireAction } from "@/lib/permissions";
import { requireClinic } from "@/lib/tenant";
import { getMyProfessionalId } from "@/lib/clinico/professional";
import { getAtendimentoAtivo } from "@/lib/data/atendimento";
import {
  getProcedimentoDocPorId,
  type ProcedimentoDocDetalhe,
} from "@/lib/data/procedimento-doc";
import { logAction } from "@/lib/system-log";

export type ActionState =
  | { error?: string; ok?: boolean; documentId?: string }
  | undefined;

/** Relacionamento aninhado do Supabase (objeto ou array) → primeiro elemento. */
function one<T>(v: unknown): T | null {
  return (Array.isArray(v) ? v[0] : v) as T | null;
}

/**
 * Cria um DOCUMENTO com os procedimentos já registrados no atendimento em curso
 * (procedure_executions), fotografando NOME e PREÇO de cada um. Cada chamada
 * cria um documento NOVO (é possível salvar vários no mesmo atendimento).
 *
 * Autorização em profundidade: papel clínico (`requireClinico`) + permissão do
 * módulo Prontuário (`requireAction`). A RLS da 0114 é a terceira camada.
 */
export async function salvarDocumentoProcedimentos(input: {
  patientId: string;
}): Promise<ActionState> {
  const parsed = z
    .object({ patientId: z.string().uuid("Paciente inválido.") })
    .safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const { patientId } = parsed.data;

  const clinico = await requireClinico();
  if ("error" in clinico) return { error: clinico.error };

  const denied = await requireAction("prontuario", "create");
  if (denied) return { error: denied };

  const clinicId = await requireClinic();
  const supabase = await createClient();

  const professionalId = await getMyProfessionalId(clinico.userId);
  if (!professionalId)
    return { error: "Profissional não encontrado para o usuário atual." };

  // Paciente tem que ser da clínica ativa (evita documento órfão sob clinic errado).
  const { data: paciente } = await supabase
    .from("patients")
    .select("id")
    .eq("id", patientId)
    .eq("clinic_id", clinicId)
    .maybeSingle();
  if (!paciente) return { error: "Paciente não encontrado." };

  // Só se documenta durante um atendimento em curso (é dele que vêm os procedimentos).
  const ativo = await getAtendimentoAtivo(patientId);
  if (!ativo?.queueEntryId)
    return { error: "Nenhum atendimento em andamento para este paciente." };

  // Fotografa os procedimentos JÁ registrados no atendimento (nome + preço).
  const { data: execs, error: execErr } = await supabase
    .from("procedure_executions")
    .select("procedure_id, amount, procedures(name)")
    .eq("queue_entry_id", ativo.queueEntryId);
  if (execErr) return { error: "Não foi possível ler os procedimentos." };
  if (!execs || execs.length === 0)
    return { error: "Adicione ao menos um procedimento antes de gerar o documento." };

  // Cabeçalho do documento (sempre novo).
  const { data: novo, error: insErr } = await supabase
    .from("procedure_documents")
    .insert({
      clinic_id: clinicId,
      patient_id: patientId,
      professional_id: professionalId,
      created_by: clinico.userId,
      queue_entry_id: ativo.queueEntryId,
    })
    .select("id")
    .single();
  if (insErr || !novo) return { error: "Não foi possível criar o documento." };
  const documentId = novo.id as string;

  const itens = execs.map((e) => {
    const proc = one<{ name: string | null }>(e.procedures);
    return {
      document_id: documentId,
      procedure_id: (e.procedure_id as string | null) ?? null,
      name_snapshot: proc?.name ?? "—",
      price_snapshot: Number(e.amount ?? 0),
    };
  });

  const { error: itErr } = await supabase
    .from("procedure_document_items")
    .insert(itens);
  if (itErr) {
    // Sem transação nas actions: evita documento-fantasma sem itens.
    await supabase.from("procedure_documents").delete().eq("id", documentId);
    return { error: "Não foi possível salvar os procedimentos do documento." };
  }

  // Auditoria sem dado clínico: só a quantidade de itens.
  await logAction({
    action: "create",
    module: "prontuario",
    summary: "Documento de procedimentos gerado",
    entity: "procedure_document",
    entityId: documentId,
    metadata: { totalItens: itens.length },
  });

  revalidatePath(`/prontuario/${patientId}/procedimento`);
  revalidatePath(`/prontuario/${patientId}`);
  return { ok: true, documentId };
}

/**
 * Carrega um documento de procedimentos para exibição/impressão (somente
 * leitura). Mesmos gates do resto do prontuário; consulta escopada por clínica
 * ativa + paciente (o id vem do browser e não é confiável por si só).
 */
export async function carregarDocumentoProcedimentos(
  patientId: string,
  documentId: string,
): Promise<{ error?: string; detalhe?: ProcedimentoDocDetalhe }> {
  const parsed = z
    .object({
      patientId: z.string().uuid("Paciente inválido."),
      documentId: z.string().uuid("Documento inválido."),
    })
    .safeParse({ patientId, documentId });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  const clinico = await requireClinico();
  if ("error" in clinico) return { error: clinico.error };

  const denied = await requireAction("prontuario", "view");
  if (denied) return { error: denied };

  const detalhe = await getProcedimentoDocPorId(
    parsed.data.patientId,
    parsed.data.documentId,
  );
  if (!detalhe) return { error: "Documento não encontrado." };

  return { detalhe };
}

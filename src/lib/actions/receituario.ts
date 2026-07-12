"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, getRole } from "@/lib/auth";
import { requireAction } from "@/lib/permissions";
import { getMyProfessionalId } from "@/lib/clinico/professional";
import { requireClinic } from "@/lib/tenant";
import { getPatientEditavel } from "@/lib/data/patients";
import { getAtendimentoAtivo } from "@/lib/data/atendimento";
import { resolveCidCode } from "@/lib/data/cid";
import { logAction } from "@/lib/system-log";

export type ActionState = { error?: string; ok?: boolean } | undefined;

/** Autorização: emitir receituário é ato do médico (admin como gestor). */
async function guardMedico(): Promise<string | null> {
  const role = await getRole();
  if (role !== "medico" && role !== "admin") {
    return "Apenas o médico pode emitir receituários.";
  }
  return null;
}

const receituarioSchema = z.object({
  patientId: z.string().uuid("Paciente inválido."),
  tipo: z.enum(["simples", "especial"]),
  texto: z.string().trim().min(1, "Informe o conteúdo do receituário."),
  // CID-10 OPCIONAL por LGPD; se informado, validado contra o catálogo.
  cid10: z.string().trim().optional(),
  exibirCid: z.boolean().optional(),
});

export type ReceituarioInput = z.infer<typeof receituarioSchema>;

/** Emite um receituário (simples ou especial), persistido em certificates. */
export async function emitirReceituario(
  input: ReceituarioInput,
): Promise<ActionState> {
  const parsed = receituarioSchema.safeParse(input);
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

  // Integridade: o paciente precisa existir na clínica ativa (getPatientEditavel
  // já filtra por clinic_id). Evita anexar receituário a paciente de outra clínica.
  const paciente = await getPatientEditavel(d.patientId);
  if (!paciente) return { error: "Paciente não encontrado nesta clínica." };

  // CID-10 opcional, mas se informado precisa existir (e estar ativo) no
  // catálogo do admin (cid_codes). Fora do catálogo → não emite o receituário.
  let cid10: string | null = null;
  if (d.cid10 && d.cid10.trim()) {
    const cid = await resolveCidCode(d.cid10);
    if (!cid) {
      return {
        error:
          "CID-10 não encontrado no catálogo. Selecione um CID cadastrado em Configurações → Catálogo CID.",
      };
    }
    cid10 = cid.code; // grava o código canônico do catálogo
  }

  // Vincula o receituário ao atendimento corrente do paciente (histórico por atendimento).
  const ativo = await getAtendimentoAtivo(d.patientId);
  const { data: inserted, error } = await supabase
    .from("certificates")
    .insert({
      clinic_id: clinicId,
      patient_id: d.patientId,
      professional_id: professionalId,
      created_by: current.userId,
      queue_entry_id: ativo?.queueEntryId ?? null,
      kind: `receituario_${d.tipo}`,
      prescription_text: d.texto,
      cid10,
      show_cid: d.exibirCid ?? true,
    })
    .select("id")
    .single();
  if (error) {
    console.error("emitirReceituario insert falhou:", error);
    return { error: "Não foi possível emitir o receituário." };
  }

  await logAction({
    action: "create",
    module: "documentos",
    summary: `Emitiu um receituário ${d.tipo === "especial" ? "especial" : "simples"}`,
    entity: "certificate",
    entityId: inserted?.id ?? d.patientId,
  });
  revalidatePath(`/prontuario/${d.patientId}/receituario`);
  return { ok: true };
}

const editarReceituarioSchema = z.object({
  id: z.string().uuid("Receituário inválido."),
  patientId: z.string().uuid("Paciente inválido."),
  tipo: z.enum(["simples", "especial"]),
  texto: z.string().trim().min(1, "Informe o conteúdo do receituário."),
  cid10: z.string().trim().optional(),
  exibirCid: z.boolean().optional(),
});

export type EditarReceituarioInput = z.infer<typeof editarReceituarioSchema>;

/** Edita um receituário já emitido (bloqueado se cancelado). */
export async function editarReceituario(
  input: EditarReceituarioInput,
): Promise<ActionState> {
  const parsed = editarReceituarioSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  const negado = await guardMedico();
  if (negado) return { error: negado };
  const denied = await requireAction("prontuario", "edit");
  if (denied) return { error: denied };

  const current = await getCurrentUser();
  if (!current) return { error: "Sessão expirada." };

  const supabase = await createClient();
  const clinicId = await requireClinic();
  const d = parsed.data;

  // Bloqueia edição de documento cancelado (read-only).
  const { data: atual, error: erroBusca } = await supabase
    .from("certificates")
    .select("cancelled_at")
    .eq("id", d.id)
    .eq("clinic_id", clinicId)
    .like("kind", "receituario_%")
    .maybeSingle();
  if (erroBusca) return { error: "Não foi possível carregar o receituário." };
  if (!atual) return { error: "Receituário não encontrado nesta clínica." };
  if (atual.cancelled_at)
    return { error: "Documento cancelado não pode ser editado." };

  let cid10: string | null = null;
  if (d.cid10 && d.cid10.trim()) {
    const cid = await resolveCidCode(d.cid10);
    if (!cid) {
      return {
        error:
          "CID-10 não encontrado no catálogo. Selecione um CID cadastrado em Configurações → Catálogo CID.",
      };
    }
    cid10 = cid.code;
  }

  const { error } = await supabase
    .from("certificates")
    .update({
      kind: `receituario_${d.tipo}`,
      prescription_text: d.texto,
      cid10,
      show_cid: d.exibirCid ?? true,
    })
    .eq("id", d.id)
    .eq("clinic_id", clinicId)
    .like("kind", "receituario_%")
    .is("cancelled_at", null);
  if (error) {
    console.error("editarReceituario update falhou:", error);
    return { error: "Não foi possível editar o receituário." };
  }

  await logAction({
    action: "update",
    module: "documentos",
    summary: "Editou um receituário",
    entity: "certificate",
    entityId: d.id,
  });
  revalidatePath(`/prontuario/${d.patientId}/receituario`);
  return { ok: true };
}

const removerSchema = z.object({
  id: z.string().uuid("Receituário inválido."),
  motivo: z
    .string()
    .trim()
    .min(3, "Informe o motivo do cancelamento.")
    .max(500, "Motivo muito longo (máx. 500 caracteres)."),
});

/**
 * Cancela um receituário (escopo da clínica, apenas kind receituario_*).
 *
 * NÃO apaga fisicamente (LGPD/rastreabilidade): grava o carimbo de
 * cancelamento (0111) e o documento continua visível, marcado e read-only.
 * O nome é mantido por compatibilidade com os chamadores existentes, mas o
 * comportamento agora é CANCELAR — passou a exigir `motivo`.
 */
export async function removerReceituario(
  id: string,
  motivo: string,
): Promise<ActionState> {
  const parsed = removerSchema.safeParse({ id, motivo });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };


  const negado = await guardMedico();
  if (negado) return { error: negado };
  const denied = await requireAction("prontuario", "delete");
  if (denied) return { error: denied };

  const current = await getCurrentUser();
  if (!current) return { error: "Sessão expirada." };

  const supabase = await createClient();
  const clinicId = await requireClinic();
  const { data: cancelled, error } = await supabase
    .from("certificates")
    .update({
      cancelled_at: new Date().toISOString(),
      cancelled_by: current.userId,
      cancel_reason: parsed.data.motivo,
    })
    .eq("id", parsed.data.id)
    .eq("clinic_id", clinicId)
    .like("kind", "receituario_%")
    .is("cancelled_at", null)
    .select("patient_id");
  if (error) {
    console.error("removerReceituario cancelamento falhou:", error.message);
    return { error: "Não foi possível cancelar o receituário." };
  }
  if (!cancelled || cancelled.length === 0) {
    return { error: "Receituário não encontrado ou já cancelado." };
  }

  await logAction({
    action: "delete",
    module: "prontuario",
    summary: "Cancelou um receituário",
    entity: "certificates",
    entityId: parsed.data.id,
  });

  const patientId = cancelled[0]?.patient_id as string | undefined;
  revalidatePath(
    patientId ? `/prontuario/${patientId}/receituario` : "/prontuario",
  );
  return { ok: true };
}

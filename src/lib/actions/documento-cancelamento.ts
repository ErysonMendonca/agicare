"use server";

// ════════════════════════════════════════════════════════════════
// Cancelamento GENÉRICO de documentos do prontuário.
//
// Cancelar NÃO apaga: o documento permanece no banco e continua
// visível na Linha do Tempo, apenas marcado como "Cancelado" (com
// quem, quando e por quê) e tratado como READ-ONLY pela UI. É a
// contrapartida não-destrutiva dos antigos DELETEs físicos — exigido
// por LGPD/rastreabilidade clínica.
//
// Grava o padrão canônico da migration 0111 (cancelled_at / cancelled_by
// / cancel_reason) em qualquer uma das 12 tabelas de documento, sempre
// via cliente sob RLS + filtro explícito por clinic_id (multitenant).
// ════════════════════════════════════════════════════════════════

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/service";
import { getCurrentUser } from "@/lib/auth";
import { requireAction } from "@/lib/permissions";
import { requireClinic } from "@/lib/tenant";
import { logAction } from "@/lib/system-log";

export type ActionState = { error?: string; ok?: boolean } | undefined;

/**
 * Whitelist das tabelas de documento que aceitam cancelamento (padrão
 * 0111). Fora desta lista NADA é aceito — nunca interpolar tabela vinda
 * do cliente sem passar por este enum.
 * Todas possuem coluna `clinic_id` (add em 0020_multitenant / create em 0103),
 * portanto o update é sempre filtrado por clínica.
 */
// ponytail: NÃO exportar — arquivo "use server" só pode exportar funções async.
// Exportar este const (valor de runtime) quebra o carregamento do módulo e
// derruba TODAS as server actions das telas de documento (500 ao salvar).
const DOC_TABELAS = [
  "certificates",
  "prescriptions",
  "anamneses",
  "medical_records",
  "exam_orders",
  "nursing_evolutions",
  "nursing_notes",
  "nursing_procedures",
  "care_checks",
  "sae_records",
  "prosthetic_orders",
  "dental_charts",
  "procedure_documents",
] as const;

export type DocTabela = (typeof DOC_TABELAS)[number];

const cancelarSchema = z.object({
  tabela: z.enum(DOC_TABELAS),
  id: z.string().uuid("Documento inválido."),
  motivo: z
    .string()
    .trim()
    .min(3, "Informe o motivo do cancelamento.")
    .max(500, "Motivo muito longo (máx. 500 caracteres)."),
});

export type CancelarDocumentoInput = z.infer<typeof cancelarSchema>;

/**
 * Cancela (não apaga) um documento do prontuário.
 *
 * Autorização: mesmo gate dos antigos deletes — permissão de módulo
 * `prontuario` / ação `delete` na matriz de perfis. O RLS isola por
 * clínica como segunda camada; ainda assim filtramos clinic_id no update.
 *
 * Idempotente: só cancela linhas ainda ativas (`cancelled_at is null`);
 * um segundo cancelamento não re-carimba (retorna "já cancelada").
 */
export async function cancelarDocumento(
  input: CancelarDocumentoInput,
): Promise<ActionState> {
  const parsed = cancelarSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  // Defesa em profundidade: papel clínico + permissão de módulo na matriz.
  const denied = await requireAction("prontuario", "delete");
  if (denied) return { error: denied };

  const current = await getCurrentUser();
  if (!current) return { error: "Sessão expirada." };

  const clinicId = await requireClinic();
  const { tabela, id, motivo } = parsed.data;

  // Service-role (ignora RLS): a autorização REAL desta ação é a matriz de
  // perfis (`requireAction("prontuario","delete")`) acima — configurável por
  // clínica. As tabelas de documento têm RLS de UPDATE restrita a admin/médico
  // (0007/0008/0016/0017/0103), o que rejeitaria silenciosamente (0 linhas) um
  // perfil autorizado pela matriz mas fora do RLS (ex.: recepção com a permissão
  // concedida). Mantemos o isolamento multitenant com o `.eq("clinic_id")`
  // EXPLÍCITO abaixo — o service-role NÃO dispensa esse filtro.
  const supabase = createServiceClient();
  const { data: updated, error } = await supabase
    .from(tabela)
    .update({
      cancelled_at: new Date().toISOString(),
      cancelled_by: current.userId,
      cancel_reason: motivo,
    })
    .eq("id", id)
    .eq("clinic_id", clinicId)
    .is("cancelled_at", null)
    .select("id");
  if (error) {
    // Sem vazar detalhes/stack ao cliente (LGPD); log técnico só no servidor.
    console.error(`cancelarDocumento(${tabela}) falhou:`, error.message);
    return { error: "Não foi possível cancelar o documento." };
  }
  if (!updated || updated.length === 0) {
    return { error: "Documento não encontrado ou já cancelado." };
  }

  await logAction({
    action: "delete",
    module: "prontuario",
    summary: `Cancelou um documento (${tabela})`,
    entity: tabela,
    entityId: id,
  });

  // Genérico: o cancelamento pode partir de qualquer aba do prontuário.
  revalidatePath("/prontuario", "layout");
  return { ok: true };
}

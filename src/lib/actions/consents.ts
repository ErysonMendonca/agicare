"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getCurrentUser, getRole } from "@/lib/auth";
import { requireClinic } from "@/lib/tenant";
import { logAction } from "@/lib/system-log";

// ════════════════════════════════════════════════════════════════
// Registro de EMISSÃO de termos de consentimento (public.consents, 0007).
//
// Fluxo: ao salvar a Ficha de Atendimento, a recepção imprime os termos
// ATIVOS (0107) para assinatura em papel. Aqui gravamos, para cada termo
// impresso, uma linha em consents documentando a emissão.
//
// ⚠️ DECISÃO — service-role em consents:
//   A RLS de public.consents (0007) é clínica/LGPD: só admin|medico passam.
//   A RECEPÇÃO precisa registrar a emissão, mas NÃO deve enxergar/gerir dado
//   clínico → afrouxar a RLS de consents para incluir recepcao vazaria dado
//   sensível. Em vez disso, autorizamos no SERVIDOR (gate staff) e gravamos
//   com o cliente service-role (ignora RLS), setando clinic_id EXPLÍCITO
//   (requireClinic) e created_by = usuário atual. O service-role fica contido
//   nesta Server Action de confiança (nunca chega ao browser). Os templateIds
//   são validados como pertencentes à clínica ANTES do insert (via cliente
//   normal, sob RLS), fechando o escopo por tenant.
// ════════════════════════════════════════════════════════════════

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const uuid = z.string().trim().regex(UUID, "Identificador inválido.");

const schema = z.object({
  patientId: uuid,
  professionalId: uuid.nullable().optional(),
  templateIds: z.array(uuid).min(1, "Nenhum termo a registrar.").max(50),
});

/**
 * Registra a emissão (impressão para assinatura em papel) de um conjunto de
 * termos para um paciente. Best-effort: falha em um insert não derruba os
 * outros; retorna ok se ao menos um foi registrado.
 */
export async function registrarConsentimentosImpressos(input: {
  patientId: string;
  professionalId?: string | null;
  templateIds: string[];
}): Promise<{ ok?: boolean; error?: string }> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const { patientId, professionalId, templateIds } = parsed.data;

  // Gate de staff (admin/medico/recepcao) — mesma checagem de salvarAtendimento.
  const current = await getCurrentUser();
  if (!current) return { error: "Sessão expirada." };
  const role = await getRole();
  if (role !== "admin" && role !== "medico" && role !== "recepcao") {
    return { error: "Acesso restrito à equipe da clínica." };
  }

  const clinicId = await requireClinic();

  const supabase = await createClient();

  // Valida que o PACIENTE pertence à clínica ativa. Como o insert usa
  // service-role (ignora RLS), sem isto um staff da clínica X poderia gravar
  // um consent para um patientId de outra clínica. A leitura abaixo passa pelo
  // cliente normal (RLS patients_staff_all), logo só retorna paciente do tenant.
  const { data: pac } = await supabase
    .from("patients")
    .select("id")
    .eq("id", patientId)
    .maybeSingle();
  if (!pac) return { error: "Paciente inválido para esta clínica." };

  // Valida que os templateIds pertencem à clínica ativa (cliente normal, sob
  // RLS staff de consent_templates). Só emitimos os termos confirmados.
  const { data: valid } = await supabase
    .from("consent_templates")
    .select("id")
    .eq("clinic_id", clinicId)
    .in("id", templateIds);

  const validIds = (valid ?? []).map((r) => r.id as string);
  if (validIds.length === 0) {
    return { error: "Nenhum termo válido para esta clínica." };
  }

  // Grava a emissão com service-role (ver DECISÃO no topo do arquivo).
  const service = createServiceClient();
  const rows = validIds.map((templateId) => ({
    clinic_id: clinicId,
    patient_id: patientId,
    professional_id: professionalId ?? null,
    context: `termo:${templateId}`,
    accepted: true, // assinado em papel
    signature: null,
    created_by: current.userId,
  }));

  const { data: inserted, error } = await service
    .from("consents")
    .insert(rows)
    .select("id");

  // Best-effort: sucesso se ao menos uma linha foi registrada.
  const registrados = inserted?.length ?? 0;
  if (registrados === 0) {
    return { error: "Não foi possível registrar os consentimentos." };
  }

  await logAction({
    action: "print",
    module: "fila",
    summary: `Emitiu ${registrados} termo(s) de consentimento para impressão`,
    entity: "consent",
    metadata: { patientId, count: registrados, partial: !!error },
  });

  return { ok: true };
}

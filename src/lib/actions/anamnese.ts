"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { requireAction } from "@/lib/permissions";
import { getMyProfessionalId } from "@/lib/clinico/professional";
import { getMySpecialty } from "@/lib/data/prontuario";
import { getAtendimentoAtivo } from "@/lib/data/atendimento";
import { chaveEspecialidade } from "@/lib/clinico/anamnese-config";
import { requireClinic } from "@/lib/tenant";

export type ActionState = { error?: string; ok?: boolean } | undefined;

const anamneseSchema = z.object({
  patientId: z.string().min(1, "Paciente inválido."),
  specialty: z.string().trim().min(1, "Especialidade obrigatória."),
  fields: z.record(z.string(), z.unknown()).default({}),
  // Consentimento/assinatura deixaram de ser coletados na tela de anamnese
  // (o consentimento é tratado no fluxo da recepção — Documentos do Atendimento,
  // assinado no papel). Mantidos opcionais para compatibilidade do payload.
  consent: z.boolean().default(false),
  consentAtendimento: z.boolean().default(false),
  consentImagem: z.boolean().default(false),
  signature: z
    .string()
    .trim()
    .max(500_000, "Assinatura digital inválida (tamanho excedido).")
    .default(""),
});

// z.input: campos com .default() (consent/assinatura) são OPCIONAIS na entrada.
export type AnamneseInput = z.input<typeof anamneseSchema>;

/** Mesma especialidade = mesmo módulo de anamnese (ex.: "Podologia" ≈ "Podológico"). */
function mesmaEspecialidade(a: string, b: string): boolean {
  return chaveEspecialidade(a) === chaveEspecialidade(b);
}

/**
 * Gera (registra) uma anamnese. Regra: só pode ser GERADA por profissional da
 * especialidade da ficha (visualização de outras especialidades é livre).
 * Consentimento LGPD obrigatório + assinatura digital.
 */
export async function gerarAnamnese(input: AnamneseInput): Promise<ActionState> {
  const parsed = anamneseSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  const d = parsed.data;

  const current = await getCurrentUser();
  if (!current) return { error: "Sessão expirada." };

  // Defesa em profundidade: permissão de escrita no módulo Prontuário.
  const denied = await requireAction("prontuario", "create");
  if (denied) return { error: denied };

  // Regra de especialidade: só gera quem é da especialidade da ficha.
  const minhaEspecialidade = await getMySpecialty();
  if (!minhaEspecialidade || !mesmaEspecialidade(minhaEspecialidade, d.specialty)) {
    return {
      error:
        "Apenas profissionais da especialidade da ficha podem gerar esta anamnese.",
    };
  }

  const clinicId = await requireClinic();
  const supabase = await createClient();
  const professionalId = await getMyProfessionalId(current.userId);
  if (!professionalId)
    return { error: "Profissional não encontrado para o usuário atual." };

  // 1) Anamnese.
  // Vincula o documento ao atendimento corrente do paciente (histórico por atendimento).
  const ativo = await getAtendimentoAtivo(d.patientId);
  const { error } = await supabase.from("anamneses").insert({
    clinic_id: clinicId,
    patient_id: d.patientId,
    professional_id: professionalId,
    created_by: current.userId,
    queue_entry_id: ativo?.queueEntryId ?? null,
    specialty: d.specialty,
    fields: d.fields,
    consent_given: d.consent,
    signature: d.signature,
  });
  if (error) return { error: error.message };

  // 2) Consentimentos (registro auditável, uma linha por tipo aceito).
  //    Best-effort: falha aqui (tabela/coluna ausente, RLS) NÃO derruba a
  //    geração da anamnese, que já foi persistida acima.
  try {
    // Só registra consentimentos efetivamente aceitos (hoje a tela de anamnese
    // não os coleta — fica vazio e nada é inserido).
    const contexts: string[] = [];
    if (d.consent) contexts.push("lgpd");
    if (d.consentAtendimento) contexts.push("atendimento");
    if (d.consentImagem) contexts.push("imagem");
    if (contexts.length > 0) {
      const rows = contexts.map((context) => ({
        clinic_id: clinicId,
        patient_id: d.patientId,
        professional_id: professionalId,
        context,
        accepted: true,
        signature: d.signature,
        created_by: current.userId, // profiles.id (1:1 com auth.users)
      }));
      await supabase.from("consents").insert(rows);
    }
  } catch {
    // Auditoria de consentimento é best-effort; não interrompe o fluxo principal.
  }

  revalidatePath(`/prontuario/${d.patientId}/anamnese`);
  return { ok: true };
}

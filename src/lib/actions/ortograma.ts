"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireClinico } from "@/lib/auth";
import { requireAction } from "@/lib/permissions";
import { requireClinic } from "@/lib/tenant";
import { getMyProfessionalId } from "@/lib/clinico/professional";
import { getAtendimentoAtivo } from "@/lib/data/atendimento";
import { getOrtogramaPorId } from "@/lib/data/ortograma";
import { logAction } from "@/lib/system-log";
import {
  MARCACOES,
  denteValido,
  normalizarMarcas,
  type Marca,
  type Marcacao,
} from "@/lib/clinico/ortograma.shared";

export type ActionState =
  | {
      error?: string;
      ok?: boolean;
      chartId?: string;
      /**
       * Novo carimbo do registro. A tela DEVE guardá-lo: sem isso o segundo
       * salvamento seguido bateria na trava otimista com o carimbo antigo e
       * seria recusado como se outra sessão tivesse editado.
       */
      updatedAt?: string;
    }
  | undefined;

/** Versão antiga aberta pelo histórico — só leitura, nunca volta para edição. */
export type OrtogramaVersao = {
  notes: string;
  marcas: Array<{ tooth: number; marking: Marcacao }>;
  professionalName: string;
  createdAt: string;
};

/**
 * Carrega um ortograma do histórico para exibição SOMENTE LEITURA no modal.
 *
 * Passa pelos mesmos gates do resto do prontuário (papel clínico + permissão de
 * leitura do módulo) e a consulta é escopada por clínica ativa + paciente: o
 * `chartId` vem do browser e não é confiável por si só.
 */
export async function carregarOrtograma(
  patientId: string,
  chartId: string,
): Promise<{ error?: string; versao?: OrtogramaVersao }> {
  const ids = z.object({
    patientId: z.string().uuid("Paciente inválido."),
    chartId: z.string().uuid("Ortograma inválido."),
  });
  const parsed = ids.safeParse({ patientId, chartId });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  const clinico = await requireClinico();
  if ("error" in clinico) return { error: clinico.error };

  const denied = await requireAction("prontuario", "view");
  if (denied) return { error: denied };

  const chart = await getOrtogramaPorId(parsed.data.patientId, parsed.data.chartId);
  if (!chart) return { error: "Ortograma não encontrado." };

  return {
    versao: {
      notes: chart.notes,
      marcas: chart.marcas.map(({ tooth, marking }) => ({ tooth, marking })),
      professionalName: chart.professionalName,
      createdAt: chart.createdAt,
    },
  };
}

const marcaSchema = z.object({
  // `denteValido` é a fonte da verdade (FDI permanente): o client manda número,
  // mas quem decide se o dente existe é o domínio, não o formulário.
  tooth: z.number().int().refine(denteValido, "Dente inválido."),
  marking: z.enum(MARCACOES),
  note: z.string().trim().max(500, "Observação do dente muito longa.").optional(),
});

const ortogramaSchema = z.object({
  patientId: z.string().uuid("Paciente inválido."),
  chartId: z.string().uuid("Ortograma inválido.").optional(),
  /**
   * `updated_at` que a tela carregou. Trava otimista: se o registro mudou no
   * banco desde então, outra sessão salvou por cima e nós recusamos em vez de
   * apagar o trabalho dela em silêncio (dentista e auxiliar em duas abas).
   */
  updatedAt: z.string().optional(),
  notes: z.string().max(5000, "Observações muito longas."),
  marcas: z.array(marcaSchema),
});

export type OrtogramaInput = z.infer<typeof ortogramaSchema>;

/**
 * Colapsa marcas duplicadas (mesmo dente + mesma marcação), que violariam o
 * unique(chart_id, tooth, marking). Mantém a PRIMEIRA observação não vazia:
 * a UI pode mandar a mesma combinação duas vezes (clique repetido) e perder a
 * observação do dentista por isso seria pior que rejeitar.
 */
function dedupMarcas(marcas: Marca[]): Marca[] {
  const porChave = new Map<string, Marca>();
  for (const m of marcas) {
    const chave = `${m.tooth}:${m.marking}`;
    const existente = porChave.get(chave);
    if (!existente) {
      porChave.set(chave, m);
      continue;
    }
    if (!existente.note?.trim() && m.note?.trim()) {
      porChave.set(chave, { ...existente, note: m.note });
    }
  }
  return [...porChave.values()];
}

/**
 * Cria ou regrava o ortograma (odontograma) do paciente.
 *
 * Autorização em profundidade: papel clínico na clínica ativa (`requireClinico`)
 * + permissão granular no módulo Prontuário (`requireAction`). A RLS da 0103 é
 * a terceira camada, não a primeira.
 *
 * Regravar (com `chartId`) apaga as marcas DAQUELE chart e reinsere: só depois
 * de provar que o chart pertence à clínica ativa E ao paciente informado.
 */
export async function salvarOrtograma(input: OrtogramaInput): Promise<ActionState> {
  const parsed = ortogramaSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  const d = parsed.data;
  const editando = Boolean(d.chartId);

  const clinico = await requireClinico();
  if ("error" in clinico) return { error: clinico.error };

  const denied = await requireAction("prontuario", editando ? "edit" : "create");
  if (denied) return { error: denied };

  const clinicId = await requireClinic();
  const supabase = await createClient();

  const professionalId = await getMyProfessionalId(clinico.userId);
  if (!professionalId)
    return { error: "Profissional não encontrado para o usuário atual." };

  // O paciente tem que ser da clínica ativa: sem isto, um patientId de outra
  // clínica criaria um chart órfão sob o clinic_id errado.
  const { data: paciente } = await supabase
    .from("patients")
    .select("id")
    .eq("id", d.patientId)
    .eq("clinic_id", clinicId)
    .maybeSingle();
  if (!paciente) return { error: "Paciente não encontrado." };

  // Exclusividade de "Ausente" também no servidor: o payload pode vir adulterado
  // com um dente ausente carregando cárie. Mesma função pura que a tela usa.
  const marcas = normalizarMarcas(dedupMarcas(d.marcas));
  const notes = d.notes.trim();

  let chartId: string;
  // Marcas anteriores, guardadas para desfazer o delete se o insert falhar.
  // As server actions deste projeto não rodam em transação, então um erro entre
  // o delete e o insert deixaria o ortograma SEM marcação alguma — perda de
  // dado clínico. Restauramos manualmente nesse caso.
  let marcasAnteriores: Array<Record<string, unknown>> = [];

  if (editando) {
    // Ownership ANTES de qualquer delete: clínica ativa + paciente informado.
    const { data: chart } = await supabase
      .from("dental_charts")
      .select("id, updated_at")
      .eq("id", d.chartId as string)
      .eq("clinic_id", clinicId)
      .eq("patient_id", d.patientId)
      .maybeSingle();
    if (!chart) return { error: "Ortograma não encontrado." };

    // Trava otimista: comparamos o carimbo que a tela trouxe com o do banco.
    // Sem isto, a segunda aba a salvar apagaria as marcas da primeira sem aviso.
    const noBanco = chart.updated_at as string | null;
    if (d.updatedAt && noBanco && new Date(d.updatedAt).getTime() !== new Date(noBanco).getTime()) {
      return {
        error:
          "Este ortograma foi alterado em outra sessão. Recarregue a página para ver a versão atual antes de salvar.",
      };
    }

    chartId = chart.id as string;

    const { error: upErr } = await supabase
      .from("dental_charts")
      .update({ notes: notes || null })
      .eq("id", chartId)
      .eq("clinic_id", clinicId);
    if (upErr) return { error: "Não foi possível salvar o ortograma." };

    const { data: antigas } = await supabase
      .from("dental_chart_marks")
      .select("chart_id, tooth, marking, note")
      .eq("chart_id", chartId);
    marcasAnteriores = antigas ?? [];

    // Delete escopado ao chart já validado. Nunca por patient_id/clinic_id.
    const { error: delErr } = await supabase
      .from("dental_chart_marks")
      .delete()
      .eq("chart_id", chartId);
    if (delErr) return { error: "Não foi possível atualizar as marcações." };
  } else {
    // Vincula ao atendimento em curso, se houver: o ortograma feito fora de um
    // atendimento (revisão de registro) continua válido, só fica sem queue_entry_id.
    const ativo = await getAtendimentoAtivo(d.patientId);

    const { data: novo, error: insErr } = await supabase
      .from("dental_charts")
      .insert({
        clinic_id: clinicId,
        patient_id: d.patientId,
        professional_id: professionalId,
        created_by: clinico.userId,
        queue_entry_id: ativo?.queueEntryId ?? null,
        notes: notes || null,
      })
      .select("id")
      .single();
    if (insErr || !novo) return { error: "Não foi possível criar o ortograma." };

    chartId = novo.id as string;
  }

  if (marcas.length > 0) {
    const { error: marksErr } = await supabase.from("dental_chart_marks").insert(
      marcas.map((m) => ({
        chart_id: chartId,
        tooth: m.tooth,
        marking: m.marking,
        note: m.note?.trim() || null,
      })),
    );
    if (marksErr) {
      // Rollback manual: devolve as marcas que o delete acabou de remover, para
      // o ortograma não ficar vazio. Se a restauração também falhar, avisamos
      // explicitamente — o dentista precisa saber que o registro está incompleto.
      if (marcasAnteriores.length > 0) {
        const { error: restErr } = await supabase
          .from("dental_chart_marks")
          .insert(marcasAnteriores);
        if (restErr) {
          return {
            error:
              "Não foi possível salvar as marcações e o registro anterior não pôde ser restaurado. Refaça o ortograma antes de sair da tela.",
          };
        }
      }
      return { error: "Não foi possível salvar as marcações." };
    }
  }

  // Auditoria sem dado clínico: quantidade de marcas, nunca dentes/diagnósticos.
  await logAction({
    action: editando ? "update" : "create",
    module: "prontuario",
    summary: editando ? "Ortograma atualizado" : "Ortograma registrado",
    entity: "dental_chart",
    entityId: chartId,
    metadata: { totalMarcas: marcas.length },
  });

  // Carimbo pós-gravação: a tela precisa dele para o PRÓXIMO salvamento passar
  // pela trava otimista (o trigger de `updated_at` acabou de mudar o valor).
  const { data: fresco } = await supabase
    .from("dental_charts")
    .select("updated_at")
    .eq("id", chartId)
    .maybeSingle();

  revalidatePath(`/prontuario/${d.patientId}/ortograma`);
  revalidatePath(`/prontuario/${d.patientId}`);
  return {
    ok: true,
    chartId,
    updatedAt: (fresco?.updated_at as string | null) ?? undefined,
  };
}

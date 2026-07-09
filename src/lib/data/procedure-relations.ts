import { createClient } from "@/lib/supabase/server";

/**
 * Vínculos e orientações de um procedimento (abas B/C/E), para pré-preencher o
 * modal de edição. Em modo demo, devolve tudo vazio (o mock não persiste).
 */
export type ProcedureRelations = {
  /** IDs de professionals.id habilitados (Aba B). */
  professionalIds: string[];
  /** IDs de stock_products.id consumidos (Aba C). */
  materialIds: string[];
  /** Qtd. baixada por execução, por product_id (Aba C). */
  materialQty: Record<string, number>;
  /** Orientações e flags (Aba E). */
  preInstructions: string;
  postInstructions: string;
  requireConsent: boolean;
  requireAnamnese: boolean;
  /** Canal de envio das orientações (e-mail/SMS/ambos). */
  channel: "email" | "sms" | "ambos";
};

const VAZIO: ProcedureRelations = {
  professionalIds: [],
  materialIds: [],
  materialQty: {},
  preInstructions: "",
  postInstructions: "",
  requireConsent: false,
  requireAnamnese: false,
  channel: "email",
};

/**
 * Carrega os relacionamentos (B/C/E) de uma lista de procedimentos de uma vez,
 * indexados por procedure_id. Resiliente: em erro ou demo, devolve mapa vazio.
 */
export async function loadProcedureRelations(
  procedureIds: string[],
): Promise<Record<string, ProcedureRelations>> {
  if (procedureIds.length === 0) return {};

  const supabase = await createClient();

  const [profsRes, matsRes, instrRes] = await Promise.all([
    supabase
      .from("procedure_professionals")
      .select("procedure_id, professional_id")
      .in("procedure_id", procedureIds),
    supabase
      .from("procedure_materials")
      .select("procedure_id, product_id, quantity")
      .in("procedure_id", procedureIds),
    supabase
      .from("procedure_instructions")
      .select(
        "procedure_id, pre_instructions, post_instructions, require_consent, require_anamnese, notify_channel",
      )
      .in("procedure_id", procedureIds),
  ]);

  const map: Record<string, ProcedureRelations> = {};
  const get = (id: string): ProcedureRelations =>
    (map[id] ??= {
      ...VAZIO,
      professionalIds: [],
      materialIds: [],
      materialQty: {},
    });

  for (const r of profsRes.data ?? []) {
    get(r.procedure_id as string).professionalIds.push(
      r.professional_id as string,
    );
  }
  for (const r of matsRes.data ?? []) {
    const rel = get(r.procedure_id as string);
    const pid = r.product_id as string;
    rel.materialIds.push(pid);
    rel.materialQty[pid] = Number(r.quantity ?? 1);
  }
  for (const r of instrRes.data ?? []) {
    const rel = get(r.procedure_id as string);
    rel.preInstructions = (r.pre_instructions as string | null) ?? "";
    rel.postInstructions = (r.post_instructions as string | null) ?? "";
    rel.requireConsent = !!r.require_consent;
    rel.requireAnamnese = !!r.require_anamnese;
    const ch = r.notify_channel as string | null;
    rel.channel = ch === "sms" || ch === "ambos" ? ch : "email";
  }

  return map;
}

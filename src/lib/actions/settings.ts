"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/supabase/config";
import { isGestor } from "@/lib/auth";
import { requireClinic } from "@/lib/tenant";
import { sanitizeStages } from "@/lib/data/attendance-flow.shared";

export type ActionState = { error?: string; ok?: boolean } | undefined;

const texto = z.string().trim().optional().or(z.literal(""));
const checkbox = z
  .union([z.literal("on"), z.literal("true"), z.literal("")])
  .optional()
  .transform((v) => v === "on" || v === "true");

const settingsSchema = z.object({
  // Geral
  clinic_name: z.string().trim().min(2, "Informe o nome da clínica."),
  cnpj: texto,
  phone: texto,
  email: z.string().trim().email("E-mail inválido.").optional().or(z.literal("")),
  address: texto,
  cep: texto,
  business_hours: texto,
  // Preferências
  language: texto,
  timezone: texto,
  date_format: texto,
  time_format: texto,
  currency: texto,
  // Segurança
  sec_two_factor: checkbox,
  sec_password_policy: texto,
  sec_session_timeout: texto,
  // Backup
  bkp_frequency: texto,
  bkp_retention: texto,
  // Notificações por evento
  notif_email_new: checkbox,
  notif_confirm_1d: checkbox,
  notif_sms_2h: checkbox,
  notif_whatsapp_results: checkbox,
  notif_stock: checkbox,
  notif_invoice: checkbox,
  // White-label / Branding
  brand_theme: texto,
  brand_primary: texto,
  brand_accent: texto,
  brand_logo: texto, // data URL do logo (persistido como texto)
});

/** "media" | "alta" | "baixa" — mantém só valores conhecidos. */
function policy(v?: string): string {
  return v === "alta" || v === "media" || v === "baixa" ? v : "media";
}
/** Frequência de backup conhecida. */
function freq(v?: string): string {
  return v === "diario" || v === "semanal" || v === "mensal" ? v : "diario";
}
/** Tema conhecido (white-label). */
function theme(v?: string): string {
  return v === "claro" || v === "escuro" || v === "auto" ? v : "claro";
}
/** Aceita só hex (#rgb / #rrggbb); senão devolve o fallback. */
function hex(v: string | undefined, fb: string): string {
  return v && /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(v) ? v : fb;
}
/** Inteiro saneado dentro de [min, max]. */
function intIn(v: string | undefined, fb: number, min: number, max: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return fb;
  return Math.min(max, Math.max(min, Math.round(n)));
}

/**
 * Salva TODAS as configurações da clínica (Geral, Preferências, Segurança,
 * Backup, Notificações e White-label) numa linha única (upsert manual).
 *
 * Os blocos estendidos vão em colunas JSONB (security/backup/notifications/
 * branding — migration 0025). Persiste via cliente de servidor (RLS staff).
 * Em modo demo, simula sucesso.
 *
 * FINANCEIRO/gestor: configurações da clínica são gestor-only — reforço no
 * servidor com isGestor (a UI também restringe).
 */
export async function salvarConfiguracoes(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  if (!(await isGestor())) return { error: "Acesso restrito ao gestor." };

  const parsed = settingsSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  if (isDemoMode()) return { ok: true };

  const d = parsed.data;

  const securityJson = {
    twoFactor: d.sec_two_factor,
    passwordPolicy: policy(d.sec_password_policy),
    sessionTimeoutMin: intIn(d.sec_session_timeout, 120, 5, 1440),
  };
  const backupJson = {
    frequency: freq(d.bkp_frequency),
    retentionDays: intIn(d.bkp_retention, 30, 1, 3650),
  };
  const notificationsJson = {
    emailNewAppointment: d.notif_email_new,
    confirmOneDayBefore: d.notif_confirm_1d,
    smsTwoHoursBefore: d.notif_sms_2h,
    whatsappResults: d.notif_whatsapp_results,
    stockAlerts: d.notif_stock,
    invoiceAlerts: d.notif_invoice,
  };
  const brandingJson = {
    theme: theme(d.brand_theme),
    primaryColor: hex(d.brand_primary, "#0db8c2"),
    accentColor: hex(d.brand_accent, "#0be0ae"),
    logoUrl: d.brand_logo && d.brand_logo.length > 0 ? d.brand_logo : null,
  };

  // Campos legados mantidos em sincronia com os blocos JSONB (compat).
  const basePayload = {
    clinic_name: d.clinic_name,
    cnpj: d.cnpj || null,
    phone: d.phone || null,
    email: d.email || null,
    address: d.address || null,
    cep: d.cep || null,
    business_hours: d.business_hours || null,
    language: d.language || "pt-BR",
    timezone: d.timezone || "gmt-3",
    date_format: d.date_format || "dmy",
    time_format: d.time_format || "24h",
    currency: d.currency || "brl",
    two_factor: securityJson.twoFactor,
    password_policy: securityJson.passwordPolicy,
    backup_frequency: backupJson.frequency,
    backup_retention_days: backupJson.retentionDays,
    security: securityJson,
    backup: backupJson,
    notifications: notificationsJson,
    branding: brandingJson,
    updated_at: new Date().toISOString(),
  };

  const supabase = await createClient();
  const clinicId = await requireClinic();

  // Upsert manual da linha única. Em multitenant a linha é POR clínica
  // (filtro por clinic_id); em mono-clínica (0020 não aplicado) NÃO existe
  // a coluna clinic_id e a linha é singleton — detectamos pelo erro de
  // coluna inexistente e refazemos sem clinic_id.
  async function persist(withClinicId: boolean): Promise<{ error: string | null }> {
    const payload = withClinicId
      ? { ...basePayload, clinic_id: clinicId }
      : basePayload;

    const sel = supabase.from("clinic_settings").select("id");
    const { data: existing } = withClinicId
      ? await sel.eq("clinic_id", clinicId).limit(1).maybeSingle()
      : await sel.limit(1).maybeSingle();

    const { error } = existing?.id
      ? await supabase
          .from("clinic_settings")
          .update(payload)
          .eq("id", existing.id)
      : await supabase.from("clinic_settings").insert(payload);

    return { error: error?.message ?? null };
  }

  let { error } = await persist(true);
  // Coluna clinic_id ausente (mono-clínica): refaz como singleton.
  if (error && /clinic_id/i.test(error)) {
    ({ error } = await persist(false));
  }
  if (error) return { error };

  revalidatePath("/configuracoes");
  return { ok: true };
}

// ── Fluxo de atendimento (etapas da fila) ────────────────────────────
const fluxoSchema = z.object({
  stages: z
    .array(z.enum(["recepcao", "triagem", "atendimento"]))
    .min(1, "Selecione ao menos uma etapa."),
});

export type SalvarFluxoInput = z.input<typeof fluxoSchema>;

/**
 * Salva o FLUXO de atendimento da clínica em
 * `clinic_settings.attendance_flow = { stages: FlowStage[] }`.
 *
 * Gestor-only (isGestor) + clínica ativa. As etapas são saneadas por
 * `sanitizeStages` (ordem canônica recepcao→triagem→atendimento; recepção e
 * atendimento são obrigatórias; triagem é opcional) — então mesmo um payload
 * incompleto resulta num fluxo válido. Upsert manual da linha única (com
 * fallback p/ mono-clínica sem coluna clinic_id, igual a salvarConfiguracoes).
 */
export async function salvarFluxo(
  input: SalvarFluxoInput,
): Promise<ActionState> {
  if (!(await isGestor())) return { error: "Acesso restrito ao gestor." };

  const parsed = fluxoSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  // Normaliza: ordem canônica + força etapas obrigatórias.
  const stages = sanitizeStages(parsed.data.stages);

  if (isDemoMode()) return { ok: true };

  const supabase = await createClient();
  const clinicId = await requireClinic();
  const payload = { attendance_flow: { stages }, updated_at: new Date().toISOString() };

  async function persist(withClinicId: boolean): Promise<{ error: string | null }> {
    const sel = supabase.from("clinic_settings").select("id");
    const { data: existing } = withClinicId
      ? await sel.eq("clinic_id", clinicId).limit(1).maybeSingle()
      : await sel.limit(1).maybeSingle();

    const row = withClinicId ? { ...payload, clinic_id: clinicId } : payload;
    const { error } = existing?.id
      ? await supabase.from("clinic_settings").update(payload).eq("id", existing.id)
      : await supabase.from("clinic_settings").insert(row);

    return { error: error?.message ?? null };
  }

  let { error } = await persist(true);
  if (error && /clinic_id/i.test(error)) {
    ({ error } = await persist(false));
  }
  if (error) return { error };

  revalidatePath("/configuracoes");
  revalidatePath("/fila");
  return { ok: true };
}

/**
 * Stub de "Executar backup agora": registra o instante em
 * clinic_settings.backup.lastRunAt. NÃO chama serviço externo (protótipo);
 * a execução real de backup é responsabilidade da infraestrutura.
 */
export async function executarBackup(): Promise<ActionState> {
  if (!(await isGestor())) return { error: "Acesso restrito ao gestor." };
  if (isDemoMode()) return { ok: true };

  const supabase = await createClient();
  const { data } = await supabase
    .from("clinic_settings")
    .select("id, backup")
    .limit(1)
    .maybeSingle();

  if (!data?.id) return { ok: true };

  const prev =
    data.backup && typeof data.backup === "object" && !Array.isArray(data.backup)
      ? (data.backup as Record<string, unknown>)
      : {};
  const next = { ...prev, lastRunAt: new Date().toISOString() };

  const { error } = await supabase
    .from("clinic_settings")
    .update({ backup: next })
    .eq("id", data.id);

  if (error) return { error: error.message };

  revalidatePath("/configuracoes");
  return { ok: true };
}

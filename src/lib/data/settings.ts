import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/supabase/config";

/** Bloco Segurança (persistido em clinic_settings.security jsonb). */
export type SecuritySettings = {
  /** Exigir 2FA no login da equipe. */
  twoFactor: boolean;
  /** Política de senha: baixa | media | alta (alta = 10+ com símbolo). */
  passwordPolicy: string;
  /** Timeout de sessão (minutos) — encerra sessão inativa. */
  sessionTimeoutMin: number;
};

/** Bloco Backup (persistido em clinic_settings.backup jsonb). */
export type BackupSettings = {
  frequency: string; // diario | semanal | mensal
  retentionDays: number;
  /** Último backup executado (stub — gravado pela action "Executar agora"). */
  lastRunAt: string | null;
};

/** Bloco Notificações por evento (persistido em clinic_settings.notifications jsonb). */
export type NotificationSettings = {
  /** E-mail a cada nova consulta agendada. */
  emailNewAppointment: boolean;
  /** Confirmação 1 dia antes. */
  confirmOneDayBefore: boolean;
  /** SMS 2h antes da consulta. */
  smsTwoHoursBefore: boolean;
  /** WhatsApp com resultados de exames. */
  whatsappResults: boolean;
  /** Aviso de estoque baixo. */
  stockAlerts: boolean;
  /** Aviso de faturas pendentes. */
  invoiceAlerts: boolean;
};

/** Bloco White-label / Branding (persistido em clinic_settings.branding jsonb). */
export type BrandingSettings = {
  /** Tema da interface: claro | escuro | auto. */
  theme: string;
  /** Cor primária da paleta (hex). */
  primaryColor: string;
  /** Cor de destaque/secundária (hex). */
  accentColor: string;
  /** Data URL / URL do logo (persistido como texto). */
  logoUrl: string | null;
};

export type ClinicSettings = {
  // Geral
  clinicName: string;
  cnpj: string;
  phone: string;
  email: string;
  address: string;
  cep: string;
  businessHours: string;
  // Preferências
  language: string;
  timezone: string;
  dateFormat: string;
  timeFormat: string;
  currency: string;
  /** Módulo Totem ligado (senha + Chamar). false = confirma presença + Dados direto. */
  totemEnabled: boolean;
  // Notificações (canais legados — mantidos por compat)
  notifyEmail: boolean;
  notifySms: boolean;
  notifyPush: boolean;
  // Segurança (flags legados — mantidos por compat)
  twoFactor: boolean;
  passwordPolicy: string;
  // Backup (flags legados — mantidos por compat)
  backupFrequency: string;
  backupRetentionDays: number;
  // Blocos estendidos (JSONB)
  security: SecuritySettings;
  backup: BackupSettings;
  notifications: NotificationSettings;
  branding: BrandingSettings;
};

const SECURITY_DEFAULTS: SecuritySettings = {
  twoFactor: false,
  passwordPolicy: "media",
  sessionTimeoutMin: 120,
};

const BACKUP_DEFAULTS: BackupSettings = {
  frequency: "diario",
  retentionDays: 30,
  lastRunAt: null,
};

const NOTIFICATION_DEFAULTS: NotificationSettings = {
  emailNewAppointment: true,
  confirmOneDayBefore: true,
  smsTwoHoursBefore: false,
  whatsappResults: false,
  stockAlerts: true,
  invoiceAlerts: true,
};

const BRANDING_DEFAULTS: BrandingSettings = {
  theme: "claro",
  primaryColor: "#0db8c2", // teal — casa com o token --color-brand-500
  accentColor: "#0be0ae", // verde — casa com o token --color-accent (default = sem mudança)
  logoUrl: null,
};

const DEFAULTS: ClinicSettings = {
  clinicName: "Clínica Médica São Lucas",
  cnpj: "12.345.678/0001-99",
  phone: "(11) 3456-7890",
  email: "contato@clinicasaolucas.com.br",
  address: "Rua das Flores, 123 - São Paulo/SP",
  cep: "01234-567",
  businessHours: "08:00 às 18:00",
  language: "pt-BR",
  timezone: "gmt-3",
  dateFormat: "dmy",
  timeFormat: "24h",
  currency: "brl",
  totemEnabled: false,
  notifyEmail: true,
  notifySms: false,
  notifyPush: true,
  twoFactor: false,
  passwordPolicy: "media",
  backupFrequency: "diario",
  backupRetentionDays: 30,
  security: SECURITY_DEFAULTS,
  backup: BACKUP_DEFAULTS,
  notifications: NOTIFICATION_DEFAULTS,
  branding: BRANDING_DEFAULTS,
};

/** Lê um objeto JSONB cru (pode vir como string/objeto/null) num record. */
function asObject(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  return {};
}

const bool = (v: unknown, fb: boolean): boolean =>
  typeof v === "boolean" ? v : fb;
const str = (v: unknown, fb: string): string =>
  typeof v === "string" && v.length > 0 ? v : fb;
const num = (v: unknown, fb: number): number =>
  v == null || Number.isNaN(Number(v)) ? fb : Number(v);

function mapSecurity(raw: unknown, legacy: { twoFactor: boolean; passwordPolicy: string }): SecuritySettings {
  const o = asObject(raw);
  return {
    twoFactor: bool(o.twoFactor, legacy.twoFactor),
    passwordPolicy: str(o.passwordPolicy, legacy.passwordPolicy),
    sessionTimeoutMin: num(o.sessionTimeoutMin, SECURITY_DEFAULTS.sessionTimeoutMin),
  };
}

function mapBackup(raw: unknown, legacy: { frequency: string; retentionDays: number }): BackupSettings {
  const o = asObject(raw);
  return {
    frequency: str(o.frequency, legacy.frequency),
    retentionDays: num(o.retentionDays, legacy.retentionDays),
    lastRunAt: typeof o.lastRunAt === "string" ? o.lastRunAt : null,
  };
}

function mapNotifications(raw: unknown): NotificationSettings {
  const o = asObject(raw);
  return {
    emailNewAppointment: bool(o.emailNewAppointment, NOTIFICATION_DEFAULTS.emailNewAppointment),
    confirmOneDayBefore: bool(o.confirmOneDayBefore, NOTIFICATION_DEFAULTS.confirmOneDayBefore),
    smsTwoHoursBefore: bool(o.smsTwoHoursBefore, NOTIFICATION_DEFAULTS.smsTwoHoursBefore),
    whatsappResults: bool(o.whatsappResults, NOTIFICATION_DEFAULTS.whatsappResults),
    stockAlerts: bool(o.stockAlerts, NOTIFICATION_DEFAULTS.stockAlerts),
    invoiceAlerts: bool(o.invoiceAlerts, NOTIFICATION_DEFAULTS.invoiceAlerts),
  };
}

function mapBranding(raw: unknown): BrandingSettings {
  const o = asObject(raw);
  return {
    theme: str(o.theme, BRANDING_DEFAULTS.theme),
    primaryColor: str(o.primaryColor, BRANDING_DEFAULTS.primaryColor),
    accentColor: str(o.accentColor, BRANDING_DEFAULTS.accentColor),
    logoUrl: typeof o.logoUrl === "string" && o.logoUrl.length > 0 ? o.logoUrl : null,
  };
}

/**
 * Carrega as configurações da clínica (linha única). Default no modo demo/sem
 * dados. `cache()` deduplica por request (lido no root layout, no app layout e
 * na página de Configurações).
 */
export const getSettings = cache(async (): Promise<ClinicSettings> => {
  if (isDemoMode()) return DEFAULTS;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("clinic_settings")
    .select("*")
    .limit(1)
    .maybeSingle();

  if (error || !data) return DEFAULTS;

  const legacyTwoFactor = data.two_factor ?? DEFAULTS.twoFactor;
  const legacyPasswordPolicy =
    (data.password_policy as string | null) ?? DEFAULTS.passwordPolicy;
  const legacyBackupFreq =
    (data.backup_frequency as string | null) ?? DEFAULTS.backupFrequency;
  const legacyBackupRet = Number(
    data.backup_retention_days ?? DEFAULTS.backupRetentionDays,
  );

  return {
    clinicName: (data.clinic_name as string | null) ?? DEFAULTS.clinicName,
    cnpj: (data.cnpj as string | null) ?? DEFAULTS.cnpj,
    phone: (data.phone as string | null) ?? DEFAULTS.phone,
    email: (data.email as string | null) ?? DEFAULTS.email,
    address: (data.address as string | null) ?? DEFAULTS.address,
    cep: (data.cep as string | null) ?? DEFAULTS.cep,
    businessHours: (data.business_hours as string | null) ?? DEFAULTS.businessHours,
    language: (data.language as string | null) ?? DEFAULTS.language,
    timezone: (data.timezone as string | null) ?? DEFAULTS.timezone,
    dateFormat: (data.date_format as string | null) ?? DEFAULTS.dateFormat,
    timeFormat: (data.time_format as string | null) ?? DEFAULTS.timeFormat,
    currency: (data.currency as string | null) ?? DEFAULTS.currency,
    totemEnabled: data.totem_enabled ?? DEFAULTS.totemEnabled,
    notifyEmail: data.notify_email ?? DEFAULTS.notifyEmail,
    notifySms: data.notify_sms ?? DEFAULTS.notifySms,
    notifyPush: data.notify_push ?? DEFAULTS.notifyPush,
    twoFactor: legacyTwoFactor,
    passwordPolicy: legacyPasswordPolicy,
    backupFrequency: legacyBackupFreq,
    backupRetentionDays: legacyBackupRet,
    security: mapSecurity(data.security, {
      twoFactor: legacyTwoFactor,
      passwordPolicy: legacyPasswordPolicy,
    }),
    backup: mapBackup(data.backup, {
      frequency: legacyBackupFreq,
      retentionDays: legacyBackupRet,
    }),
    notifications: mapNotifications(data.notifications),
    branding: mapBranding(data.branding),
  };
});

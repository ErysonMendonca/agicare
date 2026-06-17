"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/supabase/config";
import { requireClinic } from "@/lib/tenant";
import { enviarNotificacao } from "@/lib/integrations/notifications";

/** Estado padrão das ações da agenda (estende o ActionState com o protocolo). */
export type AgendaActionState =
  | { error?: string; ok?: boolean; protocol?: string }
  | undefined;

/** Slot de horário exibido na grade de seleção (passo 2 do agendamento). */
export type Slot = { hora: string; ocupado: boolean };

/** Revalida as rotas afetadas por mudanças na agenda. */
function revalidateAgenda() {
  revalidatePath("/agenda");
  revalidatePath("/dashboard");
}

/** Combina data (yyyy-mm-dd) + hora (HH:mm) num ISO local. */
function toIso(date: string, time: string): string {
  return new Date(`${date}T${time}:00`).toISOString();
}

/** Soma minutos a um ISO e devolve novo ISO. */
function addMinutes(iso: string, minutes: number): string {
  return new Date(new Date(iso).getTime() + minutes * 60_000).toISOString();
}

/** Protocolo legível p/ o comprovante (ex.: AGD-20260612-4821). */
function gerarProtocolo(): string {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(
    d.getDate(),
  ).padStart(2, "0")}`;
  const rnd = String(Math.floor(1000 + Math.random() * 9000));
  return `AGD-${ymd}-${rnd}`;
}

// ════════════════════════════════════════════════════════════════
// Novo agendamento
// ════════════════════════════════════════════════════════════════
const createSchema = z.object({
  patient_id: z.string().min(1, "Selecione o paciente."),
  professional_id: z.string().min(1, "Selecione o profissional."),
  specialty: z.string().trim().optional().or(z.literal("")),
  service_type: z.string().trim().optional().or(z.literal("")),
  date: z.string().min(1, "Informe a data."),
  time: z.string().min(1, "Selecione o horário."),
  slot_minutes: z.coerce.number().int().positive().default(30),
  reason: z.string().trim().optional().or(z.literal("")),
});

export type CreateAppointmentInput = z.input<typeof createSchema>;

/** Cria um agendamento em `appointments`. Devolve o protocolo p/ o comprovante. */
export async function createAppointment(
  input: CreateAppointmentInput,
): Promise<AgendaActionState> {
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const protocol = gerarProtocolo();
  if (isDemoMode()) return { ok: true, protocol };

  const d = parsed.data;
  const startsAt = toIso(d.date, d.time);
  const endsAt = addMinutes(startsAt, d.slot_minutes);

  const clinicId = await requireClinic();
  const supabase = await createClient();
  const { error } = await supabase.from("appointments").insert({
    clinic_id: clinicId,
    patient_id: d.patient_id,
    professional_id: d.professional_id,
    starts_at: startsAt,
    ends_at: endsAt,
    status: "agendado",
    reason: d.reason || (d.service_type ? d.service_type : null),
  });

  if (error) return { error: error.message };

  revalidateAgenda();
  return { ok: true, protocol };
}

// ════════════════════════════════════════════════════════════════
// Manutenção de agendamentos
// ════════════════════════════════════════════════════════════════
const idSchema = z.string().min(1, "Agendamento inválido.");

/** Atualiza um agendamento existente (helper interno). */
async function updateAppointment(
  id: string,
  patch: Record<string, unknown>,
): Promise<AgendaActionState> {
  if (isDemoMode()) return { ok: true };

  const supabase = await createClient();
  const { error } = await supabase.from("appointments").update(patch).eq("id", id);
  if (error) return { error: error.message };

  revalidateAgenda();
  return { ok: true };
}

/** Cancela um agendamento (→ status cancelado). */
export async function cancelAppointment(
  id: string,
  motivo?: string,
): Promise<AgendaActionState> {
  const parsed = idSchema.safeParse(id);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  return updateAppointment(parsed.data, {
    status: "cancelado",
    reason: motivo?.trim() || null,
  });
}

const remarcarSchema = z.object({
  id: idSchema,
  date: z.string().min(1, "Informe a nova data."),
  time: z.string().min(1, "Informe o novo horário."),
  slot_minutes: z.coerce.number().int().positive().default(30),
});

/** Remarca um agendamento (troca data e hora). */
export async function remarcarAppointment(
  input: z.input<typeof remarcarSchema>,
): Promise<AgendaActionState> {
  const parsed = remarcarSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  const d = parsed.data;
  const startsAt = toIso(d.date, d.time);
  return updateAppointment(d.id, {
    starts_at: startsAt,
    ends_at: addMinutes(startsAt, d.slot_minutes),
    status: "agendado",
  });
}

const trocarSchema = z.object({
  id: idSchema,
  professional_id: z.string().min(1, "Selecione o profissional."),
  specialty: z.string().trim().optional().or(z.literal("")),
});

/** Troca o profissional (e opcionalmente a especialidade) de um agendamento. */
export async function trocarProfissional(
  input: z.input<typeof trocarSchema>,
): Promise<AgendaActionState> {
  const parsed = trocarSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  return updateAppointment(parsed.data.id, {
    professional_id: parsed.data.professional_id,
  });
}

// ════════════════════════════════════════════════════════════════
// Escala de horários
// ════════════════════════════════════════════════════════════════
const escalaSchema = z.object({
  description: z.string().trim().min(2, "Informe a descrição."),
  professional_id: z.string().trim().optional().or(z.literal("")),
  specialty: z.string().trim().optional().or(z.literal("")),
  service_type: z.string().trim().optional().or(z.literal("")),
  slot_minutes: z.coerce.number().int().positive().default(30),
  overbook_limit: z.coerce.number().int().min(0).default(0),
  weekdays: z.array(z.coerce.number().int().min(0).max(6)).default([]),
  start_time: z.string().min(1, "Informe o horário inicial."),
  end_time: z.string().min(1, "Informe o horário final."),
});

export type EscalaInput = z.input<typeof escalaSchema>;

/** Cria uma escala de horários (configuração de grade). Devolve o código no protocolo. */
export async function createSchedule(
  input: EscalaInput,
): Promise<AgendaActionState> {
  const parsed = escalaSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const d = parsed.data;
  const code = `ESC-${String(Math.floor(1000 + Math.random() * 9000))}`;
  if (isDemoMode()) return { ok: true, protocol: code };

  const clinicId = await requireClinic();
  const supabase = await createClient();
  const { error } = await supabase.from("schedules").insert({
    clinic_id: clinicId,
    code,
    description: d.description,
    professional_id: d.professional_id || null,
    specialty: d.specialty || null,
    service_type: d.service_type || null,
    slot_minutes: d.slot_minutes,
    overbook_limit: d.overbook_limit,
    weekdays: d.weekdays,
    start_time: d.start_time,
    end_time: d.end_time,
  });

  if (error) return { error: error.message };

  revalidateAgenda();
  return { ok: true, protocol: code };
}

// ════════════════════════════════════════════════════════════════
// Bloqueios de horário (escala) — persistência em schedule_blocks
// ════════════════════════════════════════════════════════════════

/** Bloqueio devolvido p/ a UI (sincroniza o estado do modal de escala). */
export type Bloqueio = {
  id: string;
  professionalId: string;
  blockDate: string;
  hora: string;
  motivo: string;
};

/** Lista bloqueios de um profissional numa data (action chamável do client). */
export async function listBlocks(
  professionalId: string,
  dateISO: string,
): Promise<Bloqueio[]> {
  if (!professionalId || !dateISO) return [];
  if (isDemoMode()) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("schedule_blocks")
    .select("id, professional_id, block_date, start_time, reason")
    .eq("professional_id", professionalId)
    .eq("block_date", dateISO);

  if (error || !data) return [];
  return data.map((r) => ({
    id: r.id as string,
    professionalId: (r.professional_id as string | null) ?? "",
    blockDate: String(r.block_date),
    hora: String(r.start_time).slice(0, 5),
    motivo: (r.reason as string | null) ?? "",
  }));
}

const blockSchema = z.object({
  professional_id: z.string().min(1, "Selecione o profissional."),
  date: z.string().min(1, "Informe a data."),
  time: z.string().min(1, "Informe o horário."),
  reason: z.string().trim().optional().or(z.literal("")),
});

/** Cria um bloqueio de horário (→ schedule_blocks). Devolve o id criado no protocolo. */
export async function createBlock(
  input: z.input<typeof blockSchema>,
): Promise<AgendaActionState> {
  const parsed = blockSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  if (isDemoMode()) return { ok: true };

  const d = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("schedule_blocks")
    .insert({
      professional_id: d.professional_id,
      block_date: d.date,
      start_time: d.time,
      reason: d.reason || "Bloqueio manual",
    })
    .select("id")
    .single();

  if (error) return { error: error.message };

  revalidateAgenda();
  return { ok: true, protocol: (data?.id as string) ?? undefined };
}

/** Remove um bloqueio de horário pelo id. */
export async function removeBlock(id: string): Promise<AgendaActionState> {
  const parsed = idSchema.safeParse(id);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  if (isDemoMode()) return { ok: true };

  const supabase = await createClient();
  const { error } = await supabase
    .from("schedule_blocks")
    .delete()
    .eq("id", parsed.data);

  if (error) return { error: error.message };

  revalidateAgenda();
  return { ok: true };
}

// ════════════════════════════════════════════════════════════════
// Comprovante — envio (STUB local; não chama serviço externo real)
// ════════════════════════════════════════════════════════════════
const comprovanteSchema = z.object({
  channel: z.enum(["sms", "email"]),
  protocol: z.string().trim().min(1, "Protocolo inválido."),
  patient_id: z.string().trim().optional().or(z.literal("")),
  to: z.string().trim().optional().or(z.literal("")),
});

/**
 * Envia o comprovante (SMS/e-mail) através da camada de INTEGRAÇÕES.
 *
 * Duas gravações, com papéis distintos:
 *  1) `appointment_notifications` → registro de DOMÍNIO da agenda (continuidade).
 *  2) dispatcher `enviarNotificacao` → registra em `notification_log` e DISPARA
 *     via provider real SE configurado (env). Sem provider, marca pendente/
 *     nao_configurado — nunca finge envio. Só status 'erro' falha a ação.
 */
export async function enviarComprovante(
  input: z.input<typeof comprovanteSchema>,
): Promise<AgendaActionState> {
  const parsed = comprovanteSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  const d = parsed.data;

  // Mapeia o canal do comprovante ao toggle correspondente em
  // clinic_settings.notifications (canal desligado pelo gestor → não dispara).
  const evento =
    d.channel === "email" ? "emailNewAppointment" : "smsTwoHoursBefore";

  if (isDemoMode()) {
    // Em demo não há banco/provider: apenas resolve o status que ocorreria
    // (respeitando os toggles padrão de notificação).
    await enviarNotificacao({
      canal: d.channel,
      destino: d.to || "demo@local",
      template: "comprovante_agendamento",
      payload: { protocolo: d.protocol },
      protocol: d.protocol,
      evento,
    });
    return { ok: true };
  }

  // Sem destino não há como enviar nem auditar com sentido.
  if (!d.to) {
    return {
      error:
        d.channel === "sms"
          ? "Paciente sem telefone cadastrado para SMS."
          : "Paciente sem e-mail cadastrado.",
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("appointment_notifications").insert({
    channel: d.channel,
    protocol: d.protocol,
    patient_id: d.patient_id || null,
    recipient: d.to || null,
    sent_at: new Date().toISOString(),
  });
  if (error) return { error: error.message };

  // Dispatcher real (registra em notification_log + dispara se configurado).
  const res = await enviarNotificacao({
    canal: d.channel,
    destino: d.to,
    template: "comprovante_agendamento",
    payload: { protocolo: d.protocol },
    protocol: d.protocol,
    patientId: d.patient_id || undefined,
    evento,
  });

  if (res.status === "erro") {
    return { error: res.error ?? "Falha ao enviar o comprovante." };
  }
  // Canal desligado nas configurações: avisa o operador (não houve envio).
  if (res.status === "desativado") {
    return {
      error:
        d.channel === "email"
          ? "Notificações por e-mail estão desativadas nas configurações."
          : "Notificações por SMS estão desativadas nas configurações.",
    };
  }
  return { ok: true };
}

// ════════════════════════════════════════════════════════════════
// Grade de horários disponíveis (passo 2 do agendamento)
// ════════════════════════════════════════════════════════════════

/** Gera horários "HH:mm" entre início e fim, com passo em minutos. */
function gerarHorarios(start: string, end: string, stepMin: number): string[] {
  const toMin = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    return (h || 0) * 60 + (m || 0);
  };
  const out: string[] = [];
  const fim = toMin(end);
  for (let cur = toMin(start); cur < fim; cur += stepMin) {
    out.push(
      `${String(Math.floor(cur / 60)).padStart(2, "0")}:${String(cur % 60).padStart(2, "0")}`,
    );
  }
  return out;
}

/** Grade padrão (fallback): 08:00–18:00 a cada 30 min. */
function gradePadrao(): string[] {
  return gerarHorarios("08:00", "18:00", 30);
}

/**
 * Lista os horários (grade) para um profissional numa data, marcando ocupados.
 * Demo: grade padrão com alguns horários simulados como ocupados.
 * Real: deriva de `schedules` (dia da semana) + ocupação por `appointments`/`schedule_blocks`.
 */
export async function listSlots(
  professionalId: string,
  dateISO: string,
): Promise<Slot[]> {
  if (!professionalId || !dateISO) return [];

  if (isDemoMode()) {
    const ocupados = new Set(["09:00", "10:30", "11:00", "14:30", "16:00"]);
    return gradePadrao().map((hora) => ({ hora, ocupado: ocupados.has(hora) }));
  }

  const supabase = await createClient();
  const weekday = new Date(`${dateISO}T00:00:00`).getDay(); // 0=Dom..6=Sáb

  // Escala que cobre esse profissional e dia da semana.
  const { data: escalas } = await supabase
    .from("schedules")
    .select("slot_minutes, weekdays, start_time, end_time, active")
    .eq("professional_id", professionalId)
    .eq("active", true);

  const escala = (escalas ?? []).find((e) =>
    Array.isArray(e.weekdays) ? e.weekdays.includes(weekday) : false,
  );

  const horarios = escala
    ? gerarHorarios(
        String(escala.start_time).slice(0, 5),
        String(escala.end_time).slice(0, 5),
        Number(escala.slot_minutes) || 30,
      )
    : gradePadrao();

  // Ocupação: agendamentos do dia + bloqueios.
  const dayStart = toIso(dateISO, "00:00");
  const dayEnd = addMinutes(toIso(dateISO, "00:00"), 24 * 60);

  const { data: ags } = await supabase
    .from("appointments")
    .select("starts_at, status")
    .eq("professional_id", professionalId)
    .gte("starts_at", dayStart)
    .lt("starts_at", dayEnd);

  const { data: blocks } = await supabase
    .from("schedule_blocks")
    .select("start_time")
    .eq("professional_id", professionalId)
    .eq("block_date", dateISO);

  const ocupados = new Set<string>();
  for (const a of ags ?? []) {
    if (a.status === "cancelado") continue;
    const d = new Date(a.starts_at as string);
    ocupados.add(
      `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`,
    );
  }
  for (const b of blocks ?? []) {
    ocupados.add(String(b.start_time).slice(0, 5));
  }

  return horarios.map((hora) => ({ hora, ocupado: ocupados.has(hora) }));
}

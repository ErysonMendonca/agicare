"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/supabase/config";
import { requireClinic } from "@/lib/tenant";
import { enviarNotificacao } from "@/lib/integrations/notifications";
import { logAction } from "@/lib/system-log";
import { EXAMES_TUSS } from "@/lib/clinico/exames-shared";
import { listProcedures } from "@/lib/data/procedures";

/** Estado padrão das ações da agenda (estende o ActionState com o protocolo). */
export type AgendaActionState =
  | { error?: string; ok?: boolean; protocol?: string }
  | undefined;

/** Slot de horário exibido na grade de seleção (passo 2 do agendamento). */
export type Slot = { hora: string; ocupado: boolean };

/**
 * Grade de horários + a duração padrão do slot (slot_minutes da escala).
 * A UI usa `slotMinutes` como duração default do agendamento.
 */
export type SlotGrid = { slots: Slot[]; slotMinutes: number };

/** Revalida as rotas afetadas por mudanças na agenda. */
function revalidateAgenda() {
  revalidatePath("/agenda");
  revalidatePath("/dashboard");
}

/** Combina data (yyyy-mm-dd) + hora (HH:mm) num ISO local. */
function toIso(date: string, time: string): string {
  return new Date(`${date}T${time}:00`).toISOString();
}

/** Fuso da clínica (BR). O servidor pode rodar em UTC; comparar horários de
 *  parede (wall-clock) neste fuso evita o falso "já passou". */
const TZ_CLINICA = "America/Sao_Paulo";

/**
 * O agendamento (`date`+`time`) está no passado em relação ao AGORA do fuso da
 * clínica? Compara wall-clock vs wall-clock (string ISO "YYYY-MM-DDTHH:mm"), o
 * que é correto mesmo quando o servidor roda em UTC — antes, `Date.now()` (UTC)
 * marcava 18:20 como "passado" às 16:00 BRT (servidor 3h à frente).
 */
function horarioNoPassado(date: string, time: string): boolean {
  const agoraLocal = new Date()
    .toLocaleString("sv-SE", { timeZone: TZ_CLINICA }) // "YYYY-MM-DD HH:mm:ss"
    .slice(0, 16)
    .replace(" ", "T"); // "YYYY-MM-DDTHH:mm"
  return `${date}T${time}` < agoraLocal;
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
const createSchema = z
  .object({
    patient_id: z.string().min(1, "Selecione o paciente."),
    professional_id: z.string().trim().optional().or(z.literal("")),
    specialty: z.string().trim().optional().or(z.literal("")),
    service_type: z.string().trim().optional().or(z.literal("")),
    date: z.string().min(1, "Informe a data."),
    time: z.string().min(1, "Selecione o horário."),
    slot_minutes: z.coerce.number().int().positive().default(30),
    reason: z.string().trim().optional().or(z.literal("")),
  })
  // Profissional é opcional (agendamento por especialidade). Sem profissional,
  // a especialidade passa a ser obrigatória para classificar o atendimento.
  .refine(
    (d) => {
      const type = d.service_type || "Consulta";
      if (type === "Consulta" || type === "Retorno") {
        return Boolean(d.specialty?.trim());
      }
      return true;
    },
    {
      message: "Selecione a especialidade.",
      path: ["specialty"],
    },
  );

export type CreateAppointmentInput = z.input<typeof createSchema>;

/** Cria um agendamento em `appointments`. Devolve o protocolo p/ o comprovante. */
/**
 * Valida se um dia/horário está disponível na escala e desocupado.
 */
async function validarDisponibilidadeHorario(
  supabase: any,
  dateISO: string,
  timeHHMM: string,
  professionalId: string | null,
  specialty: string | null,
  excludeAppointmentId?: string,
): Promise<{ ok: boolean; error?: string }> {
  const weekday = new Date(`${dateISO}T00:00:00`).getDay(); // 0=Dom..6=Sáb

  // 1) Resolve especialidade do profissional se professionalId estiver preenchido e specialty não
  let especialidade = specialty ?? "";
  if (professionalId && !especialidade) {
    const { data: prof } = await supabase
      .from("professionals")
      .select("specialty")
      .eq("id", professionalId)
      .maybeSingle();
    especialidade = (prof?.specialty as string | null) ?? "";
  }

  // 2) Busca escalas ativas da clínica
  const { data: escalas } = await supabase
    .from("schedules")
    .select(
      "professional_id, specialty, slot_minutes, weekdays, start_time, end_time, week_hours, active, start_date, end_date, recurring_blocks",
    )
    .eq("active", true);

  // Encontra a escala que cobre o profissional ou a especialidade neste dia da semana e período
  const escala = (escalas ?? []).find(
    (e: any) =>
      ((professionalId && e.professional_id === professionalId) ||
        (especialidade && e.specialty === especialidade)) &&
      (Array.isArray(e.weekdays) ? e.weekdays.includes(weekday) : false) &&
      naVigencia(dateISO, e.start_date, e.end_date),
  );

  if (!escala) {
    return { ok: false, error: "Não há escala de atendimento ativa para este dia/especialidade." };
  }

  const slotMinutes = Number(escala.slot_minutes) || 30;
  const faixa = faixaDoDia(
    weekday,
    {
      start: String(escala.start_time).slice(0, 5),
      end: String(escala.end_time).slice(0, 5),
    },
    escala.week_hours,
  );

  if (!faixa) {
    return { ok: false, error: "Não há horário definido na escala para este dia." };
  }

  // 3) Verifica se o horário está contido na grade gerada
  const horarios = gerarHorarios(faixa.start, faixa.end, slotMinutes);
  if (!horarios.includes(timeHHMM)) {
    return { ok: false, error: "O horário selecionado não existe na escala de atendimento." };
  }

  // 4) Verifica bloqueios manuais na agenda
  const { data: blocks } = await supabase
    .from("schedule_blocks")
    .select("start_time")
    .eq("block_date", dateISO)
    .eq("start_time", `${timeHHMM}:00`);

  if (blocks && blocks.length > 0) {
    return { ok: false, error: "Este horário está bloqueado na agenda do profissional." };
  }

  // Verifica bloqueios recorrentes/específicos da escala
  const bloqueados = new Set<string>();
  for (const r of faixa.blocks ?? []) bloqueados.add(r.time);
  for (const r of parseRecurringBlocks(escala.recurring_blocks)) bloqueados.add(r.time);

  if (bloqueados.has(timeHHMM)) {
    return { ok: false, error: "Este horário está bloqueado na escala de atendimento." };
  }

  // 5) Verifica se há agendamentos sobrepostos
  const newStart = toIso(dateISO, timeHHMM);
  const newEnd = addMinutes(newStart, slotMinutes);

  let query = supabase
    .from("appointments")
    .select("id, starts_at, ends_at, status")
    .neq("status", "cancelado")
    .neq("status", "desistencia")
    .lt("starts_at", newEnd)
    .gt("ends_at", newStart);

  if (excludeAppointmentId) {
    query = query.neq("id", excludeAppointmentId);
  }

  if (professionalId) {
    query = query.eq("professional_id", professionalId);
  } else if (especialidade) {
    query = query.eq("specialty", especialidade);
  }

  const { data: ags } = await query;
  if (ags && ags.length > 0) {
    return { ok: false, error: "Este horário já está ocupado por outro paciente agendado." };
  }

  return { ok: true };
}

export async function createAppointment(
  input: CreateAppointmentInput,
): Promise<AgendaActionState> {
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const d = parsed.data;
  const startsAt = toIso(d.date, d.time);
  // Não permite agendar no passado (vale tanto no demo quanto no real).
  if (horarioNoPassado(d.date, d.time)) {
    return { error: "Não é possível agendar em um horário que já passou." };
  }
  const endsAt = addMinutes(startsAt, d.slot_minutes);

  const protocol = gerarProtocolo();
  if (isDemoMode()) return { ok: true, protocol };

  const clinicId = await requireClinic();
  const supabase = await createClient();

  const disp = await validarDisponibilidadeHorario(
    supabase,
    d.date,
    d.time,
    d.professional_id || null,
    d.specialty || null,
  );
  if (!disp.ok) return { error: disp.error };

  const { error } = await supabase.from("appointments").insert({
    clinic_id: clinicId,
    patient_id: d.patient_id,
    professional_id: d.professional_id?.trim() || null,
    specialty: d.specialty?.trim() || null,
    service_type: d.service_type?.trim() || null,
    starts_at: startsAt,
    ends_at: endsAt,
    status: "agendado",
    reason: d.reason || (d.service_type ? d.service_type : null),
  });

  if (error) return { error: error.message };

  await logAction({
    action: "create",
    module: "agenda",
    summary: `Criou agendamento (protocolo ${protocol})`,
    entity: "appointment",
    entityId: d.patient_id,
    metadata: { protocol },
  });
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
  const res = await updateAppointment(parsed.data, {
    status: "cancelado",
    reason: motivo?.trim() || null,
  });
  if (res?.ok) {
    await logAction({
      action: "update",
      module: "agenda",
      summary: "Cancelou um agendamento",
      entity: "appointment",
      entityId: parsed.data,
    });
  }
  return res;
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
  // Não permite remarcar para um horário que já passou.
  if (horarioNoPassado(d.date, d.time)) {
    return { error: "Não é possível remarcar para um horário que já passou." };
  }

  if (isDemoMode()) {
    return await updateAppointment(d.id, {
      starts_at: startsAt,
      ends_at: addMinutes(startsAt, d.slot_minutes),
      status: "agendado",
    });
  }

  const supabase = await createClient();
  // Busca o profissional e especialidade atuais do agendamento
  const { data: apt } = await supabase
    .from("appointments")
    .select("professional_id, specialty")
    .eq("id", d.id)
    .maybeSingle();

  if (!apt) {
    return { error: "Agendamento não encontrado." };
  }

  // Valida disponibilidade de horário/escala (excluindo este próprio agendamento da checagem de sobreposição)
  const disp = await validarDisponibilidadeHorario(
    supabase,
    d.date,
    d.time,
    apt.professional_id,
    apt.specialty,
    d.id,
  );
  if (!disp.ok) return { error: disp.error };

  const res = await updateAppointment(d.id, {
    starts_at: startsAt,
    ends_at: addMinutes(startsAt, d.slot_minutes),
    status: "agendado",
  });
  if (res?.ok) {
    await logAction({
      action: "update",
      module: "agenda",
      summary: "Remarcou um agendamento",
      entity: "appointment",
      entityId: d.id,
    });
  }
  return res;
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
  const patch: Record<string, unknown> = {
    professional_id: parsed.data.professional_id,
  };
  // Sincroniza a especialidade do agendamento com a do profissional atribuído
  // (relevante p/ agendamentos criados por especialidade, antes "A definir").
  if (parsed.data.specialty?.trim()) patch.specialty = parsed.data.specialty.trim();
  const res = await updateAppointment(parsed.data.id, patch);
  if (res?.ok) {
    await logAction({
      action: "update",
      module: "agenda",
      summary: "Trocou o profissional de um agendamento",
      entity: "appointment",
      entityId: parsed.data.id,
    });
  }
  return res;
}

// ════════════════════════════════════════════════════════════════
// Escala de horários
// ════════════════════════════════════════════════════════════════
const escalaSchema = z.object({
  description: z.string().trim().min(2, "Informe a descrição."),
  // Escala é por ESPECIALIDADE (não por profissional). professional_id mantido
  // no schema por compatibilidade, mas ignorado (gravado null).
  professional_id: z.string().trim().optional().or(z.literal("")),
  specialty: z.string().trim().optional().or(z.literal("")),
  service_type: z.string().trim().optional().or(z.literal("")),
  slot_minutes: z.coerce.number().int().positive().default(30),
  overbook_limit: z.coerce.number().int().min(0).default(0),
  weekdays: z.array(z.coerce.number().int().min(0).max(6)).default([]),
  start_time: z.string().min(1, "Informe o horário inicial."),
  end_time: z.string().min(1, "Informe o horário final."),
  // Horário próprio por dia da semana ("0".."6" → {start,end} em HH:MM). Só os
  // dias com horário diferente do base. Vazio = horário uniforme (base).
  week_hours: z
    .record(
      z.string().regex(/^[0-6]$/),
      z.object({
        start: z.string().regex(/^\d{2}:\d{2}$/, "Horário inicial inválido."),
        end: z.string().regex(/^\d{2}:\d{2}$/, "Horário final inválido."),
        // Bloqueios SÓ deste dia (fixos). Opcional/retrocompatível.
        blocks: z
          .array(
            z.object({
              time: z.string().regex(/^\d{2}:\d{2}$/, "Horário inválido."),
              reason: z.string().trim().default(""),
            }),
          )
          .optional(),
      }),
    )
    .default({}),
  // Vigência da escala (obrigatória): a grade só vale dentro do período.
  start_date: z.string().min(1, "Informe a data inicial."),
  end_date: z.string().min(1, "Informe a data final."),
  // Itens atendidos pela escala (conforme o Tipo de Escala).
  procedure_codes: z.array(z.string().trim()).default([]),
  exam_tuss_codes: z.array(z.string().trim()).default([]),
  // Bloqueios fixos/recorrentes (valem em todos os dias da escala).
  recurring_blocks: z
    .array(
      z.object({
        time: z.string().regex(/^\d{2}:\d{2}$/, "Horário inválido."),
        reason: z.string().trim().default(""),
      }),
    )
    .default([]),
  lateralidade: z.string().trim().optional().or(z.literal("")),
  obs: z.string().trim().optional().or(z.literal("")),
});

/** Valida o período: data final não pode ser anterior à inicial (datas ISO). */
function periodoInvalido(d: { start_date: string; end_date: string }): boolean {
  return d.end_date < d.start_date;
}

/** "YYYY-MM-DD" → "dd/mm/aaaa" (para mensagens ao usuário). */
function dataBR(iso: unknown): string {
  const s = String(iso ?? "").slice(0, 10);
  const [y, m, d] = s.split("-");
  return y && m && d ? `${d}/${m}/${y}` : s;
}

/**
 * Escala ÚNICA por especialidade: procura uma escala ATIVA da MESMA especialidade
 * cuja vigência SE SOBREPÕE ao período [start_date, end_date] informado. Ignora a
 * própria escala (excludeId) na edição. Sobreposição: a.start <= b.end && b.start
 * <= a.end (datas "YYYY-MM-DD" comparadas como string). RLS escopa por clínica.
 * Devolve a escala conflitante (code + período) ou null.
 */
async function escalaConflitante(
  supabase: Awaited<ReturnType<typeof createClient>>,
  clinicId: string,
  specialty: string,
  start_date: string,
  end_date: string,
  excludeId?: string,
): Promise<{ code: string; start: string; end: string } | null> {
  const { data } = await supabase
    .from("schedules")
    .select("id, code, start_date, end_date")
    .eq("clinic_id", clinicId) // defesa em profundidade (além da RLS)
    .eq("specialty", specialty)
    .eq("active", true);

  const hit = (data ?? []).find((e) => {
    if (excludeId && e.id === excludeId) return false;
    const s = String(e.start_date ?? "").slice(0, 10);
    const en = String(e.end_date ?? "").slice(0, 10);
    // Escala legada SEM vigência definida não entra no conflito (evita bloquear
    // tudo e mensagem quebrada). Só conta quando o período está completo.
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || !/^\d{4}-\d{2}-\d{2}$/.test(en))
      return false;
    return s <= end_date && start_date <= en;
  });

  return hit
    ? { code: (hit.code as string | null) ?? "escala", start: String(hit.start_date), end: String(hit.end_date) }
    : null;
}

/** Mensagem padrão de conflito de escala (mesma especialidade, período sobreposto). */
function msgConflitoEscala(c: { code: string; start: string; end: string }): string {
  return `Já existe uma escala ativa desta especialidade no período (${c.code}, de ${dataBR(c.start)} a ${dataBR(c.end)}). Ajuste o período ou desative a escala existente.`;
}

/**
 * Procura um agendamento de paciente NÃO cancelado que dependa desta escala
 * (mesma especialidade + horário dentro da vigência e nos dias da semana da
 * escala — o vínculo appointment↔escala é lógico, não por schedule_id). Usado
 * para bloquear a alteração da escala quando já há paciente marcado. Devolve o
 * primeiro (nome do paciente + data/hora) ou null. RLS escopa por clínica.
 */
async function agendamentoDependenteDaEscala(
  supabase: Awaited<ReturnType<typeof createClient>>,
  escala: {
    id: string;
    specialty: string | null;
    professional_id: string | null;
    service_type: string | null;
    procedure_codes: string[] | null;
    exam_tuss_codes: string[] | null;
    start_date: unknown;
    end_date: unknown;
    weekdays: unknown;
  },
): Promise<{ paciente: string; quando: string } | null> {
  const s = escala.start_date ? String(escala.start_date).slice(0, 10) : "";
  const e = escala.end_date ? String(escala.end_date).slice(0, 10) : "";
  const dias: number[] = Array.isArray(escala.weekdays)
    ? (escala.weekdays as number[])
    : [];

  let q = supabase
    .from("appointments")
    .select("starts_at, status, reason, service_type, specialty, professional_id, patients(full_name)")
    .neq("status", "cancelado")
    .order("starts_at", { ascending: true });

  if (s) q = q.gte("starts_at", `${s}T00:00:00`);
  if (e) q = q.lte("starts_at", `${e}T23:59:59`);

  const { data } = await q;

  for (const a of data ?? []) {
    const iso = String((a as { starts_at?: unknown }).starts_at ?? "");
    if (!iso) continue;
    if (dias.length > 0) {
      const wd = new Date(iso).getDay();
      if (!dias.includes(wd)) continue;
    }

    let matches = false;
    const sType = a.service_type;

    if (escala.service_type === "Procedimento") {
      if (sType === "Procedimento" && escala.procedure_codes && escala.procedure_codes.length > 0) {
        const reasonText = String(a.reason || "").toLowerCase();
        matches = escala.procedure_codes.some((code) => {
          return reasonText.includes(code.toLowerCase());
        });
      }
    } else if (escala.service_type === "Exame") {
      if (sType === "Exame" && escala.exam_tuss_codes && escala.exam_tuss_codes.length > 0) {
        const reasonText = String(a.reason || "").toLowerCase();
        matches = escala.exam_tuss_codes.some((code) => {
          return reasonText.includes(code.toLowerCase());
        });
      }
    } else {
      if (escala.specialty && a.specialty === escala.specialty) {
        matches = true;
      }
      if (escala.professional_id && a.professional_id === escala.professional_id) {
        matches = true;
      }
    }

    if (matches) {
      const prof = (a as { patients?: { full_name?: string } | { full_name?: string }[] }).patients;
      const nome = Array.isArray(prof) ? prof[0]?.full_name : prof?.full_name;
      const dt = new Date(iso);
      const quando = Number.isNaN(dt.getTime())
        ? iso
        : `${dt.toLocaleDateString("pt-BR")} ${dt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
      return { paciente: nome ?? "paciente", quando };
    }
  }
  return null;
}

/**
 * `dateISO` (YYYY-MM-DD) cai dentro da vigência da escala? Limites nulos/vazios
 * = sem fronteira (escalas antigas sem datas seguem sempre válidas).
 */
function naVigencia(dateISO: string, start: unknown, end: unknown): boolean {
  const s = start ? String(start).slice(0, 10) : "";
  const e = end ? String(end).slice(0, 10) : "";
  return (!s || dateISO >= s) && (!e || dateISO <= e);
}

/**
 * Resolve a faixa de horário [start,end] (HH:MM) de uma escala para um dia da
 * semana (0=Dom..6=Sáb): usa `week_hours[dia]` se houver horário próprio válido,
 * senão cai no `start_time`/`end_time` base. Retrocompatível: escala sem
 * week_hours ({}) sempre usa o base.
 */
function faixaDoDia(
  weekday: number,
  base: { start: string; end: string },
  weekHoursRaw: unknown,
): { start: string; end: string; blocks: RecurringBlock[] } {
  let obj: unknown = weekHoursRaw;
  if (typeof weekHoursRaw === "string") {
    try {
      obj = JSON.parse(weekHoursRaw);
    } catch {
      return { ...base, blocks: [] };
    }
  }
  if (!obj || typeof obj !== "object" || Array.isArray(obj))
    return { ...base, blocks: [] };
  const v = (obj as Record<string, unknown>)[String(weekday)] as
    | { start?: unknown; end?: unknown; blocks?: unknown }
    | undefined;
  if (!v) return { ...base, blocks: [] };
  const start = typeof v.start === "string" ? v.start.slice(0, 5) : "";
  const end = typeof v.end === "string" ? v.end.slice(0, 5) : "";
  const blocks = parseRecurringBlocks(v.blocks);
  return /^\d{2}:\d{2}$/.test(start) && /^\d{2}:\d{2}$/.test(end)
    ? { start, end, blocks }
    : { ...base, blocks };
}

/** Bloqueio fixo/recorrente da escala (vale em todos os dias dela). */
export type RecurringBlock = { time: string; reason: string };

/** Normaliza o jsonb `recurring_blocks` (array de {time, reason}) defensivamente. */
function parseRecurringBlocks(raw: unknown): RecurringBlock[] {
  let arr: unknown = raw;
  if (typeof raw === "string") {
    try {
      arr = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(arr)) return [];
  return arr
    .map((x) => {
      const o = x as { time?: unknown; reason?: unknown };
      return {
        time: typeof o?.time === "string" ? o.time.slice(0, 5) : "",
        reason: typeof o?.reason === "string" ? o.reason : "",
      };
    })
    .filter((r) => /^\d{2}:\d{2}$/.test(r.time));
}

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
  if (d.service_type !== "Procedimento" && d.service_type !== "Exame" && (!d.specialty || d.specialty.trim().length < 2)) {
    return { error: "Selecione a especialidade da escala." };
  }
  if (periodoInvalido(d)) {
    return { error: "A data final deve ser igual ou posterior à inicial." };
  }
  const code = `ESC-${String(Math.floor(1000 + Math.random() * 9000))}`;
  if (isDemoMode()) return { ok: true, protocol: code };

  const clinicId = await requireClinic();
  const supabase = await createClient();

  // Escala única por especialidade: bloqueia se já houver uma ativa da mesma
  // especialidade com vigência sobreposta ao período informado.
  if (d.specialty) {
    const conflito = await escalaConflitante(
      supabase,
      clinicId,
      d.specialty,
      d.start_date,
      d.end_date,
    );
    if (conflito) return { error: msgConflitoEscala(conflito) };
  }

  const { error } = await supabase.from("schedules").insert({
    clinic_id: clinicId,
    code,
    description: d.description,
    // Escala por especialidade: sem profissional fixo.
    professional_id: d.professional_id?.trim() || null,
    specialty: d.specialty || null,
    service_type: d.service_type || null,
    slot_minutes: d.slot_minutes,
    overbook_limit: d.overbook_limit,
    weekdays: d.weekdays,
    start_time: d.start_time,
    end_time: d.end_time,
    week_hours: d.week_hours,
    start_date: d.start_date,
    end_date: d.end_date,
    procedure_codes: d.procedure_codes,
    exam_tuss_codes: d.exam_tuss_codes,
    recurring_blocks: d.recurring_blocks,
    lateralidade: d.lateralidade?.trim() || null,
    obs: d.obs?.trim() || null,
  });

  if (error) return { error: error.message };

  await logAction({
    action: "create",
    module: "agenda",
    summary: `Criou a escala ${code} (${d.specialty || d.service_type || "Sem Especialidade"})`,
    entity: "schedule",
    metadata: { code },
  });
  revalidateAgenda();
  return { ok: true, protocol: code };
}

/** Patch de edição de escala: mesmos campos editáveis, mais o `active`. */
const escalaUpdateSchema = escalaSchema.extend({
  active: z.boolean().default(true),
});

export type EscalaUpdateInput = z.input<typeof escalaUpdateSchema>;

/** Atualiza uma escala de horários existente (RLS escopa por clínica). */
export async function updateSchedule(
  id: string,
  input: EscalaUpdateInput,
): Promise<AgendaActionState> {
  const idParsed = idSchema.safeParse(id);
  if (!idParsed.success) return { error: idParsed.error.issues[0]?.message };

  const parsed = escalaUpdateSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const d = parsed.data;
  if (d.service_type !== "Procedimento" && d.service_type !== "Exame" && (!d.specialty || d.specialty.trim().length < 2)) {
    return { error: "Selecione a especialidade da escala." };
  }
  if (periodoInvalido(d)) {
    return { error: "A data final deve ser igual ou posterior à inicial." };
  }

  if (isDemoMode()) return { ok: true };

  const clinicId = await requireClinic();
  const supabase = await createClient();

  // Bloqueio: não permite alterar a escala se já houver paciente agendado que
  // depende dela (verifica pelo ESCOPO ATUAL da escala, antes das mudanças).
  const { data: atual } = await supabase
    .from("schedules")
    .select("id, specialty, professional_id, service_type, procedure_codes, exam_tuss_codes, start_date, end_date, weekdays")
    .eq("id", idParsed.data)
    .eq("clinic_id", clinicId)
    .maybeSingle();
  if (atual) {
    const agendado = await agendamentoDependenteDaEscala(supabase, atual);
    if (agendado) {
      return {
        error: `Não é possível alterar esta escala: há paciente agendado — ${agendado.paciente} em ${agendado.quando}. Cancele ou remarque o agendamento antes de alterar a escala.`,
      };
    }
  }

  // Escala única por especialidade (na edição, ignora a própria escala).
  if (d.specialty) {
    const conflito = await escalaConflitante(
      supabase,
      clinicId,
      d.specialty,
      d.start_date,
      d.end_date,
      idParsed.data,
    );
    if (conflito) return { error: msgConflitoEscala(conflito) };
  }

  const { error } = await supabase
    .from("schedules")
    .update({
      description: d.description,
      // Escala por especialidade: zera qualquer profissional fixo (inclusive
      // ao editar uma escala antiga que tinha profissional).
      professional_id: d.professional_id?.trim() || null,
      specialty: d.specialty || null,
      service_type: d.service_type || null,
      slot_minutes: d.slot_minutes,
      overbook_limit: d.overbook_limit,
      weekdays: d.weekdays,
      start_time: d.start_time,
      end_time: d.end_time,
      week_hours: d.week_hours,
      start_date: d.start_date,
      end_date: d.end_date,
      procedure_codes: d.procedure_codes,
      exam_tuss_codes: d.exam_tuss_codes,
      recurring_blocks: d.recurring_blocks,
      lateralidade: d.lateralidade?.trim() || null,
      obs: d.obs?.trim() || null,
      active: d.active,
    })
    .eq("id", idParsed.data);

  if (error) return { error: error.message };

  await logAction({
    action: "update",
    module: "agenda",
    summary: `Editou a escala (${d.specialty || d.service_type || "Sem Especialidade"})`,
    entity: "schedule",
    entityId: idParsed.data,
  });
  revalidateAgenda();
  return { ok: true };
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

  await logAction({
    action: "create",
    module: "agenda",
    summary: "Criou um bloqueio de horário",
    entity: "schedule_block",
    entityId: (data?.id as string) ?? undefined,
  });
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

  await logAction({
    action: "delete",
    module: "agenda",
    summary: "Removeu um bloqueio de horário",
    entity: "schedule_block",
    entityId: parsed.data,
  });
  revalidateAgenda();
  return { ok: true };
}

// ════════════════════════════════════════════════════════════════
// Comprovante — envio (STUB local; não chama serviço externo real)
// ════════════════════════════════════════════════════════════════
const comprovanteSchema = z.object({
  channel: z.enum(["sms", "email", "whatsapp"]),
  protocol: z.string().trim().min(1, "Protocolo inválido."),
  patient_id: z.string().trim().optional().or(z.literal("")),
  to: z.string().trim().optional().or(z.literal("")),
});

/**
 * Envia o comprovante (SMS/e-mail/WhatsApp) através da camada de INTEGRAÇÕES.
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

  const evento =
    d.channel === "email"
      ? "emailNewAppointment"
      : d.channel === "whatsapp"
        ? "whatsappResults"
        : "smsTwoHoursBefore";

  if (isDemoMode()) {
    // Em demo não há banco/provider: apenas resolve o status que ocorreria
    // (respeitando os toggles padrão de notificação).
    await enviarNotificacao({
      canal: d.channel as any,
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
          : d.channel === "whatsapp"
            ? "Paciente sem telefone cadastrado para WhatsApp."
            : "Paciente sem e-mail cadastrado.",
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("appointment_notifications").insert({
    channel: d.channel as any,
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
  await logAction({
    action: "other",
    module: "agenda",
    summary: `Enviou comprovante de agendamento por ${d.channel}`,
    entity: "appointment",
    metadata: { protocol: d.protocol, channel: d.channel },
  });
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

/** "HH:mm" → minutos desde meia-noite. */
function horaToMin(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

/** ISO → minutos desde meia-noite (hora local), coerente com isoToHora. */
function isoToMin(iso: string): number {
  const d = new Date(iso);
  return d.getHours() * 60 + d.getMinutes();
}

/** Intervalo ocupado [inícioMin, fimMin). */
type Intervalo = [number, number];

/**
 * Deriva os intervalos ocupados [início, fim) dos agendamentos não-cancelados,
 * usando a DURAÇÃO real (`ends_at`). Sem `ends_at`, assume `slotMinutes`.
 */
function ocupacaoIntervalos(
  ags: Array<{ starts_at: unknown; ends_at?: unknown; status?: unknown }>,
  slotMinutes: number,
): Intervalo[] {
  const out: Intervalo[] = [];
  for (const a of ags) {
    if (a.status === "cancelado") continue;
    const ini = isoToMin(a.starts_at as string);
    const fim = a.ends_at ? isoToMin(a.ends_at as string) : ini + slotMinutes;
    out.push([ini, fim > ini ? fim : ini + slotMinutes]);
  }
  return out;
}

/** Um slot [hora, hora+slotMinutes) sobrepõe algum intervalo ocupado? */
function sobrepoe(
  hora: string,
  slotMinutes: number,
  intervalos: Intervalo[],
): boolean {
  const ini = horaToMin(hora);
  const fim = ini + slotMinutes;
  return intervalos.some(([i, f]) => i < fim && ini < f);
}

/** Quantos intervalos ocupados sobrepõem o slot [hora, hora+slotMinutes)? */
function contarSobrepostos(
  hora: string,
  slotMinutes: number,
  intervalos: Intervalo[],
): number {
  const ini = horaToMin(hora);
  const fim = ini + slotMinutes;
  return intervalos.reduce((n, [i, f]) => (i < fim && ini < f ? n + 1 : n), 0);
}

/**
 * Lista os horários (grade) para um profissional numa data, marcando ocupados.
 * Demo: grade padrão com alguns horários simulados como ocupados.
 * Real: deriva de `schedules` (dia da semana) + ocupação por `appointments`/`schedule_blocks`.
 * Devolve também `slotMinutes` (duração padrão da escala) p/ a UI.
 */
export async function listSlots(
  professionalId: string,
  dateISO: string,
): Promise<SlotGrid> {
  if (!professionalId || !dateISO) return { slots: [], slotMinutes: 30 };

  if (isDemoMode()) {
    const ocupados = new Set(["09:00", "10:30", "11:00", "14:30", "16:00"]);
    return {
      slots: gradePadrao().map((hora) => ({ hora, ocupado: ocupados.has(hora) })),
      slotMinutes: 30,
    };
  }

  const supabase = await createClient();
  const weekday = new Date(`${dateISO}T00:00:00`).getDay(); // 0=Dom..6=Sáb

  // A escala é por ESPECIALIDADE: resolvemos a grade pela especialidade do
  // profissional. Mantemos fallback ao professional_id para escalas antigas
  // (criadas quando a escala ainda era amarrada ao profissional).
  const { data: prof } = await supabase
    .from("professionals")
    .select("specialty")
    .eq("id", professionalId)
    .maybeSingle();
  const especialidade = (prof?.specialty as string | null) ?? "";

  const { data: escalas } = await supabase
    .from("schedules")
    .select(
      "professional_id, specialty, slot_minutes, weekdays, start_time, end_time, week_hours, active, start_date, end_date, recurring_blocks",
    )
    .eq("active", true);

  const escala = (escalas ?? []).find(
    (e) =>
      (e.professional_id === professionalId ||
        (especialidade && e.specialty === especialidade)) &&
      (Array.isArray(e.weekdays) ? e.weekdays.includes(weekday) : false) &&
      naVigencia(dateISO, e.start_date, e.end_date),
  );

  const slotMinutes = escala ? Number(escala.slot_minutes) || 30 : 30;
  const faixa = escala
    ? faixaDoDia(
        weekday,
        {
          start: String(escala.start_time).slice(0, 5),
          end: String(escala.end_time).slice(0, 5),
        },
        escala.week_hours,
      )
    : null;
  const horarios = faixa
    ? gerarHorarios(faixa.start, faixa.end, slotMinutes)
    : gradePadrao();

  // Ocupação: agendamentos do dia (considerando a DURAÇÃO real) + bloqueios.
  const dayStart = toIso(dateISO, "00:00");
  const dayEnd = addMinutes(toIso(dateISO, "00:00"), 24 * 60);

  const { data: ags } = await supabase
    .from("appointments")
    .select("starts_at, ends_at, status")
    .eq("professional_id", professionalId)
    .gte("starts_at", dayStart)
    .lt("starts_at", dayEnd);

  const { data: blocks } = await supabase
    .from("schedule_blocks")
    .select("start_time")
    .eq("professional_id", professionalId)
    .eq("block_date", dateISO);

  // Intervalos [início, fim) ocupados — um slot é ocupado se sobrepõe qualquer
  // intervalo (não basta bater a hora de início: agendamentos longos cobrem
  // vários slots da grade) ou se está bloqueado.
  const intervalos = ocupacaoIntervalos(ags ?? [], slotMinutes);
  const bloqueados = new Set<string>();
  for (const b of blocks ?? []) bloqueados.add(String(b.start_time).slice(0, 5));
  // Bloqueios fixos DO DIA (week_hours[dia].blocks) + os globais legados
  // (recurring_blocks, que valem em todos os dias) — união é restritiva/segura.
  for (const r of faixa?.blocks ?? []) bloqueados.add(r.time);
  for (const r of parseRecurringBlocks(escala?.recurring_blocks))
    bloqueados.add(r.time);

  return {
    slots: horarios.map((hora) => ({
      hora,
      ocupado: bloqueados.has(hora) || sobrepoe(hora, slotMinutes, intervalos),
    })),
    slotMinutes,
  };
}

/** Ocupação de um horário da grade por um agendamento real (com paciente). */
export type SlotOcupacao = {
  hora: string;
  ocupado: boolean;
  /** Nome do paciente do 1º agendamento que sobrepõe o slot (se ocupado). */
  paciente?: string;
};

/**
 * Para uma grade de horários já montada (vinda do modal de escala), diz quais
 * estão OCUPADOS por agendamentos reais do profissional naquela data — trazendo
 * o nome do paciente. Bloqueios não entram aqui (a UI os trata via `listBlocks`).
 * Considera a DURAÇÃO real do agendamento (um agendamento longo cobre vários slots).
 */
export async function listOcupacao(
  professionalId: string,
  dateISO: string,
  slotMinutes: number,
  horas: string[],
): Promise<SlotOcupacao[]> {
  const step = slotMinutes > 0 ? slotMinutes : 30;
  if (!professionalId || !dateISO || horas.length === 0) {
    return horas.map((hora) => ({ hora, ocupado: false }));
  }
  if (isDemoMode()) {
    const ocupados = new Map<string, string>([
      ["09:00", "Maria Silva"],
      ["10:30", "João Pereira"],
      ["14:30", "Ana Souza"],
    ]);
    return horas.map((hora) => ({
      hora,
      ocupado: ocupados.has(hora),
      paciente: ocupados.get(hora),
    }));
  }

  const supabase = await createClient();
  const dayStart = toIso(dateISO, "00:00");
  const dayEnd = addMinutes(toIso(dateISO, "00:00"), 24 * 60);

  const { data: ags } = await supabase
    .from("appointments")
    .select("starts_at, ends_at, status, patients(full_name)")
    .eq("professional_id", professionalId)
    .gte("starts_at", dayStart)
    .lt("starts_at", dayEnd);

  // Intervalos [início, fim) ocupados + o paciente de cada um.
  const intervalos: Array<{ ini: number; fim: number; paciente: string }> = [];
  for (const a of ags ?? []) {
    if (a.status === "cancelado") continue;
    const ini = isoToMin(a.starts_at as string);
    const fim = a.ends_at ? isoToMin(a.ends_at as string) : ini + step;
    const pac = a.patients as { full_name?: string } | null;
    intervalos.push({
      ini,
      fim: fim > ini ? fim : ini + step,
      paciente: pac?.full_name ?? "Paciente",
    });
  }

  return horas.map((hora) => {
    const ini = horaToMin(hora);
    const fim = ini + step;
    const hit = intervalos.find((iv) => iv.ini < fim && ini < iv.fim);
    return { hora, ocupado: Boolean(hit), paciente: hit?.paciente };
  });
}

/**
 * Variante por ESPECIALIDADE (agendamento sem profissional definido).
 * Grade derivada das escalas (`schedules`) da especialidade ativas no dia.
 * Ocupação é AGREGADA: por slot, conta agendamentos não-cancelados da
 * especialidade (coluna `appointments.specialty`) no dia; marca como ocupado
 * quando atinge a capacidade (nº de profissionais ativos da especialidade).
 * Ponto de atenção: é um modelo de capacidade aproximado — agendamentos já
 * atribuídos a um profissional só contam aqui se tiverem `specialty` gravada.
 */
export async function listSlotsBySpecialty(
  specialty: string,
  dateISO: string,
  serviceType?: string,
  itemId?: string,
): Promise<SlotGrid> {
  if (typeof specialty !== "string" || !dateISO) return { slots: [], slotMinutes: 30 };

  if (isDemoMode()) {
    const ocupados = new Set(["09:00", "11:00", "15:00"]);
    return {
      slots: gradePadrao().map((hora) => ({ hora, ocupado: ocupados.has(hora) })),
      slotMinutes: 30,
    };
  }

  const supabase = await createClient();
  const weekday = new Date(`${dateISO}T00:00:00`).getDay();

  let query = supabase
    .from("schedules")
    .select(
      "slot_minutes, weekdays, start_time, end_time, week_hours, active, start_date, end_date, recurring_blocks, specialty, service_type, procedure_codes, exam_tuss_codes",
    )
    .eq("active", true);

  const { data: escalas } = await query;

  // Escalas ativas válidas nesse dia/data.
  const doDia = (escalas ?? []).filter((e) => {
    const cDia = Array.isArray(e.weekdays) ? e.weekdays.includes(weekday) : false;
    const cVig = naVigencia(dateISO, e.start_date, e.end_date);
    if (!cDia || !cVig) return false;

    if (serviceType === "Procedimento") {
      const codes = Array.isArray(e.procedure_codes) ? e.procedure_codes : [];
      return e.service_type === "Procedimento" && codes.includes(itemId || "");
    }
    if (serviceType === "Exame") {
      const codes = Array.isArray(e.exam_tuss_codes) ? e.exam_tuss_codes : [];
      return e.service_type === "Exame" && codes.includes(itemId || "");
    }
    // Consultas/Retornos
    return (e.service_type === "Consulta" || e.service_type === "Retorno" || !e.service_type) && e.specialty === specialty;
  });
  const escala = doDia[0];

  const slotMinutes = escala ? Number(escala.slot_minutes) || 30 : 30;
  // Agrega a grade de TODAS as escalas do dia, cada uma resolvendo a SUA faixa
  // (horário próprio do dia via week_hours, ou o base). União ordenada e única.
  const horarios = escala
    ? Array.from(
        new Set(
          doDia.flatMap((e) => {
            const faixa = faixaDoDia(
              weekday,
              {
                start: String(e.start_time).slice(0, 5),
                end: String(e.end_time).slice(0, 5),
              },
              e.week_hours,
            );
            return gerarHorarios(
              faixa.start,
              faixa.end,
              Number(e.slot_minutes) || 30,
            );
          }),
        ),
      ).sort((a, b) => a.localeCompare(b))
    : gradePadrao();

  // Capacidade = profissionais ativos da especialidade (mín. 1).
  let capacity = 1;
  if (!serviceType || serviceType === "Consulta" || serviceType === "Retorno") {
    const { count: profCount } = await supabase
      .from("professionals")
      .select("id", { count: "exact", head: true })
      .eq("specialty", specialty)
      .eq("active", true);
    capacity = Math.max(1, profCount ?? 1);
  }

  const dayStart = toIso(dateISO, "00:00");
  const dayEnd = addMinutes(toIso(dateISO, "00:00"), 24 * 60);

  let qAgs = supabase
    .from("appointments")
    .select("starts_at, ends_at, status, reason, service_type")
    .gte("starts_at", dayStart)
    .lt("starts_at", dayEnd)
    .neq("status", "cancelado");

  if (serviceType === "Procedimento" || serviceType === "Exame") {
    qAgs = qAgs.eq("service_type", serviceType);
  } else {
    qAgs = qAgs.eq("specialty", specialty);
  }

  const { data: rawAgs } = await qAgs;

  // Filtra em memória se for exame/procedimento para corresponder ao item
  const ags = (rawAgs ?? []).filter((a) => {
    if (serviceType === "Procedimento" || serviceType === "Exame") {
      const reasonText = String(a.reason || "").toLowerCase();
      let itemName = "";
      if (serviceType === "Exame") {
        itemName = EXAMES_TUSS.find((ex) => ex.tuss === itemId)?.nome || "";
      } else {
        // Encontra o procedimento de forma síncrona/segura
        itemName = "Procedimento";
      }
      return reasonText.includes(itemName.toLowerCase());
    }
    return true;
  });

  // Conta agendamentos que SOBREPÕEM cada slot (considera a duração real), não
  // só os que começam exatamente na hora do slot. Ocupado ao atingir a capacidade.
  const intervalos = ocupacaoIntervalos(ags ?? [], slotMinutes);
  // Bloqueios do dia: por dia (week_hours[dia].blocks) + globais legados
  // (recurring_blocks) de cada escala da especialidade.
  const bloqueados = new Set(
    doDia.flatMap((e) => {
      const faixa = faixaDoDia(
        weekday,
        {
          start: String(e.start_time).slice(0, 5),
          end: String(e.end_time).slice(0, 5),
        },
        e.week_hours,
      );
      return [
        ...faixa.blocks.map((r) => r.time),
        ...parseRecurringBlocks(e.recurring_blocks).map((r) => r.time),
      ];
    }),
  );

  return {
    slots: horarios.map((hora) => ({
      hora,
      ocupado:
        bloqueados.has(hora) ||
        contarSobrepostos(hora, slotMinutes, intervalos) >= capacity,
    })),
    slotMinutes,
  };
}

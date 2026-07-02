"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/supabase/config";
import { getCurrentUser, getRole } from "@/lib/auth";
import { getMyProfessionalId } from "@/lib/permissions";
import { requireClinic } from "@/lib/tenant";
import { getAttendanceFlow } from "@/lib/data/attendance-flow";
import { statusAfterStage } from "@/lib/data/attendance-flow.shared";

export type ActionState = { error?: string; ok?: boolean } | undefined;

const idSchema = z.string().min(1, "Paciente inválido.");

/** Revalida as rotas afetadas por uma mudança na fila. */
function revalidateFila() {
  revalidatePath("/fila");
  revalidatePath("/dashboard");
}

/** Atualiza o status (e campos extras) de uma entrada da fila via cliente de servidor (RLS staff). */
async function updateQueueStatus(
  id: string,
  patch: Record<string, unknown>,
): Promise<ActionState> {
  if (isDemoMode()) return { ok: true };

  const supabase = await createClient();
  const { error } = await supabase
    .from("queue_entries")
    .update(patch)
    .eq("id", id);

  if (error) return { error: error.message };

  revalidateFila();
  return { ok: true };
}

/**
 * Carimba um marco temporal da fila (called_at/started_at) — BEST-EFFORT.
 *
 * Estes campos vêm da migration 0029 (Tempo Médio de Espera REAL). Se a
 * migration ainda não foi aplicada, a coluna não existe e o UPDATE falha —
 * mas o ERRO É IGNORADO de propósito para NÃO quebrar a transição de status
 * (que já foi persistida antes). Quando a 0029 estiver aplicada, o marco é
 * gravado e alimenta o BI.
 */
async function stampQueueTime(
  id: string,
  field: "called_at" | "started_at",
): Promise<void> {
  if (isDemoMode()) return;
  try {
    const supabase = await createClient();
    // Erro (ex.: coluna ausente pré-0029) é silenciado: marco é best-effort.
    await supabase
      .from("queue_entries")
      .update({ [field]: new Date().toISOString() })
      .eq("id", id);
  } catch {
    // Silêncio proposital: o status já mudou; o marco é só para o BI.
  }
}

/**
 * Carimba appointments.check_in = agora no agendamento vinculado — BEST-EFFORT.
 *
 * É a chegada REAL do paciente (migration 0047). Alimenta o BI de Tempo Médio
 * de Espera via agenda (getTempoEsperaAgendaBI = starts_at − check_in). Só grava
 * se ainda estiver vazio (primeiro check-in vence; reentradas não sobrescrevem).
 * Erro (ex.: coluna ausente pré-0047) é silenciado para não quebrar o check-in,
 * que já foi persistido na fila. RLS de appointments (clinic_id) cobre o escopo.
 */
async function stampAppointmentCheckIn(appointmentId: string): Promise<void> {
  if (isDemoMode()) return;
  try {
    const supabase = await createClient();
    await supabase
      .from("appointments")
      .update({ check_in: new Date().toISOString() })
      .eq("id", appointmentId)
      .is("check_in", null);
  } catch {
    // Silêncio proposital: o check-in já foi registrado; o carimbo é só p/ BI.
  }
}

/** Chamar paciente: aguardando → chamado. Carimba called_at (BI espera). */
export async function chamarPaciente(id: string): Promise<ActionState> {
  const parsed = idSchema.safeParse(id);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const res = await updateQueueStatus(parsed.data, { status: "chamado" });
  if (res?.ok) await stampQueueTime(parsed.data, "called_at");
  return res;
}

/** Atender paciente: → em_atendimento. Carimba started_at (BI espera). */
export async function atenderPaciente(id: string): Promise<ActionState> {
  const parsed = idSchema.safeParse(id);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  // REIVINDICAÇÃO: se o paciente está só por especialidade (professional_id
  // vazio), o médico que atende passa a ser o profissional dele — some da fila
  // dos outros médicos da mesma especialidade. O `.is("professional_id", null)`
  // garante que NÃO rouba um paciente já atribuído a outro profissional; e
  // conferimos a corrida (dois médicos clicando ao mesmo tempo).
  if (!isDemoMode()) {
    const myProfId = await getMyProfessionalId();
    if (myProfId) {
      const supabase = await createClient();
      const { data: claimed } = await supabase
        .from("queue_entries")
        .update({ professional_id: myProfId })
        .eq("id", parsed.data)
        .is("professional_id", null)
        .select("id");
      // Não reivindicou (0 linhas): ou já é dele, ou outro médico assumiu.
      if (!claimed || claimed.length === 0) {
        const { data: cur } = await supabase
          .from("queue_entries")
          .select("professional_id")
          .eq("id", parsed.data)
          .maybeSingle();
        const dono = (cur?.professional_id as string | null) ?? null;
        if (dono && dono !== myProfId) {
          return {
            error: "Paciente já está sendo atendido por outro profissional.",
          };
        }
      }
    }
  }

  const res = await updateQueueStatus(parsed.data, { status: "em_atendimento" });
  if (res?.ok) await stampQueueTime(parsed.data, "started_at");
  return res;
}

/**
 * Recepção inicia o atendimento administrativo: aguardando → na_recepcao.
 * Concluir a recepção (Salvar no modal Dados de Atendimento) avança para
 * 'aguardando_atendimento' (ou 'triagem') — ver `salvarAtendimento`.
 */
export async function atenderRecepcao(id: string): Promise<ActionState> {
  const parsed = idSchema.safeParse(id);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  return updateQueueStatus(parsed.data, { status: "na_recepcao" });
}

const desistirSchema = z.object({
  id: idSchema,
  motivo: z.string().trim().min(1, "Informe o motivo da desistência."),
});

// ── Check-in via totem ───────────────────────────────────────────────
const checkInSchema = z.object({
  appointmentId: z.string().uuid("Agendamento inválido.").optional(),
  patientId: z.string().uuid("Paciente inválido.").nullish(),
  patientName: z.string().trim().min(1, "Nome do paciente é obrigatório."),
  priority: z.enum(["normal", "preferencial", "urgente"]).default("normal"),
  specialty: z.string().trim().nullish(),
  insurance: z.string().trim().nullish(),
  professionalId: z.string().uuid("Profissional inválido.").nullish(),
});

export type CheckInTotemInput = z.input<typeof checkInSchema>;

export type CheckInTotemResult = {
  ok?: boolean;
  error?: string;
  ticketCode?: string;
  /** id da entrada criada em queue_entries (p/ abrir os Dados no modo sem totem). */
  queueEntryId?: string;
};

/**
 * Gera a senha (ticket_code): prefixo "P" p/ preferencial, senão "A",
 * + número sequencial do dia com 3 dígitos. Ex.: A001, P001.
 */
function genTicketCode(priority: string, seq: number): string {
  const prefix = priority === "preferencial" ? "P" : "A";
  return `${prefix}${String(seq).padStart(3, "0")}`;
}

/**
 * Sorteia a numeração de atendimento (ficha): 6 dígitos (100000–999999),
 * ALEATÓRIA. A unicidade por clínica é garantida pelo índice único; em caso de
 * colisão (23505), o insert é refeito com novo código (ver checkInTotem).
 */
function genAttendanceCode(): string {
  return String(100000 + Math.floor(Math.random() * 900000));
}

/** Início (00:00) e fim (24:00) do dia atual em ISO. */
function todayRangeISO(): { startISO: string; endISO: string } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { startISO: start.toISOString(), endISO: end.toISOString() };
}

/**
 * Check-in no totem: cria a entrada na fila (status "aguardando", arrived_at=now),
 * vinculando ao agendamento quando houver. Gera e retorna a SENHA (ticket_code).
 * Em modo demo, gera a senha localmente sem tocar no banco.
 */
export async function checkInTotem(
  input: CheckInTotemInput,
): Promise<CheckInTotemResult> {
  const parsed = checkInSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const data = parsed.data;

  if (isDemoMode()) {
    // Sem banco no modo demo: senha sequencial fictícia (3 dígitos).
    const seq = Math.floor(Math.random() * 900) + 100;
    return {
      ok: true,
      ticketCode: genTicketCode(data.priority, seq),
      queueEntryId: "demo",
    };
  }

  const clinicId = await requireClinic();
  const supabase = await createClient();
  const { startISO, endISO } = todayRangeISO();

  // Sequencial do dia = nº de senhas já emitidas hoje + 1.
  const { count, error: countError } = await supabase
    .from("queue_entries")
    .select("id", { count: "exact", head: true })
    .gte("created_at", startISO)
    .lt("created_at", endISO);

  if (countError) return { error: "Não foi possível gerar a senha." };

  const ticketCode = genTicketCode(data.priority, (count ?? 0) + 1);

  // Quando há paciente vinculado, o cadastro é a FONTE DA VERDADE de nome e
  // convênio — o cliente pode ter dados antigos (ex.: avulso que acabou de
  // completar o cadastro no próprio check-in). Lê do banco e sobrepõe.
  let patientName = data.patientName;
  let insurance = data.insurance ?? null;
  if (data.patientId) {
    const { data: pac } = await supabase
      .from("patients")
      .select("full_name, convenio")
      .eq("id", data.patientId)
      .maybeSingle();
    if (pac) {
      if (pac.full_name) patientName = pac.full_name as string;
      insurance = ((pac.convenio as string | null) ?? "").trim() || insurance;
    }
  }

  // Vínculo do profissional: agendamento com médico específico → o paciente já
  // entra vinculado a ele (só ESSE médico o vê na fila). Agendamento por
  // especialidade → professional_id null (fica "livre" p/ qualquer médico da
  // especialidade até alguém atender e reivindicar).
  let professionalId = data.professionalId ?? null;
  let specialty = data.specialty ?? null;
  if (!professionalId && data.appointmentId) {
    const { data: ap } = await supabase
      .from("appointments")
      .select("professional_id, specialty")
      .eq("id", data.appointmentId)
      .maybeSingle();
    if (ap) {
      professionalId = (ap.professional_id as string | null) ?? null;
      if (!specialty) specialty = (ap.specialty as string | null) ?? null;
    }
  }

  // Insere a entrada na fila. O NÚMERO DE ATENDIMENTO (attendance_code) NÃO é
  // gerado aqui — ele nasce só ao SALVAR os Dados de Atendimento (salvarAtendimento).
  // attendance_code fica null (o índice único ignora NULLs no Postgres).
  const { data: novo, error: insErr } = await supabase
    .from("queue_entries")
    .insert({
      clinic_id: clinicId,
      ticket_code: ticketCode,
      patient_id: data.patientId ?? null,
      patient_name: patientName,
      priority: data.priority,
      professional_id: professionalId,
      specialty: specialty,
      insurance: insurance,
      status: "aguardando",
      arrived_at: new Date().toISOString(),
      appointment_id: data.appointmentId ?? null,
    })
    .select("id")
    .single();

  if (insErr || !novo) return { error: "Não foi possível registrar o check-in." };

  // Carimba a chegada real no agendamento vinculado (BI de tempo de espera).
  if (data.appointmentId) await stampAppointmentCheckIn(data.appointmentId);

  revalidateFila();
  return { ok: true, ticketCode, queueEntryId: novo.id as string };
}

// ── Dados de Atendimento (persistência da Fila — escopo 4.2) ─────────
const atendimentoSchema = z.object({
  // IDs vêm do FilaItem; string solta (não uuid) p/ não quebrar o modo demo,
  // onde os ids são mocks. A FK do banco valida a integridade no caso real.
  queueEntryId: z.string().trim().min(1).nullish(),
  patientId: z.string().trim().min(1).nullish(),
  patientName: z.string().trim().max(200).nullish(),
  medico: z.string().trim().max(120).nullish(),
  especialidade: z.string().trim().max(120).nullish(),
  encaminhamento: z.string().trim().max(120).nullish(),
  carater: z.enum(["urgencia", "eletivo"]).nullish(),
  procedencia: z.string().trim().max(120).nullish(),
  centroCusto: z.string().trim().max(120).nullish(),
  origem: z.string().trim().max(120).nullish(),
  dataEntrada: z.string().trim().max(10).nullish(),
  privadoLiberdade: z.boolean().default(false),
  gestante: z.boolean().default(false),
  // Convênio obrigatório. Plano só é exigido quando há convênio — atendimento
  // "Particular" dispensa o plano (validado no superRefine abaixo).
  convenio: z.string().trim().min(1, "Convênio obrigatório.").max(120),
  plano: z.string().trim().max(120).default(""),
  carteira: z.string().trim().max(60).nullish(),
  validade: z.string().trim().max(10).nullish(),
  validador: z.string().trim().max(120).nullish(),
  respOMesmo: z.boolean().default(false),
  respNome: z.string().trim().max(200).nullish(),
  respDocumento: z.string().trim().max(60).nullish(),
  respParentesco: z.string().trim().max(60).nullish(),
  observacoes: z.string().trim().max(2000).nullish(),
}).superRefine((d, ctx) => {
  // Tipo de Atendimento obrigatório (autopreenchido pelo agendamento; no avulso
  // a recepção precisa selecionar). Espelha a trava do modal — defesa no servidor.
  if (!d.encaminhamento || !d.encaminhamento.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["encaminhamento"],
      message: "Selecione o tipo de atendimento.",
    });
  }
  // Plano obrigatório, exceto em atendimento particular (sem convênio).
  if (!/particular/i.test(d.convenio) && !d.plano) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["plano"],
      message: "Selecione o plano do convênio.",
    });
  }
});

export type AtendimentoInput = z.input<typeof atendimentoSchema>;

/** Normaliza string vazia/só-espaço → null (não gravar "" em colunas opcionais). */
function emptyToNull(v: string | null | undefined): string | null {
  const t = v?.trim();
  return t ? t : null;
}

/**
 * Persiste a ficha de "Dados de Atendimento" da Fila em attendance_records
 * (multitenant + RLS staff). É registro ADMINISTRATIVO da recepção, não dado
 * clínico. Valida na borda (Zod), exige clínica ativa e papel de staff. Em
 * modo demo, valida e retorna ok sem tocar no banco.
 */
export async function salvarAtendimento(
  input: AtendimentoInput,
): Promise<ActionState> {
  const parsed = atendimentoSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const d = parsed.data;

  if (isDemoMode()) return { ok: true };

  const current = await getCurrentUser();
  if (!current) return { error: "Sessão expirada." };

  // Gate de staff (admin/medico/recepcao). RLS é a 2ª camada; aqui é explícito.
  const role = await getRole();
  if (role !== "admin" && role !== "medico" && role !== "recepcao") {
    return { error: "Acesso restrito à equipe da clínica." };
  }

  const clinicId = await requireClinic();
  const supabase = await createClient();

  const { error } = await supabase.from("attendance_records").insert({
    clinic_id: clinicId,
    queue_entry_id: emptyToNull(d.queueEntryId),
    patient_id: emptyToNull(d.patientId),
    patient_name: emptyToNull(d.patientName),
    medico: emptyToNull(d.medico),
    especialidade: emptyToNull(d.especialidade),
    encaminhamento: emptyToNull(d.encaminhamento),
    carater: d.carater ?? null,
    procedencia: emptyToNull(d.procedencia),
    centro_custo: emptyToNull(d.centroCusto),
    origem: emptyToNull(d.origem),
    data_entrada: emptyToNull(d.dataEntrada),
    privado_liberdade: d.privadoLiberdade,
    gestante: d.gestante,
    convenio: d.convenio,
    plano: d.plano,
    carteira: emptyToNull(d.carteira),
    validade: emptyToNull(d.validade),
    validador: emptyToNull(d.validador),
    resp_o_mesmo: d.respOMesmo,
    resp_nome: emptyToNull(d.respNome),
    resp_documento: emptyToNull(d.respDocumento),
    resp_parentesco: emptyToNull(d.respParentesco),
    observacoes: emptyToNull(d.observacoes),
    created_by: current.userId,
  });

  if (error) return { error: "Não foi possível salvar o atendimento." };

  // Concluir a recepção: se a entrada está 'na_recepcao', avança para o próximo
  // status do fluxo ('aguardando_atendimento' ou 'triagem', se configurada).
  // Guard por status garante que só avança quem estava em atendimento da recepção.
  const queueEntryId = emptyToNull(d.queueEntryId);
  if (queueEntryId) {
    // NÚMERO DE ATENDIMENTO: gerado agora (ao concluir os Dados), só se ainda não
    // existir. Retry na colisão do índice único (clinic_id, attendance_code).
    // `.is("attendance_code", null)` torna idempotente (re-salvar não re-gera).
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = genAttendanceCode();
      const { error: acErr } = await supabase
        .from("queue_entries")
        .update({ attendance_code: code })
        .eq("id", queueEntryId)
        .is("attendance_code", null);
      if (!acErr || acErr.code !== "23505") break;
    }

    const stages = await getAttendanceFlow();
    const next = statusAfterStage("recepcao", stages);
    await supabase
      .from("queue_entries")
      .update({ status: next })
      .eq("id", queueEntryId)
      .eq("status", "na_recepcao");
  }

  revalidateFila();
  return { ok: true };
}

/** Registrar desistência: → desistencia + motivo. */
export async function desistirPaciente(
  id: string,
  motivo: string,
): Promise<ActionState> {
  const parsed = desistirSchema.safeParse({ id, motivo });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  return updateQueueStatus(parsed.data.id, {
    status: "desistencia",
    cancel_reason: parsed.data.motivo,
  });
}

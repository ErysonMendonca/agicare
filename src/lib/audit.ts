import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { getActiveClinicId } from "@/lib/tenant";

// ════════════════════════════════════════════════════════════════
// Auditoria de acesso a dados sensíveis (LGPD, Lei 13.709).
// Registra QUEM acessou o prontuário/dado clínico de QUAL paciente e
// QUANDO, para rastreabilidade. Escreve em `public.access_logs` (0014).
//
// Garantias:
//   - Server-only (usa o cliente de servidor com cookies).
//   - NUNCA lança: auditoria não pode derrubar a página que ela observa.
//   - No-op em modo demo ou sem usuário autenticado.
// ════════════════════════════════════════════════════════════════

type LogAccessEntry = {
  patientId?: string | null;
  patientName?: string | null;
  /** Origem do acesso: 'prontuario','prescricao','anamnese','evolucao'... */
  module: string;
  /** 'view' | 'create' | 'update' | 'delete' | 'print' | 'export' */
  action?: string;
};

/**
 * Registra um acesso a dado sensível na trilha de auditoria.
 *
 * Best-effort e fail-safe: qualquer erro (rede, RLS, sessão) é silenciado —
 * a renderização da página NUNCA depende do sucesso deste log. Não inclui
 * conteúdo clínico, apenas metadados de acesso (LGPD: minimização).
 */
export async function logAccess(entry: LogAccessEntry): Promise<void> {
  try {
    // Sem backend real (protótipo navegável) não há o que auditar.

    const current = await getCurrentUser();
    if (!current) return;

    // Tenant: usamos getActiveClinicId() (NÃO requireClinic) porque o log é
    // best-effort/fail-safe e não pode redirecionar. Sem clínica ativa → pula
    // o log (mantém o fail-safe).
    const clinicId = await getActiveClinicId();
    if (!clinicId) return;

    const supabase = await createClient();

    await supabase.from("access_logs").insert({
      clinic_id: clinicId,
      user_id: current.userId,
      user_name: current.profile?.full_name ?? null,
      user_role: current.profile?.role ?? null,
      patient_id: entry.patientId ?? null,
      patient_name: entry.patientName ?? null,
      module: entry.module,
      action: entry.action ?? "view",
    });
  } catch {
    // Silêncio proposital: log de auditoria é best-effort e não pode
    // propagar exceção para a página. (LGPD: sem dados sensíveis em log.)
  }
}

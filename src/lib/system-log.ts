import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { getActiveClinicId } from "@/lib/tenant";

// ════════════════════════════════════════════════════════════════
// Trilha de auditoria GENÉRICA "quem fez o quê" (system_logs, 0076).
// Diferente de `logAccess` (LGPD, acesso a dado clínico), este registra
// AÇÕES de negócio (create/update/delete/login/logout/export/print) em
// qualquer módulo, para a tela admin de Log do Sistema.
//
// Garantias (espelham logAccess):
//   - Server-only (cliente de servidor com cookies).
//   - NUNCA lança: auditoria não pode derrubar a action que ela observa.
//   - No-op em modo demo ou sem usuário autenticado.
// Chamado por ~109 actions → mantido simples e barato.
// ════════════════════════════════════════════════════════════════

export type LogAction =
  | "create"
  | "update"
  | "delete"
  | "login"
  | "logout"
  | "export"
  | "print"
  | "other";

type LogActionEntry = {
  action: LogAction;
  /** Módulo de origem: 'auth','pacientes','estoque'... */
  module: string;
  /** Frase curta e legível do que aconteceu (sem dado sensível/LGPD). */
  summary: string;
  /** Tipo da entidade afetada (ex.: 'patient','order'). */
  entity?: string;
  /** ID da entidade afetada. */
  entityId?: string;
  /** Metadados livres (não incluir dado sensível). */
  metadata?: Record<string, unknown>;
};

/**
 * Registra uma AÇÃO na trilha de auditoria genérica.
 *
 * Best-effort e fail-safe: qualquer erro (rede, RLS, sessão) é silenciado —
 * a Server Action que chama isto NUNCA depende do sucesso deste log.
 * A RLS de INSERT em system_logs é `is_staff()`; usamos o cliente de
 * servidor NORMAL (anon + cookies), não o service-role.
 */
export async function logAction(entry: LogActionEntry): Promise<void> {
  try {
    // Sem backend real (protótipo navegável) não há o que auditar.

    const current = await getCurrentUser();
    if (!current) return;

    // Tenant best-effort: getActiveClinicId() (NÃO requireClinic) para não
    // redirecionar. clinic_id pode ser null (a coluna aceita).
    const clinicId = await getActiveClinicId();

    const supabase = await createClient();

    await supabase.from("system_logs").insert({
      clinic_id: clinicId,
      actor_user_id: current.userId,
      actor_name: current.profile?.full_name ?? null,
      actor_role: current.profile?.role ?? null,
      action: entry.action,
      module: entry.module,
      summary: entry.summary,
      entity: entry.entity ?? null,
      entity_id: entry.entityId ?? null,
      metadata: entry.metadata ?? {},
    });
  } catch {
    // Silêncio proposital: auditoria é best-effort e não pode propagar
    // exceção para a action. (LGPD: sem dados sensíveis em log.)
  }
}

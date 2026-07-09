import { createClient } from "@/lib/supabase/server";
import { isGestor } from "@/lib/auth";

// ════════════════════════════════════════════════════════════════
// Leitura da trilha de auditoria (LGPD) para a aba Conformidade dos
// Relatórios. ADMIN-ONLY: o RLS da 0014 já restringe o SELECT de
// access_logs a admin, mas reforçamos a autorização aqui no servidor
// (não dependemos só do RLS). Modo demo devolve mock representativo.
// ════════════════════════════════════════════════════════════════

export type AccessLogRow = {
  id: string;
  quando: string;
  usuario: string;
  papel: string;
  paciente: string;
  modulo: string;
  acao: string;
};

export type ConsentLogRow = {
  id: string;
  paciente: string;
  contexto: string;
  aceito: string;
  assinatura: string;
  registradoPor: string;
  quando: string;
};

/** Data/hora pt-BR (dd/mm/aaaa hh:mm), tolerante a valor inválido. */
function fmtDataHora(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${d.toLocaleDateString("pt-BR")} ${d.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

const PAPEL_LABEL: Record<string, string> = {
  admin: "Administrador",
  medico: "Médico",
  recepcao: "Recepção",
  paciente: "Paciente",
};

const ACAO_LABEL: Record<string, string> = {
  view: "Visualização",
  create: "Criação",
  update: "Edição",
  delete: "Exclusão",
  print: "Impressão",
  export: "Exportação",
};

const DEMO_ACCESS: AccessLogRow[] = [
  {
    id: "demo-1",
    quando: "12/06/2026 08:31",
    usuario: "Dra. Ana Beatriz Costa",
    papel: "Médico",
    paciente: "Maria Silva Santos",
    modulo: "prontuario",
    acao: "Visualização",
  },
  {
    id: "demo-2",
    quando: "12/06/2026 08:05",
    usuario: "Carlos Mendes",
    papel: "Recepção",
    paciente: "João Pereira Lima",
    modulo: "prontuario",
    acao: "Visualização",
  },
  {
    id: "demo-3",
    quando: "11/06/2026 17:48",
    usuario: "Dr. João Silva",
    papel: "Médico",
    paciente: "Maria Silva Santos",
    modulo: "prescricao",
    acao: "Criação",
  },
];

const DEMO_CONSENT: ConsentLogRow[] = [
  {
    id: "demo-c1",
    paciente: "Maria Silva Santos",
    contexto: "anamnese",
    aceito: "Sim",
    assinatura: "Assinado digitalmente",
    registradoPor: "Dra. Ana Beatriz Costa",
    quando: "12/06/2026 08:30",
  },
  {
    id: "demo-c2",
    paciente: "João Pereira Lima",
    contexto: "compartilhamento_dados",
    aceito: "Sim",
    assinatura: "Assinado digitalmente",
    registradoPor: "Carlos Mendes",
    quando: "10/06/2026 14:12",
  },
];

/**
 * Log de acessos a prontuários (mais recentes primeiro).
 * Admin-only; vazio para quem não é gestor. Resiliente a erro de query.
 */
export async function getAccessLogs(opts?: {
  limit?: number;
}): Promise<AccessLogRow[]> {
  const limit = opts?.limit ?? 100;

  // Reforço de autorização no servidor (além do RLS admin-only).
  if (!(await isGestor())) return [];

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("access_logs")
      .select(
        "id, created_at, user_name, user_role, patient_name, module, action",
      )
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error || !data) return [];

    return data.map((r) => {
      const role = (r.user_role as string | null) ?? "";
      const acao = (r.action as string | null) ?? "view";
      return {
        id: r.id as string,
        quando: fmtDataHora(r.created_at as string | null),
        usuario: (r.user_name as string | null) ?? "—",
        papel: PAPEL_LABEL[role] ?? (role || "—"),
        paciente: (r.patient_name as string | null) ?? "—",
        modulo: (r.module as string | null) ?? "—",
        acao: ACAO_LABEL[acao] ?? acao,
      };
    });
  } catch {
    return [];
  }
}

/**
 * Log de consentimentos registrados (mais recentes primeiro).
 * Admin-only; resiliente caso a tabela/coluna `created_by` ainda não exista.
 */
export async function getConsentLogs(): Promise<ConsentLogRow[]> {

  if (!(await isGestor())) return [];

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("consents")
      .select(
        "id, context, accepted, signature, created_at, patients(full_name), created_by_profile:profiles!consents_created_by_fkey(full_name)",
      )
      .order("created_at", { ascending: false })
      .limit(200);

    if (error || !data) return [];

    return data.map((r) => {
      const pat = Array.isArray(r.patients) ? r.patients[0] : r.patients;
      const by = Array.isArray(r.created_by_profile)
        ? r.created_by_profile[0]
        : r.created_by_profile;
      return {
        id: r.id as string,
        paciente: (pat?.full_name as string | null) ?? "—",
        contexto: (r.context as string | null) ?? "—",
        aceito: r.accepted ? "Sim" : "Não",
        assinatura: r.signature ? "Assinado" : "—",
        registradoPor: (by?.full_name as string | null) ?? "—",
        quando: fmtDataHora(r.created_at as string | null),
      };
    });
  } catch {
    return [];
  }
}

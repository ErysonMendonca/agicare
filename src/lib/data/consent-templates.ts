import { createClient } from "@/lib/supabase/server";

// ════════════════════════════════════════════════════════════════
// Catálogo de TERMOS DE CONSENTIMENTO (public.consent_templates, migration
// 0107). Documentos padronizados (título + texto longo) que a recepção
// imprime ao salvar a Ficha de Atendimento, para assinatura em papel.
// Server-only; escopo por clínica via RLS. Espelha listProductCategories
// (com fallback demo para a tela nunca nascer vazia).
// ════════════════════════════════════════════════════════════════

export type ConsentTemplate = {
  id: string;
  title: string;
  body: string;
  active: boolean;
  sortOrder: number;
};

// Termo inicial — mesmo texto do seed (0107) e do bloco hoje hardcoded em
// FichaAtendimento.tsx. Usado como fallback em modo demo / sem dados / erro.
const DEMO_CONSENT_TEMPLATES: ConsentTemplate[] = [
  {
    id: "demo-consent-0",
    title: "Termo de Consentimento e Responsabilidade",
    body:
      "Declaro sob as penas da lei que as informações cadastrais prestadas acima são verdadeiras. " +
      "Autorizo a realização de consultas, exames e procedimentos indicados, consentindo com o tratamento " +
      "médico necessário. Declaro também estar ciente de que as despesas não cobertas pelo meu convênio " +
      "são de minha inteira responsabilidade, comprometendo-me a quitá-las diretamente com esta instituição.",
    active: true,
    sortOrder: 0,
  },
];

type Row = {
  id: string;
  title: string;
  body: string;
  active: boolean | null;
  sort_order: number | null;
};

function toTemplate(row: Row): ConsentTemplate {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    active: row.active ?? true,
    sortOrder: row.sort_order ?? 0,
  };
}

/**
 * TODOS os termos da clínica ativa (ativos e inativos), ordenados por
 * sort_order — para a tela de gestão do admin em Configurações. Em modo demo
 * (ou sem dados/erro de leitura) devolve o termo de exemplo.
 */
export async function listConsentTemplates(): Promise<ConsentTemplate[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("consent_templates")
    .select("id, title, body, active, sort_order")
    .order("sort_order", { ascending: true });

  if (error || !data || data.length === 0) return DEMO_CONSENT_TEMPLATES;

  return (data as Row[]).map(toTemplate);
}

/**
 * Apenas os termos ATIVOS da clínica ativa, ordenados por sort_order — usado
 * pelo modal de impressão da Ficha de Atendimento. Em modo demo (ou sem
 * dados/erro) devolve o termo de exemplo.
 */
export async function listActiveConsentTemplates(): Promise<ConsentTemplate[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("consent_templates")
    .select("id, title, body, active, sort_order")
    .eq("active", true)
    .order("sort_order", { ascending: true });

  if (error || !data || data.length === 0) return DEMO_CONSENT_TEMPLATES;

  return (data as Row[]).map(toTemplate);
}

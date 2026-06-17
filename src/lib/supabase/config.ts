/**
 * Detecta se o Supabase está realmente configurado (chaves reais, não placeholders).
 * Enquanto não estiver, o app roda em "modo demo": o gate de auth do proxy é
 * relaxado e um usuário fictício é usado, para o protótipo ser navegável sem backend.
 */
export function isSupabaseConfigured(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  if (!url || !anon) return false;
  if (url.includes("SEU-PROJETO")) return false;
  if (anon.startsWith("PLACEHOLDER")) return false;
  return true;
}

/**
 * Modo demo: ativo SOMENTE fora de produção e sem Supabase configurado.
 * Segurança: em produção, a ausência de chaves NÃO libera o app (fail-closed) —
 * produção exige Supabase configurado.
 */
export function isDemoMode(): boolean {
  return !isSupabaseConfigured() && process.env.NODE_ENV !== "production";
}

/** Usuário fictício usado no modo demo (sem Supabase). */
export const DEMO_USER = {
  name: "Dr. João Silva",
  role: "Médico",
};

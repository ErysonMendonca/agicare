import { createClient } from "@/lib/supabase/server";

/**
 * Resolve o `professional_id` do usuário logado — necessário para gravar
 * dado clínico (medical_records, prescriptions, anamneses, certificates).
 * Server-only (usa o cliente de servidor com cookies).
 */
export async function getMyProfessionalId(
  userId: string,
): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("professionals")
    .select("id")
    .eq("profile_id", userId)
    .maybeSingle();
  return (data?.id as string | null) ?? null;
}

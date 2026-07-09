import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { getActiveClinicId } from "@/lib/tenant";

/**
 * Loader da tela "Minha Conta" (self-service): dados do PRÓPRIO usuário logado.
 *
 * Escopo: identidade (profiles) + dados pessoais/contato/endereço (professionals,
 * quando houver linha do profissional na clínica ativa). NÃO expõe conselho,
 * convênios, credenciais ou papel — só o que o usuário pode editar de si mesmo.
 *
 * Server-only: usa o cliente de servidor (RLS + cookies). A leitura de
 * `professionals` é permitida a staff pela RLS (profiles_select_own / is_staff),
 * e o filtro por profile_id + clinic_id garante que só a própria linha é lida.
 */

const s = (v: unknown): string => (typeof v === "string" ? v : "");

export type MyAccount = {
  userId: string;
  role: string;
  username: string | null;
  full_name: string;
  social_name: string;
  birth_date: string;
  sex: string;
  phone: string;
  contactEmail: string;
  cep: string;
  address: string;
  address_number: string;
  complement: string;
  neighborhood: string;
  city: string;
  state: string;
  hasProfessional: boolean;
};

export async function getMyAccount(): Promise<MyAccount | null> {
  // Modo demo: mock coerente para o protótipo navegável sem backend.


  const current = await getCurrentUser();
  if (!current) return null;

  const userId = current.userId;
  const supabase = await createClient();

  // Identidade global (o próprio profile — RLS profiles_select_own).
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, phone, username, role")
    .eq("id", userId)
    .maybeSingle();

  const account: MyAccount = {
    userId,
    role: s(profile?.role) || s(current.profile?.role),
    username: (profile?.username as string | null) ?? null,
    full_name: s(profile?.full_name),
    social_name: "",
    birth_date: "",
    sex: "",
    phone: s(profile?.phone),
    contactEmail: "",
    cep: "",
    address: "",
    address_number: "",
    complement: "",
    neighborhood: "",
    city: "",
    state: "",
    hasProfessional: false,
  };

  // Dados pessoais/contato/endereço vivem em professionals (por clínica).
  const clinicId = await getActiveClinicId();
  if (clinicId) {
    const { data: prof } = await supabase
      .from("professionals")
      .select(
        "social_name, birth_date, sex, email, cep, address, address_number, complement, neighborhood, city, state",
      )
      .eq("profile_id", userId)
      .eq("clinic_id", clinicId)
      .maybeSingle();

    if (prof) {
      account.hasProfessional = true;
      account.social_name = s(prof.social_name);
      account.birth_date = s(prof.birth_date);
      account.sex = s(prof.sex);
      account.contactEmail = s(prof.email);
      account.cep = s(prof.cep);
      account.address = s(prof.address);
      account.address_number = s(prof.address_number);
      account.complement = s(prof.complement);
      account.neighborhood = s(prof.neighborhood);
      account.city = s(prof.city);
      account.state = s(prof.state);
    }
  }

  return account;
}

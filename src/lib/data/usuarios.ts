import { createClient } from "@/lib/supabase/server";
import { getActiveClinicId } from "@/lib/tenant";
import { rotuloBase, type Cargo, type Usuario } from "@/lib/data/usuarios.shared";

export {
  BASE_ROLES,
  rotuloBase,
  type Cargo,
  type Usuario,
} from "@/lib/data/usuarios.shared";

const MOCK_CARGOS: Cargo[] = [
  { id: "c1", nome: "Fisioterapeuta", baseRole: "medico" },
];
const MOCK_USUARIOS: Usuario[] = [
  { userId: "u1", nome: "Dr. João Pedro Oliveira", username: "joao.oliveira", roleBase: "medico", cargoId: null, cargoLabel: "Médico", ativo: true },
  { userId: "u2", nome: "Recepção Central", username: "recepcao", roleBase: "recepcao", cargoId: null, cargoLabel: "Recepção", ativo: true },
  { userId: "u3", nome: "Ana (Fisio)", username: null, roleBase: "medico", cargoId: "c1", cargoLabel: "Fisioterapeuta", ativo: true },
];

/** Cargos personalizados da clínica ativa. */
export async function listCargos(): Promise<Cargo[]> {
  const clinicId = await getActiveClinicId();
  if (!clinicId) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("cargos")
    .select("id, name, base_role")
    .eq("clinic_id", clinicId)
    .order("name", { ascending: true });
  if (error || !data) return [];
  return data.map((c) => ({
    id: c.id as string,
    nome: (c.name as string | null) ?? "—",
    baseRole: (c.base_role as string | null) ?? "recepcao",
  }));
}

/**
 * Usuários (membros) da clínica ativa, EXCETO pacientes. Traz o cargo-base e o
 * cargo personalizado (rótulo). Admin-only na prática (a tela é admin).
 */
export async function listUsuarios(): Promise<Usuario[]> {
  const clinicId = await getActiveClinicId();
  if (!clinicId) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("clinic_members")
    .select(
      "user_id, role, active, cargo_id, profiles(full_name, username), cargos(name)",
    )
    .eq("clinic_id", clinicId)
    .neq("role", "paciente")
    .order("role", { ascending: true });
  if (error || !data) return [];

  const one = <T,>(v: unknown): T | null =>
    Array.isArray(v) ? ((v[0] ?? null) as T | null) : ((v as T) ?? null);

  return data.map((m) => {
    const perfil = one<{ full_name: string | null; username: string | null }>(
      m.profiles,
    );
    const cargo = one<{ name: string | null }>(m.cargos);
    const roleBase = (m.role as string | null) ?? "recepcao";
    return {
      userId: m.user_id as string,
      nome: perfil?.full_name ?? "—",
      username: perfil?.username ?? null,
      roleBase,
      cargoId: (m.cargo_id as string | null) ?? null,
      cargoLabel: cargo?.name ?? rotuloBase(roleBase),
      ativo: !!m.active,
    };
  });
}

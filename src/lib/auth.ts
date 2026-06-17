import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { isDemoMode } from '@/lib/supabase/config'
import { getActiveClinicId, multitenantSchemaMissing } from '@/lib/tenant'

/**
 * Papéis do sistema agicare. A IDENTIDADE global do usuário vive em
 * `profiles` (1:1 com auth.users); o PAPEL EFETIVO é POR CLÍNICA e vive em
 * `clinic_members.role` (lido na clínica ativa — ver getRole()).
 */
export type Role = 'admin' | 'medico' | 'recepcao' | 'paciente'

export type Profile = {
  id: string
  full_name: string | null
  role: Role
  avatar_url: string | null
}

/**
 * Retorna o usuário autenticado + seu profile, ou null se não houver sessão.
 * Server-only (usa o cliente de servidor com cookies).
 */
export async function getCurrentUser(): Promise<{
  userId: string
  email: string | null
  profile: Profile | null
} | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, full_name, role, avatar_url')
    .eq('id', user.id)
    .single()

  return {
    userId: user.id,
    email: user.email ?? null,
    profile: (profile as Profile | null) ?? null,
  }
}

/**
 * Papel efetivo do usuário logado NA CLÍNICA ATIVA. Em modo demo retorna 'admin'
 * — conceitualmente "admin da CLÍNICA DEMO" (DEMO_CLINIC_ID em src/lib/tenant.ts),
 * nunca de um tenant real. Use para decidir o que renderizar por papel em Server
 * Components.
 *
 * TENANT-AWARE (multitenant): o papel vem de `clinic_members.role` da clínica
 * ATIVA (claim do JWT), NÃO mais de `profiles.role` (que é identidade global).
 * Fail-closed: sem clínica ativa, sem sessão ou sem membership ativo na clínica →
 * null (o chamador deve tratar como "sem acesso"). A RLS (0021) já nega tudo
 * nesse caso; aqui reforçamos no servidor.
 */
export async function getRole(): Promise<Role | null> {
  if (isDemoMode()) return 'admin'

  const clinicId = await getActiveClinicId()
  if (!clinicId) return null // sem clínica ativa → fail-closed

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const asRole = (r: unknown): Role | null =>
    r === 'admin' || r === 'medico' || r === 'recepcao' || r === 'paciente'
      ? r
      : null

  // Papel POR clínica: membership ativo do usuário na clínica ativa.
  const { data: membership, error } = await supabase
    .from('clinic_members')
    .select('role')
    .eq('user_id', user.id)
    .eq('clinic_id', clinicId)
    .eq('active', true)
    .maybeSingle()

  // MONO-CLÍNICA (multitenant não provisionado): o papel efetivo é o papel
  // GLOBAL do profile — caso contrário todo usuário real ficaria sem papel.
  if (error && multitenantSchemaMissing(error)) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()
    return asRole(profile?.role)
  }

  return asRole(membership?.role)
}

/** Conveniência: o usuário é gestor? (gestor = papel `admin`). */
export async function isGestor(): Promise<boolean> {
  return (await getRole()) === 'admin'
}

/**
 * Exige sessão. Redireciona para /login se não houver. Retorna o usuário+profile.
 */
export async function requireUser() {
  const current = await getCurrentUser()
  if (!current) redirect('/login')
  return current
}

/**
 * Exige um dos papéis informados NA CLÍNICA ATIVA. Redireciona se não autorizado.
 * Reforço de autorização no servidor (a checagem do proxy é só otimista).
 *
 * O papel vem do `getRole()` tenant-aware (clinic_members na clínica ativa). Se
 * não houver papel (sem clínica/sem membership) → redireciona (fail-closed).
 */
export async function requireRole(...roles: Role[]) {
  const current = await requireUser()
  const role = await getRole()
  if (!role || !roles.includes(role)) {
    redirect('/login')
  }
  return current
}

/**
 * Reforço de autorização no servidor para dado clínico (LGPD): só admin ou médico
 * NA CLÍNICA ATIVA. Diferente de `requireRole`, NÃO redireciona — devolve um
 * resultado (`{ error }` ou `{ userId }`) para que Server Actions retornem o erro
 * ao formulário. Use nas actions de prontuário (prescrição, exames, protético).
 *
 * TENANT-AWARE: o papel vem de `getRole()` (clinic_members da clínica ativa),
 * NÃO do `profiles.role` global. Em modo demo `getRole()` retorna 'admin' → passa.
 */
export async function requireClinico(): Promise<
  { error: string } | { userId: string }
> {
  const current = await getCurrentUser()
  if (!current) return { error: 'Sessão expirada.' }
  const role = await getRole()
  if (role !== 'admin' && role !== 'medico') {
    return { error: 'Acesso restrito a médico ou administrador.' }
  }
  return { userId: current.userId }
}

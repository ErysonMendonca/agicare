import { cache } from 'react'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

/**
 * Contexto de TENANT (clínica ativa) — fiação de aplicação do multitenant.
 *
 * A clínica ativa do usuário vem de um CLAIM do JWT
 * (`app_metadata.active_clinic_id`), carimbado pelo Custom Access Token Hook
 * (migration 0022). Aqui apenas LEMOS esse claim do lado da aplicação — o
 * isolamento real de dados é garantido pela RLS (0021) via current_clinic_id().
 *
 * Fail-closed: se o claim estiver ausente, retornamos null e o chamador deve
 * tratar como "sem clínica" (a RLS já nega tudo nesse caso).
 */

/** Clínica padrão (existente). Reusada como a clínica do modo demo / mono-clínica. */
export const DEMO_CLINIC_ID = '00000000-0000-0000-0000-000000000001'

export type MyClinic = {
  id: string
  name: string
  role: 'admin' | 'medico' | 'recepcao' | 'paciente'
}

/**
 * Detecta "schema multitenant NÃO provisionado" (migrations 0020-0022 ainda não
 * aplicadas → tabela clinic_members ausente). Nesse caso o app opera em
 * MONO-CLÍNICA (clínica padrão), sem derrubar login/navegação.
 */
export function multitenantSchemaMissing(
  error: { code?: string; message?: string } | null | undefined,
): boolean {
  if (!error) return false
  const code = error.code ?? ''
  const msg = error.message ?? ''
  return (
    code === 'PGRST205' ||
    code === '42P01' ||
    /could not find the table|does not exist|schema cache/i.test(msg)
  )
}

/** Multitenant está provisionado no banco? (probe em clinic_members; cache por request). */
export const isMultitenantProvisioned = cache(async (): Promise<boolean> => {
  const supabase = await createClient()
  const { error } = await supabase.from('clinic_members').select('clinic_id').limit(1)
  return !multitenantSchemaMissing(error)
})

/**
 * ID da clínica ativa do usuário logado (claim app_metadata.active_clinic_id).
 *
 * - Modo demo → DEMO_CLINIC_ID (protótipo navegável sem backend).
 * - Caso real → lê o claim do JWT via `auth.getUser()`. Fail-closed: null se
 *   ausente/sem sessão.
 *
 * `cache()` deduplica a chamada por request (é consultada em vários pontos).
 */
export const getActiveClinicId = cache(async (): Promise<string | null> => {

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  // app_metadata é carimbado pelo Access Token Hook (0022).
  const claim = (user.app_metadata as Record<string, unknown> | undefined)?.[
    'active_clinic_id'
  ]
  if (typeof claim === 'string' && claim.length > 0) return claim

  // Sem claim: se o multitenant NÃO está provisionado, opera em mono-clínica
  // (clínica padrão) em vez de fail-closed — assim login/ações não quebram.
  if (!(await isMultitenantProvisioned())) return DEMO_CLINIC_ID
  return null
})

/**
 * Clínicas (ativas) das quais o usuário logado é membro, com o papel POR clínica.
 * Usada para popular o seletor de clínica PÓS-autenticação (nunca antes — evita
 * vazar a lista de tenants).
 *
 * Em demo → 1 clínica fake (a default). Em caso real, uma falha de CONSULTA
 * (rede/RLS/infra) PROPAGA — não mascaramos erro de infra como "sem clínicas".
 * Só retornamos lista vazia quando ela é legítima (sem sessão / sem membership).
 */
export const getMyClinics = cache(async (): Promise<MyClinic[]> => {

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return [] // sem sessão → vazio legítimo

  // RLS de clinic_members (0020): cada um lê o próprio vínculo. O join em
  // clinics é coberto pela policy clinics_member_read.
  const { data, error } = await supabase
    .from('clinic_members')
    .select('role, clinics:clinic_id ( id, name )')
    .eq('user_id', user.id)
    .eq('active', true)

  if (error) {
    // Multitenant não provisionado (clinic_members ausente) → mono-clínica.
    if (multitenantSchemaMissing(error)) {
      return [{ id: DEMO_CLINIC_ID, name: 'Clínica Padrão', role: 'admin' }]
    }
    // Erro real de infra (rede/RLS): propaga (não mascara como "sem clínicas").
    throw new Error(`Falha ao carregar clínicas do usuário: ${error.message}`)
  }

  return (data ?? [])
    .map((row) => {
      const clinic = row.clinics as unknown as
        | { id: string; name: string }
        | null
      if (!clinic) return null
      return {
        id: clinic.id,
        name: clinic.name,
        role: row.role as MyClinic['role'],
      }
    })
    .filter((c): c is MyClinic => c !== null)
})

/**
 * Exige uma clínica ativa. Retorna o id ou redireciona para a raiz (seleção de
 * clínica / login) se ausente. Use em Server Components que dependem de tenant.
 */
export async function requireClinic(): Promise<string> {
  const clinicId = await getActiveClinicId()
  if (!clinicId) redirect('/')
  return clinicId
}

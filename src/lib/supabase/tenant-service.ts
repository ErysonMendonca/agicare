import type { SupabaseClient } from '@supabase/supabase-js'
import { createServiceClient } from '@/lib/supabase/service'
import { getCurrentUser } from '@/lib/auth'
import { getActiveClinicId, DEMO_CLINIC_ID } from '@/lib/tenant'

/**
 * withTenantService — uso de SERVICE-ROLE com isolamento MANUAL de tenant.
 *
 * ⚠️ O service-role IGNORA a RLS → ignora o tenant. Portanto, dentro deste
 * wrapper o isolamento é responsabilidade do CHAMADOR. REGRA OBRIGATÓRIA:
 *   • TODO insert  → setar `clinic_id: clinicId`.
 *   • TODO select/update/delete → filtrar `.eq('clinic_id', clinicId)`.
 * Sem isso, há vazamento/escrita cross-tenant.
 *
 * O wrapper centraliza as pré-condições antes de entregar o client:
 *   (a) resolve `adminUserId` = usuário logado;
 *   (b) resolve `clinicId`    = clínica ativa (claim do JWT);
 *   (c) VALIDA que o logado é admin ATIVO naquela clínica (clinic_members
 *       role='admin'). Se qualquer pré-condição falhar → lança TenantAuthError
 *       e o callback NÃO executa.
 *
 * Só usar para operações administrativas que legitimamente precisam de
 * service-role (ex.: criar conta Auth, gerenciar memberships). Para o resto,
 * prefira o client de servidor com RLS.
 */

export class TenantAuthError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TenantAuthError'
  }
}

export type TenantServiceCtx = {
  /** Client service-role (ignora RLS). */
  svc: SupabaseClient
  /** Clínica ativa do admin logado — carimbe/filtre por ela SEMPRE. */
  clinicId: string
  /** Usuário logado (admin validado na clínica ativa). */
  adminUserId: string
}

/**
 * Executa `fn` com o contexto de tenant resolvido e validado.
 * @throws TenantAuthError se não houver sessão, clínica ativa, ou se o usuário
 *         não for admin ativo na clínica ativa.
 */
export async function withTenantService<T>(
  fn: (ctx: TenantServiceCtx) => Promise<T>,
): Promise<T> {
  // (a) usuário logado
  const current = await getCurrentUser()
  // Em demo não há sessão real, mas o protótipo opera como "admin da clínica demo".
  const adminUserId = current?.userId ?? 'demo-user'

  if (!current) {
    throw new TenantAuthError('Sessão expirada.')
  }

  // (b) clínica ativa
  const clinicId = await getActiveClinicId()
  if (!clinicId) {
    throw new TenantAuthError('Nenhuma clínica ativa selecionada.')
  }

  const svc = createServiceClient()

  // (c) admin ATIVO na clínica ativa. Em demo, libera (clínica demo).
  
    const { data: membership, error } = await svc
      .from('clinic_members')
      .select('role')
      .eq('user_id', adminUserId)
      .eq('clinic_id', clinicId)
      .eq('active', true)
      .maybeSingle()

    if (error) {
      throw new TenantAuthError('Não foi possível validar o acesso à clínica.')
    }
    if (!membership || membership.role !== 'admin') {
      throw new TenantAuthError('Você não tem permissão de administrador nesta clínica.')
    }

  return fn({
    svc,
    clinicId: clinicId,
    adminUserId,
  })
}

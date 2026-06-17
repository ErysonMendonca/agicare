import { z } from 'zod'

/**
 * Política de senha — validadores PUROS (só Zod, sem dependências de servidor).
 *
 * Mora num módulo isolado de propósito: tanto a borda de SERVIDOR (action de
 * troca de senha) quanto o CLIENT (formulário com react-hook-form) precisam do
 * MESMO schema. Se isto vivesse em `integrations/session.ts` (que importa
 * `next/server` e `@supabase/ssr`), importá-lo no client arrastaria código
 * server-only para o bundle do browser. Aqui não há esse risco.
 *
 * `integrations/session.ts` re-exporta tudo daqui (compat com importadores
 * antigos).
 */

/** Política de senha (espelha clinic_settings.security.passwordPolicy). */
export type PasswordPolicy = 'baixa' | 'media' | 'alta'

/**
 * Constrói o schema de senha conforme a política da clínica:
 *   • baixa → mín 8, com letra e número.
 *   • media → mín 8, com maiúscula, minúscula e número.
 *   • alta  → mín 10, com maiúscula, minúscula, número E símbolo.
 *
 * O BASELINE do projeto é 'alta' (escopo 15.1: mín 10 + símbolo) — é o default
 * de `senhaSchema`. A action de troca de senha deve preferir a política vigente
 * em clinic_settings.security.passwordPolicy.
 */
export function buildSenhaSchema(policy: PasswordPolicy = 'alta') {
  const min = policy === 'alta' ? 10 : 8
  let schema = z
    .string()
    .min(min, `A senha deve ter ao menos ${min} caracteres.`)
    .max(72, 'A senha é longa demais.')
    .refine((s) => /\d/.test(s), 'Inclua ao menos um número.')

  // 'media' e 'alta' exigem maiúscula + minúscula; 'baixa' pede só letra.
  if (policy === 'media' || policy === 'alta') {
    schema = schema
      .refine((s) => /[A-Z]/.test(s), 'Inclua ao menos uma letra maiúscula.')
      .refine((s) => /[a-z]/.test(s), 'Inclua ao menos uma letra minúscula.')
  } else {
    schema = schema.refine(
      (s) => /[a-zA-Z]/.test(s),
      'Inclua ao menos uma letra.',
    )
  }

  // 'alta' exige caractere especial (símbolo).
  if (policy === 'alta') {
    schema = schema.refine(
      (s) => /[^A-Za-z0-9]/.test(s),
      'Inclua ao menos um caractere especial (ex.: !@#$%).',
    )
  }
  return schema
}

/** Schema padrão de senha — política 'alta' (mín 10 + símbolo), alinhado ao escopo. */
export const senhaSchema = buildSenhaSchema('alta')

/**
 * Normaliza um valor cru de política para o tipo `PasswordPolicy` (fallback
 * 'alta' — o baseline mais seguro do projeto).
 */
export function normalizePolicy(value: unknown): PasswordPolicy {
  return value === 'alta' || value === 'media' || value === 'baixa'
    ? value
    : 'alta'
}

/**
 * Valida a política de senha; retorna `{ ok }` ou `{ ok:false, error }`.
 * Aceita a política vigente (clinic_settings.security.passwordPolicy); sem
 * argumento, usa o baseline 'alta'.
 */
export function validarPoliticaSenha(
  senha: string,
  policy?: PasswordPolicy,
): { ok: true } | { ok: false; error: string } {
  const schema = policy ? buildSenhaSchema(policy) : senhaSchema
  const parsed = schema.safeParse(senha)
  if (parsed.success) return { ok: true }
  return { ok: false, error: parsed.error.issues[0]?.message ?? 'Senha inválida.' }
}

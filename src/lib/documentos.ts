/**
 * Máscaras de digitação para documentos/valores com formato padrão (BR).
 * Todas formatam progressivamente enquanto o usuário digita e são idempotentes
 * (reextraem os dígitos da entrada já mascarada). Espelham o padrão de
 * `telefone.ts`. Para validar/comparar, use os extratores `*Digitos`.
 */

/** Só os dígitos, limitados a `max`. */
function digitos(valor: string, max: number): string {
  return valor.replace(/\D/g, "").slice(0, max);
}

/** CPF → "000.000.000-00" (progressivo). */
export function formatCpf(valor: string): string {
  const d = digitos(valor, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

/** CNPJ → "00.000.000/0000-00" (progressivo). */
export function formatCnpj(valor: string): string {
  const d = digitos(valor, 14);
  if (d.length <= 2) return d;
  if (d.length <= 5) return `${d.slice(0, 2)}.${d.slice(2)}`;
  if (d.length <= 8) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`;
  if (d.length <= 12)
    return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8)}`;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

/** CEP → "00000-000" (progressivo). */
export function formatCep(valor: string): string {
  const d = digitos(valor, 8);
  if (d.length <= 5) return d;
  return `${d.slice(0, 5)}-${d.slice(5)}`;
}

/** CNS (Cartão SUS, 15 dígitos) → "000 0000 0000 0000" (progressivo). */
export function formatCns(valor: string): string {
  const d = digitos(valor, 15);
  const partes: string[] = [];
  if (d.length > 0) partes.push(d.slice(0, 3));
  if (d.length > 3) partes.push(d.slice(3, 7));
  if (d.length > 7) partes.push(d.slice(7, 11));
  if (d.length > 11) partes.push(d.slice(11, 15));
  return partes.join(" ");
}

export const cpfDigitos = (v: string) => digitos(v, 11);
export const cnpjDigitos = (v: string) => digitos(v, 14);
export const cepDigitos = (v: string) => digitos(v, 8);
export const cnsDigitos = (v: string) => digitos(v, 15);

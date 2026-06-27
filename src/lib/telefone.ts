/**
 * Máscara adaptativa de telefone (BR):
 * - 11 dígitos (celular) → "(XX) X XXXX-XXXX" (9º dígito destacado)
 * - 10 dígitos (fixo)    → "(XX) XXXX-XXXX"
 * Formata progressivamente enquanto digita. Aceita entrada já mascarada
 * (reextrai os dígitos), então é idempotente.
 */
export function formatTelefone(valor: string): string {
  const d = valor.replace(/\D/g, "").slice(0, 11);
  if (d.length === 0) return "";
  if (d.length <= 2) return `(${d}`;

  const ddd = d.slice(0, 2);
  const resto = d.slice(2);

  if (d.length <= 6) return `(${ddd}) ${resto}`;
  if (d.length <= 10) return `(${ddd}) ${resto.slice(0, 4)}-${resto.slice(4)}`;
  // 11 dígitos → celular com o 9º dígito separado.
  return `(${ddd}) ${resto[0]} ${resto.slice(1, 5)}-${resto.slice(5)}`;
}

/** Só os dígitos de um telefone (útil para validar/comparar). */
export function telefoneDigitos(valor: string): string {
  return valor.replace(/\D/g, "").slice(0, 11);
}

/**
 * Validação do CNS (Cartão Nacional de Saúde) — 15 dígitos.
 *
 * Algoritmo oficial do DATASUS. Há duas famílias:
 *  - Definitivos: começam com 1 ou 2 — o DV deriva do PIS (11 primeiros dígitos).
 *  - Provisórios: começam com 7, 8 ou 9 — soma ponderada com resto 0 (mod 11).
 */
export function isValidCNS(value: string): boolean {
  const c = value.replace(/\D/g, "");
  if (c.length !== 15 || /^(\d)\1{14}$/.test(c)) return false;

  const inicio = c[0];
  if (inicio === "1" || inicio === "2") return validaDefinitivo(c);
  if (inicio === "7" || inicio === "8" || inicio === "9") return validaProvisorio(c);
  return false;
}

/** Definitivo (1/2): reconstrói os 15 dígitos a partir do PIS e compara. */
function validaDefinitivo(c: string): boolean {
  const pis = c.slice(0, 11);

  let soma = 0;
  for (let i = 0; i < 11; i++) soma += parseInt(pis[i], 10) * (15 - i);

  let resto = soma % 11;
  let dv = 11 - resto;
  if (dv === 11) dv = 0;

  let resultado: string;
  if (dv === 10) {
    soma += 2;
    resto = soma % 11;
    dv = 11 - resto;
    resultado = `${pis}001${dv}`;
  } else {
    resultado = `${pis}000${dv}`;
  }

  return resultado === c;
}

/** Provisório (7/8/9): soma ponderada (pesos 15..1) divisível por 11. */
function validaProvisorio(c: string): boolean {
  let soma = 0;
  for (let i = 0; i < 15; i++) soma += parseInt(c[i], 10) * (15 - i);
  return soma % 11 === 0;
}

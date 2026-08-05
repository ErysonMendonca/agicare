// ════════════════════════════════════════════════════════════════
// Formatação de data para pt-BR, sem o desvio de um dia.
//
// O problema que isto resolve: `new Date("1985-03-15")` é interpretado pelo
// JS como meia-noite em UTC. Ao formatar com toLocaleDateString em GMT-3, o
// resultado é 14/03/1985 — um dia antes do que está gravado. Isso afeta TODA
// coluna `date` (nascimento, validade de convênio, data de óbito, validade
// de esterilização), mas não afeta `timestamp`, que já carrega o fuso.
//
// A correção: quando a string é uma data pura (YYYY-MM-DD), formata pelos
// componentes, sem construir um Date. Com data e hora, o caminho normal
// continua valendo.
// ════════════════════════════════════════════════════════════════

const SO_DATA = /^(\d{4})-(\d{2})-(\d{2})$/;

/** "1985-03-15" → "15/03/1985". Devolve null para vazio/inválido. */
export function dataBR(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const s = String(iso);
  const m = SO_DATA.exec(s);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString("pt-BR");
}

/** Data + hora. Aqui o valor é timestamp (com fuso), então Date é correto. */
export function dataHoraBR(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const s = String(iso);
  // Data pura não tem hora a mostrar — devolve só a data.
  if (SO_DATA.test(s)) return dataBR(s);
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.toLocaleDateString("pt-BR")} ${d.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

/**
 * Idade em anos a partir da data de nascimento. Também precisa evitar o
 * Date com data pura: em GMT-3 o aniversário "viraria" um dia antes, o que
 * muda a idade de quem faz aniversário hoje.
 */
export function idadeAnos(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const m = SO_DATA.exec(String(iso));
  const hoje = new Date();
  let ano: number, mes: number, dia: number;
  if (m) {
    ano = Number(m[1]); mes = Number(m[2]); dia = Number(m[3]);
  } else {
    const d = new Date(String(iso));
    if (Number.isNaN(d.getTime())) return null;
    ano = d.getFullYear(); mes = d.getMonth() + 1; dia = d.getDate();
  }
  let idade = hoje.getFullYear() - ano;
  const mesAtual = hoje.getMonth() + 1;
  if (mesAtual < mes || (mesAtual === mes && hoje.getDate() < dia)) idade -= 1;
  return idade < 0 ? null : idade;
}

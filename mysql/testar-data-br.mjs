// Testes de src/lib/format/data-br.ts — o desvio de um dia em coluna `date`.
//   node mysql/testar-data-br.mjs
import { execSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";

const RAIZ = "/sessions/admiring-sleepy-gauss/mnt/agicare";
const TMP = "/tmp/data-br-test";
mkdirSync(TMP, { recursive: true });
execSync(
  `npx esbuild ${RAIZ}/src/lib/format/data-br.ts --outdir=${TMP} ` +
  `--format=esm --platform=node --log-level=error`,
  { cwd: RAIZ, stdio: "inherit" },
);

// Roda no fuso de São Paulo (GMT-3): é onde o bug aparecia.
process.env.TZ = "America/Sao_Paulo";
const { dataBR, dataHoraBR, idadeAnos } = await import(`${TMP}/data-br.js`);

let ok = 0;
const falhas = [];
const eq = (nome, obtido, esperado) => {
  if (obtido === esperado) ok++;
  else falhas.push(`${nome}: esperado ${JSON.stringify(esperado)}, obtido ${JSON.stringify(obtido)}`);
};

console.log(`TZ = ${process.env.TZ}\n`);

// ── O bug original ──
eq("data pura não recua um dia", dataBR("1985-03-15"), "15/03/1985");
eq("primeiro dia do mês", dataBR("2026-01-01"), "01/01/2026");
eq("29 de fevereiro (ano bissexto)", dataBR("2024-02-29"), "29/02/2024");
eq("último dia do ano", dataBR("2025-12-31"), "31/12/2025");

// ── Timestamp continua no caminho normal ──
eq("timestamp com Z é convertido para o fuso local",
  dataBR("2026-07-30T02:00:00Z"), "29/07/2026");
eq("dataHoraBR mostra data e hora",
  dataHoraBR("2026-07-29T13:45:00Z"), "29/07/2026 10:45");
eq("dataHoraBR com data pura devolve só a data",
  dataHoraBR("1985-03-15"), "15/03/1985");

// ── Vazio e inválido ──
eq("null", dataBR(null), null);
eq("string vazia", dataBR(""), null);
eq("inválido", dataBR("não é data"), null);

// ── Idade ──
const hoje = new Date();
const iso = (d) => d.toISOString().slice(0, 10);
const anos = (n, deltaDias = 0) => {
  const d = new Date(hoje);
  d.setFullYear(d.getFullYear() - n);
  d.setDate(d.getDate() + deltaDias);
  return iso(d);
};
eq("aniversário é HOJE → idade cheia", idadeAnos(anos(40)), 40);
eq("aniversário é AMANHÃ → ainda não completou", idadeAnos(anos(40, 1)), 39);
eq("aniversário foi ONTEM → já completou", idadeAnos(anos(40, -1)), 40);
eq("recém-nascido", idadeAnos(iso(hoje)), 0);
eq("idade de null", idadeAnos(null), null);

// A conta antiga (divisão por 365,25 dias) errava justamente o caso do
// aniversário no dia: confirma que agora não erra mais.
const nasc = anos(30);
const antiga = Math.floor(
  (Date.now() - new Date(nasc).getTime()) / (365.25 * 24 * 3600 * 1000));
console.log(`aniversário hoje (${nasc}): conta antiga = ${antiga}, nova = ${idadeAnos(nasc)}`);

rmSync(TMP, { recursive: true, force: true });
console.log(`\n${"═".repeat(56)}`);
console.log(`PASSOU: ${ok}   FALHOU: ${falhas.length}`);
console.log("═".repeat(56));
falhas.forEach((f) => console.log("  ✗ " + f));
process.exit(falhas.length ? 1 : 0);

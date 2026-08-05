// Gera src/lib/db/schema-meta.ts a partir de schema.json (introspecção do
// Postgres). O query builder usa esses metadados para:
//   · resolver embeds aninhados (professionals(profiles(full_name))) em JOIN
//   · saber o tipo de cada coluna (converter TINYINT→boolean, JSON→objeto)
//   · saber quais tabelas têm clinic_id (isolamento multitenant)
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const S = JSON.parse(readFileSync("/tmp/pgtest/schema.json", "utf8"));
const RAIZ = "/sessions/admiring-sleepy-gauss/mnt/agicare";

// ── Colunas por tabela, com o tipo MySQL correspondente ─────────────
const colsIndexadas = new Set();
for (const c of S.constraints) {
  const m = c.def.match(/^(?:PRIMARY KEY|UNIQUE)\s*\(([^)]*)\)/i);
  if (m) m[1].split(",").forEach((x) =>
    colsIndexadas.add(`${c.table_name}.${x.trim().replace(/"/g, "")}`));
  const fk = c.def.match(/^FOREIGN KEY \(([^)]*)\) REFERENCES ([^\s(]+)\(([^)]*)\)/i);
  if (fk) {
    fk[1].split(",").forEach((x) =>
      colsIndexadas.add(`${c.table_name}.${x.trim().replace(/"/g, "")}`));
    const alvo = fk[2].replace(/"/g, "").replace(/^public\./, "");
    fk[3].split(",").forEach((x) => colsIndexadas.add(`${alvo}.${x.trim().replace(/"/g, "")}`));
  }
}
for (const i of S.indices) {
  const m = i.indexdef.match(/\(([^)]*)\)(?:\s+WHERE|\s*$)/);
  if (m) m[1].split(",").forEach((x) => colsIndexadas.add(
    `${i.tablename}.${x.trim().replace(/"/g, "").replace(/\s+(ASC|DESC)$/i, "")}`));
}

/** Categoria lógica do valor, para converter o que vem do MySQL. */
function categoria(col) {
  const dt = col.data_type, udt = col.udt_name;
  if (udt === "uuid") return "uuid";
  if (dt === "boolean") return "boolean";
  if (dt === "jsonb" || dt === "json") return "json";
  if (dt === "ARRAY") return "array";
  if (["integer", "bigint", "smallint", "numeric", "double precision", "real"].includes(dt))
    return "number";
  if (dt === "date") return "date";
  if (dt.startsWith("timestamp")) return "timestamp";
  if (dt === "time without time zone" || dt === "time with time zone") return "time";
  if (dt === "USER-DEFINED") return "enum";
  return "text";
}

const tabelas = {};
for (const c of S.colunas) {
  (tabelas[c.table_name] ??= { colunas: {}, pk: [], temClinicId: false });
  tabelas[c.table_name].colunas[c.column_name] = categoria(c);
  if (c.column_name === "clinic_id") tabelas[c.table_name].temClinicId = true;
}
// auth_users não vem do Postgres (substitui auth.users) — declara à mão.
tabelas["auth_users"] = {
  colunas: {
    id: "uuid", email: "text", encrypted_password: "text",
    email_confirmed_at: "timestamp", last_sign_in_at: "timestamp",
    raw_user_meta_data: "json", created_at: "timestamp", updated_at: "timestamp",
  },
  pk: ["id"], temClinicId: false,
};

for (const c of S.constraints.filter((x) => x.contype === "p")) {
  const m = c.def.match(/^PRIMARY KEY\s*\(([^)]*)\)/i);
  if (m && tabelas[c.table_name]) {
    tabelas[c.table_name].pk = m[1].split(",").map((x) => x.trim().replace(/"/g, ""));
  }
}

// ── Grafo de FKs: como ir de uma tabela para outra ──────────────────
// Para cada tabela guardamos as relações que saem dela (FK própria, N:1) e
// as que chegam nela (FK de outra tabela, 1:N). O PostgREST resolve embeds
// pelos dois lados, então precisamos dos dois.
const relacoes = {};
for (const t of Object.keys(tabelas)) relacoes[t] = { paraUm: {}, paraMuitos: {} };

for (const c of S.constraints.filter((x) => x.contype === "f")) {
  const m = c.def.match(/^FOREIGN KEY \(([^)]*)\) REFERENCES ([\w."]+)\(([^)]*)\)/is);
  if (!m) continue;
  let alvo = m[2].replace(/"/g, "");
  if (/^auth\.users$/i.test(alvo)) alvo = "auth_users";
  else if (/^storage\./i.test(alvo)) continue;   // storage não existe em MySQL
  else alvo = alvo.replace(/^public\./, "");
  if (!tabelas[alvo] || !tabelas[c.table_name]) continue;

  const colunaLocal = m[1].split(",").map((x) => x.trim().replace(/"/g, ""))[0];
  const colunaAlvo = m[3].split(",").map((x) => x.trim().replace(/"/g, ""))[0];
  const rel = { fk: c.conname, de: c.table_name, colunaLocal, para: alvo, colunaAlvo };

  // N:1 — `queue_entries.select("professionals(...)")`. Pode haver mais de uma
  // FK para a mesma tabela (ex.: created_by e uploaded_by → auth_users); nesse
  // caso o código usa a dica `!nome_da_fk` ou `!coluna` para desambiguar.
  (relacoes[c.table_name].paraUm[alvo] ??= []).push(rel);
  // 1:N — `patients.select("appointments(...)")`
  (relacoes[alvo].paraMuitos[c.table_name] ??= []).push(rel);
}

// ── Emite o módulo TypeScript ──────────────────────────────────────
const ambiguos = [];
for (const [t, r] of Object.entries(relacoes)) {
  for (const [alvo, lista] of Object.entries(r.paraUm)) {
    if (lista.length > 1) ambiguos.push(`${t} → ${alvo} (${lista.length} FKs: ${lista.map((x) => x.colunaLocal).join(", ")})`);
  }
}

const ts = `// GERADO POR mysql/gerar-meta.mjs — NÃO EDITAR À MÃO.
//
// Metadados do schema usados pelo query builder MySQL:
//   · tipo lógico de cada coluna, para converter o que o driver devolve
//     (TINYINT→boolean, JSON string→objeto, DATETIME→ISO)
//   · grafo de chaves estrangeiras, para resolver embeds aninhados
//     (ex.: professionals(profiles(full_name))) em JOIN
//   · quais tabelas têm clinic_id, para o isolamento multitenant
//
// Regerar depois de mudar as migrations: node mysql/gerar-meta.mjs

/** Categoria lógica de uma coluna (decide a conversão de ida e volta). */
export type CategoriaColuna =
  | "uuid" | "text" | "number" | "boolean" | "json"
  | "array" | "date" | "timestamp" | "time" | "enum";

export type Relacao = {
  /** Nome da constraint no banco — usado pela dica \`!nome_da_fk\`. */
  fk: string;
  de: string;
  colunaLocal: string;
  para: string;
  colunaAlvo: string;
};

export type MetaTabela = {
  colunas: Record<string, CategoriaColuna>;
  pk: string[];
  temClinicId: boolean;
  /** FKs que SAEM desta tabela (N:1). Chave = tabela alvo. */
  paraUm: Record<string, Relacao[]>;
  /** FKs que APONTAM para esta tabela (1:N). Chave = tabela de origem. */
  paraMuitos: Record<string, Relacao[]>;
};

export const META: Record<string, MetaTabela> = ${JSON.stringify(
  Object.fromEntries(Object.entries(tabelas).map(([t, d]) => [t, {
    colunas: d.colunas,
    pk: d.pk,
    temClinicId: d.temClinicId,
    paraUm: relacoes[t].paraUm,
    paraMuitos: relacoes[t].paraMuitos,
  }])), null, 1)};

export function meta(tabela: string): MetaTabela {
  const m = META[tabela];
  if (!m) throw new Error(\`Tabela desconhecida no schema-meta: \${tabela}\`);
  return m;
}

/** Categoria de uma coluna; "text" como padrão para expressões/alias. */
export function categoriaColuna(tabela: string, coluna: string): CategoriaColuna {
  return META[tabela]?.colunas[coluna] ?? "text";
}
`;

mkdirSync(`${RAIZ}/src/lib/db`, { recursive: true });
writeFileSync(`${RAIZ}/src/lib/db/schema-meta.ts`, ts);

const nTab = Object.keys(tabelas).length;
const nCols = Object.values(tabelas).reduce((s, d) => s + Object.keys(d.colunas).length, 0);
const nRel = Object.values(relacoes).reduce((s, r) =>
  s + Object.values(r.paraUm).reduce((a, l) => a + l.length, 0), 0);
const nClinic = Object.values(tabelas).filter((d) => d.temClinicId).length;

console.log(`schema-meta.ts gerado`);
console.log(`  tabelas: ${nTab} | colunas: ${nCols} | relações N:1: ${nRel}`);
console.log(`  tabelas com clinic_id: ${nClinic} (isolamento multitenant automático)`);
console.log(`\nRelações AMBÍGUAS (>1 FK para a mesma tabela — exigem dica !fk no select):`);
ambiguos.forEach((a) => console.log(`  · ${a}`));

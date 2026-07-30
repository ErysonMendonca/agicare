// Linter semântico: pega os erros que a validação de sintaxe não pega mas
// que fariam o `mysql < arquivo.sql` falhar de verdade.
import { readFileSync } from "node:fs";

const sql = readFileSync("/tmp/pgtest/agicare_mysql.sql", "utf8");
const problemas = [];
const P = (sev, msg) => problemas.push({ sev, msg });

// ── Parse das tabelas geradas ───────────────────────────────────────
const tabelas = new Map(); // nome → { cols: Map(nome→tipo), pk: [], uniques: [] }
const reTable = /CREATE TABLE IF NOT EXISTS `(\w+)` \(([\s\S]*?)\n\) ENGINE=InnoDB/g;
let m;
while ((m = reTable.exec(sql))) {
  const nome = m[1];
  const corpo = m[2];
  const cols = new Map();
  const uniques = [];
  let pk = [];
  for (const raw of corpo.split("\n")) {
    const l = raw.trim().replace(/,$/, "");
    const cm = l.match(/^`(\w+)`\s+([A-Z]+(?:\([^)]*\))?(?:\s+UNSIGNED)?)/);
    if (cm && !/^(PRIMARY|UNIQUE|CONSTRAINT|KEY|INDEX)$/i.test(cm[1])) {
      cols.set(cm[1], { tipo: cm[2], linha: l });
      continue;
    }
    const pkm = l.match(/^PRIMARY KEY \((.*)\)$/i);
    if (pkm) pk = pkm[1].split(",").map((x) => x.trim().replace(/`/g, ""));
    const um = l.match(/^UNIQUE KEY `(\w+)` \((.*)\)$/i);
    if (um) uniques.push({ nome: um[1], cols: um[2].split(",").map((x) => x.trim().replace(/`/g, "")) });
  }
  tabelas.set(nome, { cols, pk, uniques });
}
console.log(`Tabelas parseadas: ${tabelas.size}`);

// ── 1. Nomes de FK precisam ser únicos no BANCO (não só na tabela) ──
// Postgres permite o mesmo nome de constraint em tabelas diferentes; MySQL não.
const fks = [];
const reFk = /ALTER TABLE `(\w+)` ADD CONSTRAINT `(\w+)` FOREIGN KEY \(([^)]*)\) REFERENCES `(\w+)` \(([^)]*)\)([^;]*);/g;
while ((m = reFk.exec(sql))) {
  fks.push({ tabela: m[1], nome: m[2], cols: m[3].split(",").map((x) => x.trim().replace(/`/g, "")),
             alvo: m[4], alvoCols: m[5].split(",").map((x) => x.trim().replace(/`/g, "")), acoes: m[6].trim() });
}
console.log(`FKs parseadas: ${fks.length}`);

const vistos = new Map();
for (const f of fks) {
  if (vistos.has(f.nome)) {
    P("ERRO", `Nome de FK duplicado no banco: \`${f.nome}\` usado em ${vistos.get(f.nome)} e ${f.tabela}. MySQL exige nome único por banco.`);
  } else vistos.set(f.nome, f.tabela);
}

// ── 2. Nomes de índice duplicados na MESMA tabela ───────────────────
const idxPorTabela = new Map();
const reIdx = /CREATE (UNIQUE )?INDEX `(\w+)` ON `(\w+)` \((.*?)\);/g;
const indices = [];
while ((m = reIdx.exec(sql))) {
  indices.push({ uniq: !!m[1], nome: m[2], tabela: m[3], cols: m[4] });
  const k = `${m[3]}`;
  if (!idxPorTabela.has(k)) idxPorTabela.set(k, new Set());
  if (idxPorTabela.get(k).has(m[2])) P("ERRO", `Índice duplicado: ${m[3]}.${m[2]}`);
  idxPorTabela.get(k).add(m[2]);
  // colide com UNIQUE KEY inline?
  const t = tabelas.get(m[3]);
  if (t && t.uniques.some((u) => u.nome === m[2])) {
    P("ERRO", `Índice \`${m[2]}\` colide com UNIQUE KEY inline em ${m[3]}.`);
  }
}
console.log(`Índices parseados: ${indices.length}`);

// ── 3. Identificadores > 64 caracteres (limite do MySQL) ────────────
for (const [t] of tabelas) if (t.length > 64) P("ERRO", `Nome de tabela > 64 chars: ${t}`);
for (const f of fks) if (f.nome.length > 64) P("ERRO", `Nome de FK > 64 chars (${f.nome.length}): ${f.nome}`);
for (const i of indices) if (i.nome.length > 64) P("ERRO", `Nome de índice > 64 chars (${i.nome.length}): ${i.nome}`);
for (const [t, d] of tabelas)
  for (const [c] of d.cols) if (c.length > 64) P("ERRO", `Coluna > 64 chars: ${t}.${c}`);

// ── 4. FK: tabela e colunas alvo existem? tipos compatíveis? ────────
for (const f of fks) {
  const alvo = tabelas.get(f.alvo);
  if (!alvo) { P("ERRO", `FK ${f.tabela}.${f.nome} aponta para tabela inexistente: ${f.alvo}`); continue; }
  const origem = tabelas.get(f.tabela);
  if (!origem) { P("ERRO", `FK em tabela inexistente: ${f.tabela}`); continue; }
  f.cols.forEach((c, k) => {
    const co = origem.cols.get(c);
    const ca = alvo.cols.get(f.alvoCols[k]);
    if (!co) P("ERRO", `FK ${f.tabela}.${f.nome}: coluna de origem inexistente ${f.tabela}.${c}`);
    if (!ca) P("ERRO", `FK ${f.tabela}.${f.nome}: coluna alvo inexistente ${f.alvo}.${f.alvoCols[k]}`);
    if (co && ca && co.tipo !== ca.tipo) {
      P("ERRO", `FK ${f.tabela}.${f.nome}: tipos incompatíveis ${f.tabela}.${c} (${co.tipo}) → ${f.alvo}.${f.alvoCols[k]} (${ca.tipo})`);
    }
  });
  // MySQL exige índice na coluna alvo (PK ou UNIQUE serve)
  const alvoTemIdx =
    JSON.stringify(alvo.pk) === JSON.stringify(f.alvoCols) ||
    alvo.uniques.some((u) => JSON.stringify(u.cols) === JSON.stringify(f.alvoCols)) ||
    indices.some((i) => i.tabela === f.alvo && i.uniq &&
      i.cols.replace(/`/g, "").split(",").map((x) => x.trim()).join() === f.alvoCols.join());
  if (!alvoTemIdx) {
    P("ERRO", `FK ${f.tabela}.${f.nome}: alvo ${f.alvo}(${f.alvoCols.join(",")}) não tem PK/UNIQUE — MySQL exige.`);
  }
  // ON DELETE SET NULL exige coluna nullable
  if (/ON DELETE SET NULL/i.test(f.acoes)) {
    f.cols.forEach((c) => {
      const co = origem.cols.get(c);
      if (co && /NOT NULL/.test(co.linha)) {
        P("ERRO", `FK ${f.tabela}.${f.nome} usa ON DELETE SET NULL mas ${f.tabela}.${c} é NOT NULL.`);
      }
    });
  }
}

// ── 5. Limite de 3072 bytes por chave InnoDB (utf8mb4 = 4 bytes/char) ──
function bytesDaChave(tabela, colsSpec) {
  const t = tabelas.get(tabela);
  if (!t) return 0;
  let total = 0;
  for (const raw of colsSpec.split(",")) {
    const s = raw.trim().replace(/`/g, "");
    const pref = s.match(/^(\w+)\((\d+)\)$/);
    if (pref) { total += Number(pref[2]) * 4; continue; }
    if (/^\(/.test(raw.trim())) { total += 256; continue; } // índice funcional: estimativa
    const col = t.cols.get(s);
    if (!col) continue;
    const vc = col.tipo.match(/^VARCHAR\((\d+)\)/);
    if (vc) { total += Number(vc[1]) * 4; continue; }
    const ch = col.tipo.match(/^CHAR\((\d+)\)/);
    if (ch) { total += Number(ch[1]) * 4; continue; }
    if (/^TEXT/.test(col.tipo)) { total += 768; continue; }
    if (/^(INT|DATETIME|DATE|TIME|DECIMAL|TINYINT|SMALLINT|BIGINT|DOUBLE|FLOAT|ENUM)/.test(col.tipo)) { total += 8; continue; }
    if (/^JSON/.test(col.tipo)) { total += 768; continue; }
  }
  return total;
}
for (const i of indices) {
  const b = bytesDaChave(i.tabela, i.cols);
  if (b > 3072) P("ERRO", `Índice ${i.tabela}.${i.nome} = ${b} bytes (limite InnoDB 3072). Cols: ${i.cols}`);
}
for (const [t, d] of tabelas) {
  if (d.pk.length) {
    const b = bytesDaChave(t, d.pk.map((c) => `\`${c}\``).join(","));
    if (b > 3072) P("ERRO", `PK de ${t} = ${b} bytes (limite 3072).`);
  }
  for (const u of d.uniques) {
    const b = bytesDaChave(t, u.cols.map((c) => `\`${c}\``).join(","));
    if (b > 3072) P("ERRO", `UNIQUE ${t}.${u.nome} = ${b} bytes (limite 3072).`);
  }
}

// ── 6. TEXT/JSON não pode entrar em PK/UNIQUE sem prefixo ───────────
for (const [t, d] of tabelas) {
  const checa = (nome, cols) => cols.forEach((c) => {
    const col = d.cols.get(c);
    if (col && /^(TEXT|JSON)/.test(col.tipo)) {
      P("ERRO", `${nome} de ${t} usa coluna ${col.tipo} sem prefixo: ${c}`);
    }
  });
  if (d.pk.length) checa("PK", d.pk);
  d.uniques.forEach((u) => checa(`UNIQUE ${u.nome}`, u.cols));
}
for (const i of indices) {
  const t = tabelas.get(i.tabela);
  if (!t) continue;
  for (const raw of i.cols.split(",")) {
    const s = raw.trim().replace(/`/g, "");
    if (/[()]/.test(raw.trim())) continue; // prefixo ou expressão
    const col = t.cols.get(s);
    if (col && /^JSON/.test(col.tipo)) P("ERRO", `Índice ${i.tabela}.${i.nome} sobre coluna JSON sem cast: ${s}`);
    if (col && /^TEXT/.test(col.tipo)) P("ERRO", `Índice ${i.tabela}.${i.nome} sobre TEXT sem prefixo: ${s}`);
  }
}

// ── 7. Só um DEFAULT CURRENT_TIMESTAMP automático por tabela? (ok em 8.0) ──
// ── 8. DEFAULT em coluna TEXT/JSON precisa ser expressão ────────────
for (const [t, d] of tabelas) {
  for (const [c, col] of d.cols) {
    const md = col.linha.match(/DEFAULT\s+(.+)$/);
    if (!md) continue;
    const def = md[1].trim();
    if (/^(TEXT|JSON|BLOB)/.test(col.tipo) && !/^\(/.test(def)) {
      P("ERRO", `${t}.${c} é ${col.tipo} com DEFAULT literal ${def} — MySQL exige DEFAULT de expressão entre parênteses.`);
    }
    // ENUM: default precisa ser membro válido
    const en = col.tipo.match(/^ENUM\((.*)\)$/);
    if (en) {
      const membros = en[1].split(",").map((x) => x.trim().replace(/^'|'$/g, ""));
      const v = def.replace(/^'|'$/g, "");
      if (!membros.includes(v)) P("ERRO", `${t}.${c}: DEFAULT '${v}' não é membro do ENUM (${membros.join("|")}).`);
    }
  }
}

// ── 8b. CHECK: comparação de escalar com LISTA (row) ────────────────
// `col = ('a','b')` passa no parser mas é erro no engine (MariaDB 4078 /
// MySQL "Operand should contain 1 column(s)"). O certo é `col IN (...)`.
{
  const reChk = /CONSTRAINT `(\w+)` CHECK \((.*)\)$/gm;
  let c;
  while ((c = reChk.exec(sql))) {
    const expr = c[2];
    // operador de comparação seguido de lista com vírgula no mesmo nível
    const rowCmp = expr.match(/(?:[<>]=?|=|<>|!=)\s*\(\s*(?:'[^']*'|-?[\d.]+)\s*,/);
    if (rowCmp) {
      P("ERRO", `CHECK \`${c[1]}\` compara escalar com lista: ${expr.slice(0, 90)} — use IN (...).`);
    }
    // resíduos de sintaxe Postgres que não deveriam sobrar
    for (const pg of ["ANY (ARRAY", "ALL (ARRAY", "::"]) {
      if (expr.includes(pg)) {
        P("ERRO", `CHECK \`${c[1]}\` tem resíduo de sintaxe Postgres "${pg}": ${expr.slice(0, 90)}`);
      }
    }
  }
}

// ── 9. AUTO_INCREMENT precisa ser (parte de) chave ──────────────────
for (const [t, d] of tabelas) {
  for (const [c, col] of d.cols) {
    if (/AUTO_INCREMENT/.test(col.linha)) {
      const emChave = d.pk.includes(c) || d.uniques.some((u) => u.cols[0] === c) ||
        indices.some((i) => i.tabela === t && i.cols.replace(/`/g, "").split(",")[0].trim() === c);
      if (!emChave) P("ERRO", `${t}.${c} é AUTO_INCREMENT mas não é a primeira coluna de nenhuma chave.`);
    }
  }
}

// ── 10. INSERTs: nº de colunas × nº de valores por linha ────────────
const reIns = /INSERT INTO `(\w+)` \(([^)]*)\) VALUES\n([\s\S]*?);(?=\n|$)/g;
let inserts = 0, linhasIns = 0;
while ((m = reIns.exec(sql))) {
  inserts++;
  const tabela = m[1];
  const nCols = m[2].split(",").length;
  const t = tabelas.get(tabela);
  if (!t) { P("ERRO", `INSERT em tabela inexistente: ${tabela}`); continue; }
  for (const c of m[2].split(",")) {
    const nome = c.trim().replace(/`/g, "");
    if (!t.cols.has(nome)) P("ERRO", `INSERT ${tabela}: coluna inexistente ${nome}`);
  }
  // conta valores da 1ª tupla (amostragem: tuplas são geradas pelo mesmo código)
  const primeira = m[3].split("\n")[0];
  const dentro = primeira.trim().replace(/^\(/, "").replace(/\),?$/, "");
  let depth = 0, campos = 1, inS = false;
  for (let k = 0; k < dentro.length; k++) {
    const ch = dentro[k];
    if (inS) { if (ch === "\\") { k++; continue; } if (ch === "'") inS = false; continue; }
    if (ch === "'") { inS = true; continue; }
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) campos++;
  }
  if (campos !== nCols) {
    P("ERRO", `INSERT ${tabela}: ${nCols} colunas mas ${campos} valores na 1ª linha.`);
  }
  linhasIns += m[3].split(/\),\n/).length;
}
console.log(`INSERTs: ${inserts} (~${linhasIns} linhas de dados)`);

// ── 11. Ordem: INSERT depende de FK já criada? (FK_CHECKS=0 cobre) ──
if (!/SET FOREIGN_KEY_CHECKS = 0/.test(sql)) {
  P("AVISO", "Sem SET FOREIGN_KEY_CHECKS=0 no início: a ordem dos INSERTs pode falhar.");
}
if (!/SET FOREIGN_KEY_CHECKS = 1/.test(sql)) {
  P("AVISO", "FOREIGN_KEY_CHECKS não é restaurado para 1 no fim.");
}

// ── Resultado ───────────────────────────────────────────────────────
const erros = problemas.filter((p) => p.sev === "ERRO");
const avisos = problemas.filter((p) => p.sev === "AVISO");
console.log(`\n${"═".repeat(60)}`);
console.log(`ERROS: ${erros.length}   AVISOS: ${avisos.length}`);
console.log("═".repeat(60));
erros.slice(0, 40).forEach((p) => console.log(`  ✗ ${p.msg}`));
if (erros.length > 40) console.log(`  ... e mais ${erros.length - 40}`);
avisos.forEach((p) => console.log(`  ! ${p.msg}`));

// Valida a sintaxe MySQL de cada statement do arquivo gerado.
import { readFileSync } from "node:fs";
import pkg from "node-sql-parser";
const { Parser } = pkg;

const sql = readFileSync("/tmp/pgtest/agicare_mysql.sql", "utf8");
const parser = new Parser();

function splitStatements(s) {
  const out = []; let cur = ""; let i = 0; const n = s.length;
  let inLine = false, inBlock = false, inSingle = false, inBack = false;
  while (i < n) {
    const c = s[i]; const two = s.slice(i, i + 2);
    if (inLine) { if (c === "\n") inLine = false; cur += c; i++; continue; }
    if (inBlock) { if (two === "*/") { cur += two; i += 2; inBlock = false; continue; } cur += c; i++; continue; }
    if (inSingle) { if (c === "\\") { cur += s.slice(i, i + 2); i += 2; continue; } cur += c; if (c === "'") inSingle = false; i++; continue; }
    if (inBack) { cur += c; if (c === "`") inBack = false; i++; continue; }
    if (two === "--") { inLine = true; cur += two; i += 2; continue; }
    if (two === "/*") { inBlock = true; cur += two; i += 2; continue; }
    if (c === "'") { inSingle = true; cur += c; i++; continue; }
    if (c === "`") { inBack = true; cur += c; i++; continue; }
    if (c === ";") { out.push(cur.trim()); cur = ""; i++; continue; }
    cur += c; i++;
  }
  if (cur.trim()) out.push(cur.trim());
  return out.map((x) => x.replace(/^\s*(--[^\n]*\n\s*)+/g, "").trim()).filter((x) => x.length > 0);
}

const stmts = splitStatements(sql);
const kinds = {};
const erros = [];

for (const st of stmts) {
  const kind = st.replace(/\s+/g, " ").split(" ").slice(0, 2).join(" ").toUpperCase();
  kinds[kind] = (kinds[kind] || 0) + 1;
  // SET / USE / CREATE DATABASE não são cobertos pelo parser; ignora.
  if (/^(SET|USE|CREATE DATABASE)\b/i.test(st)) continue;
  try {
    parser.astify(st, { database: "mysql" });
  } catch (e) {
    erros.push({ kind, msg: e.message.split("\n")[0].slice(0, 150), stmt: st.replace(/\s+/g, " ").slice(0, 130) });
  }
}

console.log(`Statements: ${stmts.length}`);
console.log("\nPor tipo:");
Object.entries(kinds).sort((a, b) => b[1] - a[1]).forEach(([k, v]) =>
  console.log(`  ${String(v).padStart(6)}  ${k}`));

console.log(`\nErros de sintaxe: ${erros.length}`);
const porTipo = {};
erros.forEach((e) => { porTipo[e.kind] = (porTipo[e.kind] || 0) + 1; });
Object.entries(porTipo).forEach(([k, v]) => console.log(`  ${k}: ${v}`));
erros.slice(0, 12).forEach((e) => console.log(`\n  ! ${e.msg}\n    ${e.stmt}`));

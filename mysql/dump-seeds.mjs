// Extrai os dados semeados pelas migrations (CIDs, configuração do sistema,
// catálogos, permissões) do Postgres replayado e emite INSERTs MySQL.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";

const MIG_DIR = "/sessions/admiring-sleepy-gauss/mnt/agicare/supabase/migrations";
const S = JSON.parse(readFileSync("/tmp/pgtest/schema.json", "utf8"));

// ── Recria o banco (mesmo bootstrap do replay) ──────────────────────
const db = await new PGlite();
await db.exec(`
  create schema if not exists auth;
  create schema if not exists storage;
  create schema if not exists extensions;
  create domain public.citext as text;
  create or replace function extensions.uuid_generate_v4() returns uuid
    language sql volatile as $$ select gen_random_uuid() $$;
  create table if not exists auth.users (
    id uuid primary key default gen_random_uuid(), email text,
    encrypted_password text, raw_user_meta_data jsonb,
    created_at timestamptz default now());
  create or replace function auth.uid() returns uuid language sql stable
    as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create or replace function auth.role() returns text language sql stable
    as $$ select nullif(current_setting('request.jwt.claim.role', true), '') $$;
  create or replace function auth.jwt() returns jsonb language sql stable
    as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb) $$;
  create table if not exists storage.objects (
    id uuid primary key default gen_random_uuid(), bucket_id text, name text,
    owner uuid, created_at timestamptz default now(), metadata jsonb);
  create table if not exists storage.buckets (
    id text primary key, name text, public boolean default false);
  do $$ begin
    if not exists (select 1 from pg_roles where rolname='anon') then create role anon; end if;
    if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
    if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role; end if;
  end $$;
`);

function splitStatements(sql) {
  const out = []; let cur = ""; let i = 0; const n = sql.length;
  let inLine = false, inBlock = false, inSingle = false, dollarTag = null;
  while (i < n) {
    const c = sql[i]; const two = sql.slice(i, i + 2);
    if (inLine) { if (c === "\n") inLine = false; cur += c; i++; continue; }
    if (inBlock) { if (two === "*/") { cur += two; i += 2; inBlock = false; continue; } cur += c; i++; continue; }
    if (inSingle) { cur += c; if (c === "'") inSingle = false; i++; continue; }
    if (dollarTag) { if (sql.startsWith(dollarTag, i)) { cur += dollarTag; i += dollarTag.length; dollarTag = null; continue; } cur += c; i++; continue; }
    if (two === "--") { inLine = true; cur += two; i += 2; continue; }
    if (two === "/*") { inBlock = true; cur += two; i += 2; continue; }
    if (c === "'") { inSingle = true; cur += c; i++; continue; }
    const dollar = sql.slice(i).match(/^\$[a-zA-Z_]*\$/);
    if (dollar) { dollarTag = dollar[0]; cur += dollarTag; i += dollarTag.length; continue; }
    if (c === ";") { out.push(cur.trim()); cur = ""; i++; continue; }
    cur += c; i++;
  }
  if (cur.trim()) out.push(cur.trim());
  return out.filter((s) => s.replace(/--.*$/gm, "").trim().length > 0);
}

for (const f of readdirSync(MIG_DIR).filter((x) => x.endsWith(".sql")).sort()) {
  for (const stmt of splitStatements(readFileSync(`${MIG_DIR}/${f}`, "utf8"))) {
    try { await db.exec(stmt); } catch { /* erros de infra Supabase: já auditados */ }
  }
}

// ── Tabelas com seed, na ordem correta de FK ────────────────────────
const ORDEM = [
  "clinics", "clinic_settings", "permission_templates", "role_permissions",
  "product_categories", "attendance_options", "consent_templates", "cid_codes",
];

const colsPorTabela = new Map();
for (const c of S.colunas) {
  if (!colsPorTabela.has(c.table_name)) colsPorTabela.set(c.table_name, []);
  colsPorTabela.get(c.table_name).push(c);
}

const esc = (v) => `'${String(v).replace(/\\/g, "\\\\").replace(/'/g, "''")}'`;

/** Valor JS (vindo do PG) → literal MySQL, conforme o tipo da coluna. */
function lit(v, col) {
  if (v === null || v === undefined) return "NULL";
  const dt = col.data_type;
  if (dt === "boolean") return v === true || v === "t" ? "1" : "0";
  if (dt === "jsonb" || dt === "json") return esc(JSON.stringify(v));
  if (dt === "ARRAY") return esc(JSON.stringify(v));
  if (["integer", "bigint", "smallint", "numeric", "double precision", "real"].includes(dt)) {
    return String(v);
  }
  if (dt === "date") {
    const d = v instanceof Date ? v : new Date(v);
    return esc(d.toISOString().slice(0, 10));
  }
  if (dt.startsWith("timestamp")) {
    const d = v instanceof Date ? v : new Date(v);
    return esc(d.toISOString().slice(0, 19).replace("T", " "));
  }
  return esc(v);
}

const out = [];
const resumo = [];

for (const t of ORDEM) {
  const cols = colsPorTabela.get(t);
  if (!cols) continue;
  const nomes = cols.map((c) => c.column_name);
  const { rows } = await db.query(
    `select ${nomes.map((n) => `"${n}"`).join(", ")} from public."${t}"`);
  if (rows.length === 0) continue;
  resumo.push({ tabela: t, linhas: rows.length });

  out.push(`\n-- ── ${t} (${rows.length} ${rows.length === 1 ? "registro" : "registros"}) ──`);
  const colList = nomes.map((n) => `\`${n}\``).join(", ");

  // Lotes de 200 linhas para não gerar statements gigantes.
  for (let i = 0; i < rows.length; i += 200) {
    const lote = rows.slice(i, i + 200);
    const values = lote.map((r) =>
      `  (${nomes.map((n, k) => lit(r[n], cols[k])).join(", ")})`).join(",\n");
    out.push(`INSERT INTO \`${t}\` (${colList}) VALUES\n${values};`);
  }
}

writeFileSync("/tmp/pgtest/parte_seeds.sql", out.join("\n"));
writeFileSync("/tmp/pgtest/resumo_seeds.json", JSON.stringify(resumo, null, 2));
console.log("Seeds exportados:");
resumo.forEach((r) => console.log(`  ${String(r.linhas).padStart(6)}  ${r.tabela}`));
console.log(`\nLinhas de SQL: ${out.join("\n").split("\n").length}`);

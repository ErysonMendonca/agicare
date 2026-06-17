/**
 * Runner de migrations do agicare (aplica supabase/migrations/*.sql no Postgres).
 *
 * Uso:
 *   node scripts/migrate.mjs status            → mostra migrations aplicadas + tabelas
 *   node scripts/migrate.mjs up                → aplica TODAS as pendentes (em ordem)
 *   node scripts/migrate.mjs up --until=0019   → aplica pendentes com prefixo <= 0019
 *   node scripts/migrate.mjs up --only=0007     → aplica só a 0007
 *
 * Lê SUPABASE_DB_URL do .env.local. Idempotente: rastreia em public.schema_migrations.
 * Executa cada statement em autocommit (suporta ALTER TYPE ADD VALUE).
 */
import { readFileSync, readdirSync } from "node:fs";
import pg from "pg";

// ── env ──────────────────────────────────────────────────────────
readFileSync(".env.local", "utf8").split(/\r?\n/).forEach((l) => {
  const m = l.match(/^([^=#]+)=(.*)$/);
  if (m) process.env[m[1].trim()] = m[2].trim();
});
const DB_URL = process.env.SUPABASE_DB_URL;
if (!DB_URL) {
  console.error("✗ SUPABASE_DB_URL ausente no .env.local");
  process.exit(1);
}

const [, , cmd = "status", ...flags] = process.argv;
const until = (flags.find((f) => f.startsWith("--until=")) || "").split("=")[1];
const only = (flags.find((f) => f.startsWith("--only=")) || "").split("=")[1];

const MIG_DIR = "supabase/migrations";
const prefix = (name) => name.match(/^(\d+)/)?.[1] ?? "9999";

/** Divide um script SQL em statements, respeitando '...', $$...$$ e comentários. */
function splitStatements(sql) {
  const out = [];
  let cur = "";
  let i = 0;
  const n = sql.length;
  let inLine = false,
    inBlock = false,
    inSingle = false,
    dollarTag = null;
  while (i < n) {
    const c = sql[i];
    const two = sql.slice(i, i + 2);
    if (inLine) {
      if (c === "\n") inLine = false;
      cur += c; i++; continue;
    }
    if (inBlock) {
      if (two === "*/") { cur += two; i += 2; inBlock = false; continue; }
      cur += c; i++; continue;
    }
    if (inSingle) {
      cur += c;
      if (c === "'") inSingle = false;
      i++; continue;
    }
    if (dollarTag) {
      if (sql.startsWith(dollarTag, i)) { cur += dollarTag; i += dollarTag.length; dollarTag = null; continue; }
      cur += c; i++; continue;
    }
    if (two === "--") { inLine = true; cur += two; i += 2; continue; }
    if (two === "/*") { inBlock = true; cur += two; i += 2; continue; }
    if (c === "'") { inSingle = true; cur += c; i++; continue; }
    const dollar = sql.slice(i).match(/^\$[a-zA-Z_]*\$/);
    if (dollar) { dollarTag = dollar[0]; cur += dollarTag; i += dollarTag.length; continue; }
    if (c === ";") { out.push(cur.trim()); cur = ""; i++; continue; }
    cur += c; i++;
  }
  if (cur.trim()) out.push(cur.trim());
  return out.filter((s) => s.length > 0 && !/^(--|\/\*)/.test(s) === true || s.replace(/--.*$/gm, "").trim().length > 0);
}

// A porta 5432 (session pooler) costuma ser bloqueada por firewall/ISP. Usamos
// a 6543 (transaction pooler), que fica aberta. Mesmo host/usuário, só a porta.
const dbUrl = new URL(DB_URL);
if (dbUrl.port === "5432") dbUrl.port = "6543";

const client = new pg.Client({
  host: dbUrl.hostname,
  port: Number(dbUrl.port || 6543),
  user: decodeURIComponent(dbUrl.username),
  password: decodeURIComponent(dbUrl.password),
  database: dbUrl.pathname.replace(/^\//, "") || "postgres",
  ssl: { rejectUnauthorized: false },
  // Transaction pooler não suporta prepared statements persistentes.
  statement_timeout: 120000,
});

async function ensureTracking() {
  await client.query(
    `create table if not exists public.schema_migrations (
       name text primary key, applied_at timestamptz not null default now())`,
  );
}

async function appliedSet() {
  const { rows } = await client.query("select name from public.schema_migrations");
  return new Set(rows.map((r) => r.name));
}

async function status() {
  await ensureTracking();
  const applied = await appliedSet();
  const files = readdirSync(MIG_DIR).filter((f) => f.endsWith(".sql")).sort();
  console.log("=== Migrations ===");
  for (const f of files) console.log(`${applied.has(f) ? "✓ aplicada" : "· pendente"}  ${f}`);
  const { rows } = await client.query(
    `select table_name from information_schema.tables where table_schema='public' order by table_name`,
  );
  console.log("\n=== Tabelas em public ===");
  console.log(rows.map((r) => r.table_name).join(", "));
}

async function up() {
  await ensureTracking();
  const applied = await appliedSet();
  let files = readdirSync(MIG_DIR).filter((f) => f.endsWith(".sql")).sort();
  if (only) files = files.filter((f) => prefix(f) === only);
  if (until) files = files.filter((f) => prefix(f) <= until);
  const pending = files.filter((f) => !applied.has(f));
  if (pending.length === 0) { console.log("Nada pendente."); return; }
  console.log(`Aplicando ${pending.length} migration(s): ${pending.join(", ")}\n`);
  for (const f of pending) {
    const sql = readFileSync(`${MIG_DIR}/${f}`, "utf8");
    const stmts = splitStatements(sql);
    process.stdout.write(`→ ${f} (${stmts.length} statements) ... `);
    try {
      for (const s of stmts) await client.query(s);
      // Sem params (transaction pooler não usa prepared statements). f é nome de arquivo controlado.
      await client.query(
        `insert into public.schema_migrations(name) values('${f.replace(/'/g, "''")}') on conflict do nothing`,
      );
      console.log("OK");
    } catch (e) {
      console.log("FALHOU");
      console.error(`   ✗ ${f}: ${e.message}`);
      console.error(`   (statement próximo do erro — corrija e rode de novo; é idempotente)`);
      throw e;
    }
  }
  console.log("\n✓ Migrations aplicadas.");
}

await client.connect();
try {
  if (cmd === "up") await up();
  else await status();
} finally {
  await client.end();
}

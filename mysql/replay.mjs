// Replay das migrations do agicare num Postgres real (PGlite/WASM), para
// extrair o schema FINAL autoritativo — base da conversão para MySQL.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";

const MIG_DIR = "/sessions/admiring-sleepy-gauss/mnt/agicare/supabase/migrations";

const db = await new PGlite();

// O Supabase traz schemas/roles/funções que as migrations assumem existir.
// Recriamos o mínimo necessário para o replay não falhar.
await db.exec(`
  create schema if not exists auth;
  create schema if not exists storage;
  create schema if not exists extensions;

  -- Shims de extensões que o Supabase tem e o PGlite não: citext (usado em
  -- profiles.username) e extensions.uuid_generate_v4 (medical_records_scanned).
  create domain public.citext as text;
  create or replace function extensions.uuid_generate_v4() returns uuid
    language sql volatile as $$ select gen_random_uuid() $$;
  create or replace function public.uuid_generate_v4() returns uuid
    language sql volatile as $$ select gen_random_uuid() $$;


  -- auth.users (Supabase Auth) — referenciada por FKs em profiles etc.
  create table if not exists auth.users (
    id uuid primary key default gen_random_uuid(),
    email text,
    encrypted_password text,
    raw_user_meta_data jsonb,
    created_at timestamptz default now()
  );

  -- auth.uid()/auth.role()/auth.jwt(): usadas nas policies RLS.
  create or replace function auth.uid() returns uuid language sql stable
    as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create or replace function auth.role() returns text language sql stable
    as $$ select nullif(current_setting('request.jwt.claim.role', true), '') $$;
  create or replace function auth.jwt() returns jsonb language sql stable
    as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb) $$;

  -- storage.objects (bucket de prontuários/anexos).
  create table if not exists storage.objects (
    id uuid primary key default gen_random_uuid(),
    bucket_id text, name text, owner uuid,
    created_at timestamptz default now(), metadata jsonb
  );
  create table if not exists storage.buckets (
    id text primary key, name text, public boolean default false
  );

  -- Roles do PostgREST referenciados por GRANT nas migrations.
  do $$ begin
    if not exists (select 1 from pg_roles where rolname='anon') then create role anon; end if;
    if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
    if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role; end if;
  end $$;
`);

/** Divide SQL em statements respeitando '...', $$...$$ e comentários. */
function splitStatements(sql) {
  const out = [];
  let cur = "";
  let i = 0;
  const n = sql.length;
  let inLine = false, inBlock = false, inSingle = false, dollarTag = null;
  while (i < n) {
    const c = sql[i];
    const two = sql.slice(i, i + 2);
    if (inLine) { if (c === "\n") inLine = false; cur += c; i++; continue; }
    if (inBlock) { if (two === "*/") { cur += two; i += 2; inBlock = false; continue; } cur += c; i++; continue; }
    if (inSingle) { cur += c; if (c === "'") inSingle = false; i++; continue; }
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
  return out.filter((s) => s.replace(/--.*$/gm, "").trim().length > 0);
}

const files = readdirSync(MIG_DIR).filter((f) => f.endsWith(".sql")).sort();
const problemas = [];
let okCount = 0;

for (const f of files) {
  const sql = readFileSync(`${MIG_DIR}/${f}`, "utf8");
  for (const stmt of splitStatements(sql)) {
    try {
      await db.exec(stmt);
    } catch (e) {
      problemas.push({ file: f, msg: e.message, stmt: stmt.slice(0, 160) });
    }
  }
  okCount++;
}

console.log(`Migrations processadas: ${okCount}/${files.length}`);
console.log(`Statements com erro: ${problemas.length}`);
writeFileSync("/tmp/pgtest/problemas.json", JSON.stringify(problemas, null, 2));

// ── Introspecção do schema final ────────────────────────────────
const tabelas = await db.query(`
  select table_name from information_schema.tables
  where table_schema='public' and table_type='BASE TABLE'
  order by table_name`);
console.log(`\nTabelas em public: ${tabelas.rows.length}`);

const colunas = await db.query(`
  select c.table_name, c.ordinal_position, c.column_name, c.data_type,
         c.udt_name, c.character_maximum_length, c.numeric_precision,
         c.numeric_scale, c.is_nullable, c.column_default
  from information_schema.columns c
  join information_schema.tables t
    on t.table_schema=c.table_schema and t.table_name=c.table_name
  where c.table_schema='public' and t.table_type='BASE TABLE'
  order by c.table_name, c.ordinal_position`);

const enums = await db.query(`
  select t.typname, array_agg(e.enumlabel order by e.enumsortorder) as labels
  from pg_type t join pg_enum e on e.enumtypid=t.oid
  join pg_namespace n on n.oid=t.typnamespace
  where n.nspname='public' group by t.typname order by t.typname`);

const constraints = await db.query(`
  select con.conname, con.contype, rel.relname as table_name,
         pg_get_constraintdef(con.oid) as def
  from pg_constraint con
  join pg_class rel on rel.oid=con.conrelid
  join pg_namespace n on n.oid=rel.relnamespace
  where n.nspname='public' and rel.relkind='r'
  order by rel.relname, con.contype, con.conname`);

const indices = await db.query(`
  select tablename, indexname, indexdef from pg_indexes
  where schemaname='public' order by tablename, indexname`);

writeFileSync("/tmp/pgtest/schema.json", JSON.stringify({
  tabelas: tabelas.rows.map((r) => r.table_name),
  colunas: colunas.rows,
  enums: enums.rows,
  constraints: constraints.rows,
  indices: indices.rows,
}, null, 2));

console.log(`Colunas: ${colunas.rows.length} | Enums: ${enums.rows.length} | Constraints: ${constraints.rows.length} | Índices: ${indices.rows.length}`);
if (problemas.length > 0) {
  console.log("\nPrimeiros erros:");
  for (const p of problemas.slice(0, 12)) console.log(` [${p.file}] ${p.msg}`);
}

// ════════════════════════════════════════════════════════════════
// Conversor Postgres (Supabase) → MySQL 8.
//
// Entrada: schema.json (introspecção do Postgres real, gerado por replay.mjs
// depois de aplicar as 122 migrations) + seeds lidos do próprio banco.
// Saída: agicare_mysql.sql — schema + dados semeados, pronto p/ importar.
// ════════════════════════════════════════════════════════════════
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";

const MIG_DIR = "/sessions/admiring-sleepy-gauss/mnt/agicare/supabase/migrations";
const S = JSON.parse(readFileSync("/tmp/pgtest/schema.json", "utf8"));

// ── 1. Descobrir colunas que participam de índice/PK/UNIQUE/FK ──────
// MySQL não indexa TEXT sem prefixo; essas colunas viram VARCHAR.
const colsIndexadas = new Set();
const addIdx = (t, cols) => cols.forEach((c) => colsIndexadas.add(`${t}.${c}`));

for (const c of S.constraints) {
  const m = c.def.match(/^(?:PRIMARY KEY|UNIQUE)\s*\(([^)]*)\)/i);
  if (m) addIdx(c.table_name, m[1].split(",").map((x) => x.trim().replace(/"/g, "")));
  const fk = c.def.match(/^FOREIGN KEY \(([^)]*)\) REFERENCES ([^\s(]+)\(([^)]*)\)/i);
  if (fk) {
    addIdx(c.table_name, fk[1].split(",").map((x) => x.trim().replace(/"/g, "")));
    addIdx(fk[2].replace(/"/g, "").replace(/^public\./, ""),
           fk[3].split(",").map((x) => x.trim().replace(/"/g, "")));
  }
}
for (const i of S.indices) {
  const m = i.indexdef.match(/\(([^)]*)\)(?:\s+WHERE|\s*$)/);
  if (m) {
    addIdx(i.tablename, m[1].split(",").map((x) =>
      x.trim().replace(/"/g, "").replace(/\s+(ASC|DESC)$/i, "")
        .replace(/\s+\w+_ops$/, "")));
  }
}

const enumsPorNome = new Map(S.enums.map((e) => [e.typname, e.labels]));

/** Tipo Postgres → tipo MySQL. */
function tipoMySQL(col) {
  const { data_type: dt, udt_name: udt } = col;
  const idx = colsIndexadas.has(`${col.table_name}.${col.column_name}`);

  // MySQL não aceita DEFAULT literal em TEXT ("BLOB/TEXT can't have a default
  // value"). Coluna textual COM default literal curto vira VARCHAR, que aceita.
  const temDefaultLiteral =
    col.column_default != null &&
    /^'((?:[^']|'')*)'::/.test(col.column_default) &&
    !/^'(\{\}|\[\])'::/.test(col.column_default);

  if (udt === "uuid") return "CHAR(36)";
  if (dt === "text" || udt === "citext")
    return idx || temDefaultLiteral ? "VARCHAR(255)" : "TEXT";
  if (dt === "character varying") {
    const n = col.character_maximum_length;
    return n ? `VARCHAR(${n})` : idx ? "VARCHAR(255)" : "TEXT";
  }
  if (dt === "timestamp with time zone" || dt === "timestamp without time zone")
    return "DATETIME(6)";
  if (dt === "date") return "DATE";
  if (dt === "time without time zone" || dt === "time with time zone") return "TIME";
  if (dt === "boolean") return "TINYINT(1)";
  if (dt === "integer") return "INT";
  if (dt === "bigint") return "BIGINT";
  if (dt === "smallint") return "SMALLINT";
  if (dt === "numeric") {
    const p = col.numeric_precision, s = col.numeric_scale;
    return p != null ? `DECIMAL(${p},${s ?? 0})` : "DECIMAL(14,2)";
  }
  if (dt === "double precision") return "DOUBLE";
  if (dt === "real") return "FLOAT";
  if (dt === "jsonb" || dt === "json") return "JSON";
  if (dt === "ARRAY") return "JSON"; // text[]/int[] → JSON array
  if (dt === "USER-DEFINED" && enumsPorNome.has(udt)) {
    return `ENUM(${enumsPorNome.get(udt).map((l) => `'${l.replace(/'/g, "''")}'`).join(",")})`;
  }
  return "TEXT"; // fallback conservador
}

/** Valor JS → expressão JSON_OBJECT/JSON_ARRAY (portável MySQL 8 + MariaDB). */
function jsonExpr(v) {
  if (v === null) return "CAST('null' AS CHAR)";
  if (Array.isArray(v)) {
    return v.length === 0 ? "JSON_ARRAY()" : `JSON_ARRAY(${v.map(jsonExpr).join(", ")})`;
  }
  if (typeof v === "object") {
    const pares = Object.entries(v);
    return pares.length === 0
      ? "JSON_OBJECT()"
      : `JSON_OBJECT(${pares.map(([k, x]) => `'${k.replace(/'/g, "''")}', ${jsonExpr(x)}`).join(", ")})`;
  }
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return `'${String(v).replace(/'/g, "''")}'`;
}

/** DEFAULT Postgres → DEFAULT MySQL (null = sem default). */
function defaultMySQL(col, tipo) {
  const d = col.column_default;
  if (d == null) return null;
  if (/^nextval\(/i.test(d)) return "__AUTO_INCREMENT__";
  if (/gen_random_uuid\(\)|uuid_generate_v4\(\)/i.test(d)) return "(UUID())";
  if (/^(now\(\)|CURRENT_TIMESTAMP)/i.test(d)) return "CURRENT_TIMESTAMP(6)";
  if (/^CURRENT_DATE/i.test(d)) return "(CURRENT_DATE)";
  if (/^true$/i.test(d)) return "1";
  if (/^false$/i.test(d)) return "0";

  // '{}'::jsonb / '[]'::jsonb → default de expressão (MySQL exige parênteses)
  const js = d.match(/^'(\{\}|\[\])'::jsonb?$/i);
  if (js) return js[1] === "{}" ? "(JSON_OBJECT())" : "(JSON_ARRAY())";
  // '{}'::text[] → array JSON vazio
  if (/^'\{\}'::(text|integer|uuid)\[\]$/i.test(d)) return "(JSON_ARRAY())";

  // literal com cast: 'x'::text, 'admin'::user_role, 0::numeric...
  const lit = d.match(/^'((?:[^']|'')*)'::[\w .\[\]"]+$/);
  if (lit) {
    const v = lit[1];
    // JSON só aceita DEFAULT como expressão. Constrói com JSON_OBJECT/
    // JSON_ARRAY em vez de CAST(... AS JSON): funciona igual no MySQL 8 e no
    // MariaDB (onde JSON é apelido de LONGTEXT e o CAST pode não existir).
    if (tipo.startsWith("JSON")) {
      try {
        return `(${jsonExpr(JSON.parse(v))})`;
      } catch {
        return null; // JSON inválido no default: melhor não emitir
      }
    }
    return `'${v.replace(/'/g, "''")}'`;
  }
  const num = d.match(/^\(?(-?[\d.]+)\)?(?:::[\w .]+)?$/);
  if (num) return num[1];

  return null; // expressões complexas (ex.: subselects) → sem default
}

const q = (n) => `\`${n}\``;

// ── 2. Colunas por tabela ───────────────────────────────────────────
const porTabela = new Map();
for (const c of S.colunas) {
  if (!porTabela.has(c.table_name)) porTabela.set(c.table_name, []);
  porTabela.get(c.table_name).push(c);
}

// ── 3. Montar CREATE TABLE ──────────────────────────────────────────
const out = [];
const avisos = [];

out.push(`-- ════════════════════════════════════════════════════════════════
-- agicare — estrutura MySQL 8 (convertida do Supabase/Postgres)
--
-- Gerado a partir do estado FINAL das ${readdirSync(MIG_DIR).filter((f) => f.endsWith(".sql")).length} migrations de
-- supabase/migrations/, aplicadas num Postgres real e depois traduzidas.
--
-- Requer MySQL 8.0.16+ (usa DEFAULT de expressão, CHECK e JSON).
-- Charset utf8mb4 (acentuação e emoji), engine InnoDB (FK + transações).
--
-- ┌─ O QUE MUDA EM RELAÇÃO AO POSTGRES ─────────────────────────────┐
-- │ · uuid            → CHAR(36) com DEFAULT (UUID())               │
-- │ · timestamptz     → DATETIME(6) (MySQL não guarda o timezone;   │
-- │                     grave sempre em UTC na aplicação)           │
-- │ · boolean         → TINYINT(1) (1 = true, 0 = false)            │
-- │ · jsonb / text[]  → JSON                                        │
-- │ · enums Postgres  → ENUM nativo do MySQL                        │
-- │ · RLS             → NÃO EXISTE em MySQL. Toda a autorização que │
-- │                     hoje é feita por Row Level Security precisa │
-- │                     ser garantida na aplicação. Ver o bloco no  │
-- │                     fim deste arquivo.                          │
-- │ · auth.users      → tabela auth_users (substitui o Supabase Auth)│
-- └─────────────────────────────────────────────────────────────────┘
-- ════════════════════════════════════════════════════════════════

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;
SET @@session.sql_mode = 'STRICT_ALL_TABLES';

CREATE DATABASE IF NOT EXISTS \`agicare\`
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE \`agicare\`;

-- ────────────────────────────────────────────────────────────────
-- auth_users — substitui a tabela auth.users do Supabase Auth.
-- O Supabase cuidava de login/senha/JWT fora do schema public; em
-- MySQL isso passa a ser responsabilidade da aplicação. A senha deve
-- ser gravada como HASH (bcrypt/argon2), NUNCA em texto puro.
-- ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS \`auth_users\` (
  \`id\`                 CHAR(36)     NOT NULL DEFAULT (UUID()),
  \`email\`              VARCHAR(255) NOT NULL,
  \`encrypted_password\` VARCHAR(255) NULL,
  \`email_confirmed_at\` DATETIME(6)  NULL,
  \`last_sign_in_at\`    DATETIME(6)  NULL,
  \`raw_user_meta_data\` JSON         NULL,
  \`created_at\`         DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  \`updated_at\`         DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
                                      ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (\`id\`),
  UNIQUE KEY \`auth_users_email_key\` (\`email\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
`);

const tabelasOrdenadas = [...porTabela.keys()].sort();

for (const t of tabelasOrdenadas) {
  const cols = porTabela.get(t);
  const linhas = [];
  let autoInc = null;

  for (const col of cols) {
    const tipo = tipoMySQL(col);
    const def = defaultMySQL(col, tipo);
    const nn = col.is_nullable === "NO";
    let linha = `  ${q(col.column_name)} ${tipo}`;
    if (def === "__AUTO_INCREMENT__") {
      linha += " NOT NULL AUTO_INCREMENT";
      autoInc = col.column_name;
    } else {
      linha += nn ? " NOT NULL" : " NULL";
      if (def != null) linha += ` DEFAULT ${def}`;
    }
    linhas.push(linha);
  }

  // PRIMARY KEY / UNIQUE / CHECK da tabela
  const cons = S.constraints.filter((c) => c.table_name === t);
  for (const c of cons) {
    const pk = c.def.match(/^PRIMARY KEY\s*\(([^)]*)\)/i);
    if (pk) {
      linhas.push(`  PRIMARY KEY (${pk[1].split(",").map((x) =>
        q(x.trim().replace(/"/g, ""))).join(", ")})`);
      continue;
    }
    const un = c.def.match(/^UNIQUE\s*\(([^)]*)\)/i);
    if (un) {
      linhas.push(`  UNIQUE KEY ${q(c.conname)} (${un[1].split(",").map((x) =>
        q(x.trim().replace(/"/g, ""))).join(", ")})`);
      continue;
    }
    if (c.contype === "c") {
      // CHECK: MySQL 8.0.16+ suporta, mas a sintaxe Postgres pode ter
      // construções sem equivalente. Convertidos os casos simples.
      const chk = c.def.match(/^CHECK \((.*)\)$/is);
      if (chk) {
        let expr = chk[1]
          .replace(/::[a-z_ ]+(\[\])?/gi, "")   // remove casts
          .replace(/"/g, "`")                    // identificadores
          // `x = ANY (ARRAY[...])` é a forma Postgres de "x está na lista".
          // Precisa virar `x IN (...)`: trocar só o ARRAY[] por () deixaria
          // `x = ('a','b')`, que compara escalar com linha e é ERRO (4078 no
          // MariaDB, "Operand should contain 1 column(s)" no MySQL).
          .replace(/=\s*ANY\s*\(\s*ARRAY\[(.*?)\]\s*\)/gis, "IN ($1)")
          .replace(/(?:<>|!=)\s*ALL\s*\(\s*ARRAY\[(.*?)\]\s*\)/gis, "NOT IN ($1)")
          .replace(/~~\*/g, "LIKE").replace(/~~/g, "LIKE");
        // Só emite CHECKs que não usam funções/recursos exclusivos do PG.
        if (!/\b(jsonb_|to_tsvector|similar to|~|array_|regexp_)/i.test(expr)) {
          linhas.push(`  CONSTRAINT ${q(c.conname)} CHECK (${expr})`);
        } else {
          avisos.push(`CHECK não convertido (usa recurso exclusivo do Postgres): ${t}.${c.conname}`);
        }
      }
    }
  }

  out.push(`\n-- ── ${t} ──`);
  out.push(`CREATE TABLE IF NOT EXISTS ${q(t)} (`);
  out.push(linhas.join(",\n"));
  out.push(`) ENGINE=InnoDB${autoInc ? "" : ""} DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`);
}

// ── 4. Índices secundários ──────────────────────────────────────────
out.push(`\n\n-- ════════════════════════════════════════════════════════════════
-- ÍNDICES
-- Índices PARCIAIS do Postgres (com WHERE) não existem em MySQL: foram
-- convertidos para índices completos, o que preserva a performance mas
-- NÃO preserva a unicidade condicional. Os casos afetados estão listados
-- no bloco de avisos no fim do arquivo.
-- ════════════════════════════════════════════════════════════════`);

const pkUqNomes = new Set(
  S.constraints.filter((c) => c.contype === "p" || c.contype === "u").map((c) => c.conname),
);

for (const i of S.indices) {
  if (pkUqNomes.has(i.indexname)) continue; // já saiu inline no CREATE TABLE
  const parcial = / WHERE /i.test(i.indexdef);
  const uniq = /CREATE UNIQUE/i.test(i.indexdef);
  const m = i.indexdef.match(/USING \w+ \((.*?)\)(?:\s+WHERE\s+(.*))?$/is);
  if (!m) { avisos.push(`Índice ignorado (formato não reconhecido): ${i.indexname}`); continue; }

  const exprCols = m[1].split(/,(?![^(]*\))/).map((x) =>
    x.trim().replace(/"/g, "").replace(/\s+(ASC|DESC)$/i, "").replace(/\s+\w+_ops$/, ""));

  // Índices funcionais (lower(x), coalesce(...)) → MySQL 8 aceita ((expr)).
  const partes = exprCols.map((c) => {
    if (/[()]/.test(c)) return `(${c.replace(/::[a-z_ ]+/gi, "")})`;
    const col = S.colunas.find((x) => x.table_name === i.tablename && x.column_name === c);
    // TEXT precisa de prefixo no índice
    if (col && (col.data_type === "text" || col.udt_name === "citext")
        && tipoMySQL(col) === "TEXT") return `${q(c)}(191)`;
    return q(c);
  });

  if (parcial && uniq) {
    avisos.push(`UNIQUE PARCIAL perdeu a condição "${m[2]?.trim()}" → virou índice não-único: ${i.tablename}.${i.indexname}. Garanta a regra na aplicação.`);
    out.push(`CREATE INDEX ${q(i.indexname)} ON ${q(i.tablename)} (${partes.join(", ")});`);
  } else if (parcial) {
    out.push(`CREATE INDEX ${q(i.indexname)} ON ${q(i.tablename)} (${partes.join(", ")});`);
  } else {
    out.push(`CREATE ${uniq ? "UNIQUE " : ""}INDEX ${q(i.indexname)} ON ${q(i.tablename)} (${partes.join(", ")});`);
  }
}

// ── 5. Foreign keys ─────────────────────────────────────────────────
out.push(`\n\n-- ════════════════════════════════════════════════════════════════
-- CHAVES ESTRANGEIRAS
-- FKs que apontavam para auth.users(id) no Supabase passam a apontar
-- para auth_users(id).
-- ════════════════════════════════════════════════════════════════`);

for (const c of S.constraints.filter((x) => x.contype === "f")) {
  const m = c.def.match(
    /^FOREIGN KEY \(([^)]*)\) REFERENCES ([\w."]+)\(([^)]*)\)(.*)$/is);
  if (!m) { avisos.push(`FK ignorada (formato não reconhecido): ${c.conname}`); continue; }
  let alvo = m[2].replace(/"/g, "");
  if (/^auth\.users$/i.test(alvo)) alvo = "auth_users";
  else if (/^storage\./i.test(alvo)) {
    avisos.push(`FK para o Storage do Supabase removida (não há equivalente em MySQL): ${c.table_name}.${c.conname}`);
    continue;
  } else alvo = alvo.replace(/^public\./, "");

  const acoes = (m[4] || "")
    .replace(/\bON UPDATE NO ACTION\b/gi, "")
    .replace(/\bON DELETE NO ACTION\b/gi, "")
    .replace(/\bDEFERRABLE\b|\bINITIALLY DEFERRED\b/gi, "")
    .trim();

  out.push(`ALTER TABLE ${q(c.table_name)} ADD CONSTRAINT ${q(c.conname)} ` +
    `FOREIGN KEY (${m[1].split(",").map((x) => q(x.trim().replace(/"/g, ""))).join(", ")}) ` +
    `REFERENCES ${q(alvo)} (${m[3].split(",").map((x) => q(x.trim().replace(/"/g, ""))).join(", ")})` +
    (acoes ? ` ${acoes}` : "") + ";");
}

writeFileSync("/tmp/pgtest/parte_schema.sql", out.join("\n"));
writeFileSync("/tmp/pgtest/avisos.json", JSON.stringify(avisos, null, 2));
console.log(`Schema MySQL gerado: ${out.join("\n").split("\n").length} linhas`);
console.log(`Tabelas: ${tabelasOrdenadas.length} | Avisos: ${avisos.length}`);
avisos.slice(0, 25).forEach((a) => console.log("  ! " + a));

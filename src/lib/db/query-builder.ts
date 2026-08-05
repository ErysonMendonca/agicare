// ════════════════════════════════════════════════════════════════
// Query builder compatível com a API do supabase-js, compilando para SQL
// MySQL. Existe para que os ~540 pontos de chamada espalhados em 123
// arquivos continuem funcionando sem alteração: reescrever cada um à mão
// seria 540 oportunidades de mudar silenciosamente o resultado de uma tela,
// sem suíte de testes para pegar a regressão.
//
// Cobre o que o projeto realmente usa (medido no código):
//   · select com lista de colunas, "*" e embeds aninhados até 3 níveis
//   · dicas de embed: !inner, !coluna e !nome_da_fk
//   · filtros eq neq gt gte lt lte like ilike is in or not match contains
//   · order (ascending), limit, range
//   · single / maybeSingle
//   · count: "exact" e head: true
//   · insert / update / upsert (onConflict) / delete
//
// NÃO cobre (não usado no projeto): .rpc(), textSearch, overlaps, filtros
// sobre colunas embutidas. Qualquer uma dessas lança erro explícito em vez
// de devolver resultado errado em silêncio.
//
// ── Isolamento multitenant ──
// No Postgres o isolamento por clínica era garantido por RLS. MySQL não tem
// RLS, então o escopo é aplicado AQUI: um builder criado com `clinicId`
// injeta `clinic_id = ?` em toda tabela que tenha a coluna, em leitura e
// escrita. É o mesmo efeito das 103 policies, num único lugar auditável.
// ════════════════════════════════════════════════════════════════

import { consultar, executar, type Linha } from "./mysql";
import { meta, type CategoriaColuna, type Relacao } from "./schema-meta";

export type Erro = { message: string; code?: string; details?: string } | null;
export type Resposta<T> = { data: T; error: Erro; count: number | null };

const cerca = (id: string) => `\`${id.replace(/`/g, "``")}\``;

// ── Categoria de coluna, com aviso de metadados defasados ───────────
// Coluna ausente nos metadados cai em "text", o que significa NÃO converter:
// um TINYINT voltaria como 1 em vez de true e a tela mostraria valor errado
// sem erro nenhum. Como isso só acontece se schema-meta.ts ficou defasado em
// relação às migrations, avisamos alto em desenvolvimento.
const jaAvisado = new Set<string>();

function catDe(tabela: string, coluna: string): CategoriaColuna {
  const m = META_CACHE(tabela);
  const c = m?.colunas[coluna];
  if (c) return c;
  if (m && process.env.NODE_ENV !== "production") {
    const k = `${tabela}.${coluna}`;
    if (!jaAvisado.has(k)) {
      jaAvisado.add(k);
      console.warn(
        `[db] coluna "${k}" não está em schema-meta.ts — o valor não será ` +
        `convertido (booleanos e JSON virão crus). Rode: node mysql/gerar-meta.mjs`,
      );
    }
  }
  return "text";
}

function META_CACHE(tabela: string) {
  try { return meta(tabela); } catch { return null; }
}

// ── Conversão de valores ────────────────────────────────────────────

/** Valor da aplicação → valor que o driver MySQL aceita. */
function paraBanco(v: unknown, cat: CategoriaColuna): unknown {
  if (v === null || v === undefined) return null;
  switch (cat) {
    case "boolean":
      return v === true || v === "true" || v === 1 ? 1 : 0;
    case "json":
    case "array":
      return typeof v === "string" ? v : JSON.stringify(v);
    case "timestamp": {
      if (v instanceof Date) return v.toISOString().slice(0, 23).replace("T", " ");
      const s = String(v);
      // ISO da aplicação → DATETIME do MySQL (sempre em UTC).
      const m = s.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}(:\d{2})?(\.\d+)?)/);
      return m ? `${m[1]} ${m[2]}` : s;
    }
    case "date":
      return v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10);
    case "number":
      return typeof v === "number" ? v : Number(v);
    default:
      return v;
  }
}

/** Valor do MySQL → valor que a aplicação espera (o que o PostgREST devolvia). */
function daBanco(v: unknown, cat: CategoriaColuna): unknown {
  if (v === null || v === undefined) return null;
  switch (cat) {
    case "boolean":
      return v === 1 || v === true || v === "1";
    case "json":
    case "array":
      if (typeof v !== "string") return v; // driver já parseou
      try { return JSON.parse(v); } catch { return v; }
    case "timestamp": {
      // O banco guarda UTC sem fuso; a aplicação espera ISO com Z, como
      // vinha do Postgres (timestamptz).
      const s = String(v);
      if (/Z$|[+-]\d{2}:?\d{2}$/.test(s)) return s;
      return `${s.replace(" ", "T")}Z`;
    }
    case "number":
      return typeof v === "number" ? v : Number(v);
    default:
      return v;
  }
}

// ── Parse do argumento de select() ──────────────────────────────────

type Embed = {
  /** Nome usado no select — é a chave no objeto de resultado. */
  apelido: string;
  /** Tabela de destino (igual ao apelido, salvo dica). */
  tabela: string;
  /** Dica após "!": "inner", nome de coluna local ou nome da FK. */
  dica: string | null;
  inner: boolean;
  colunas: string[];
  embeds: Embed[];
};

type SelectParse = { colunas: string[]; embeds: Embed[] };

/** Divide por vírgulas no nível 0 de parênteses. */
function dividirTopo(s: string): string[] {
  const out: string[] = [];
  let cur = "", d = 0;
  for (const c of s) {
    if (c === "(") d++;
    if (c === ")") d--;
    if (c === "," && d === 0) { out.push(cur.trim()); cur = ""; continue; }
    cur += c;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

function parseSelect(arg: string): SelectParse {
  const colunas: string[] = [];
  const embeds: Embed[] = [];
  for (const parte of dividirTopo(arg)) {
    const abre = parte.indexOf("(");
    if (abre === -1) { colunas.push(parte.trim()); continue; }
    const cabeca = parte.slice(0, abre).trim();
    const dentro = parte.slice(abre + 1, parte.lastIndexOf(")"));
    const [nome, dica = null] = cabeca.split("!").map((x) => x.trim());
    const filhos = parseSelect(dentro);
    embeds.push({
      apelido: nome,
      tabela: nome,
      dica: dica === "inner" ? null : dica,
      inner: dica === "inner",
      colunas: filhos.colunas,
      embeds: filhos.embeds,
    });
  }
  return { colunas, embeds };
}

/** Resolve qual FK usar para um embed N:1, considerando a dica. */
function acharRelacaoParaUm(tabelaBase: string, e: Embed): Relacao | null {
  const cands = meta(tabelaBase).paraUm[e.tabela] ?? [];
  if (cands.length === 0) return null;
  if (cands.length === 1 && !e.dica) return cands[0];
  if (e.dica) {
    // dica pode ser o nome da constraint ou o nome da coluna local
    const porFk = cands.find((r) => r.fk === e.dica);
    if (porFk) return porFk;
    const porCol = cands.find((r) => r.colunaLocal === e.dica);
    if (porCol) return porCol;
    throw new Error(
      `Embed "${e.tabela}!${e.dica}" em ${tabelaBase}: dica não corresponde a ` +
      `nenhuma FK. Opções: ${cands.map((c) => `${c.colunaLocal} (${c.fk})`).join(", ")}`,
    );
  }
  throw new Error(
    `Embed "${e.tabela}" em ${tabelaBase} é ambíguo (${cands.length} FKs: ` +
    `${cands.map((c) => c.colunaLocal).join(", ")}). Use a dica !coluna no select.`,
  );
}

function acharRelacaoParaMuitos(tabelaBase: string, e: Embed): Relacao | null {
  const cands = meta(tabelaBase).paraMuitos[e.tabela] ?? [];
  if (cands.length === 0) return null;
  if (cands.length === 1) return cands[0];
  if (e.dica) {
    const r = cands.find((x) => x.fk === e.dica || x.colunaLocal === e.dica);
    if (r) return r;
  }
  throw new Error(
    `Embed 1:N "${e.tabela}" em ${tabelaBase} é ambíguo ` +
    `(${cands.map((c) => c.colunaLocal).join(", ")}). Use a dica !coluna.`,
  );
}

// ── Filtros ─────────────────────────────────────────────────────────

type Filtro =
  | { t: "cmp"; col: string; op: string; val: unknown }
  | { t: "in"; col: string; vals: unknown[] }
  | { t: "is"; col: string; val: null | boolean }
  | { t: "like"; col: string; padrao: string; sensivel: boolean }
  | { t: "contains"; col: string; val: unknown }
  | { t: "or"; expr: string; tabela: string }
  | { t: "not"; col: string; op: string; val: unknown };

const OPS: Record<string, string> = {
  eq: "=", neq: "<>", gt: ">", gte: ">=", lt: "<", lte: "<=",
};

/**
 * Remove aspas duplas de envolvimento (sintaxe PostgREST p/ valores com
 * caractere especial, ex.: `JSON.stringify("Clínica Médica")` → `"Clínica
 * Médica"`). Sem isso, o valor comparado no SQL fica literalmente com as
 * aspas (`"Clínica Médica"`), que nunca bate com a coluna real — o filtro
 * OR correspondente nunca casa e a linha inteira some do resultado.
 */
function semAspas(s: string): string {
  if (s.length >= 2 && s.startsWith('"') && s.endsWith('"')) {
    return s.slice(1, -1).replace(/\\"/g, '"');
  }
  return s;
}

/**
 * Traduz a sintaxe `.or("a.eq.1,b.is.null")` do PostgREST.
 *
 * `prefixo` é o alias da tabela-base na query (ex.: "t0"), o mesmo aplicado
 * pelos demais filtros em `where()`. Sem prefixar as colunas aqui, um SELECT
 * com JOIN para uma tabela que tenha coluna de mesmo nome (ex.: `specialty`
 * existe tanto em `queue_entries` quanto em `professionals`) faz o MySQL
 * recusar a query inteira com "Column '...' in where clause is ambiguous" —
 * erro que ficava mascarado porque os chamadores tratam `error` devolvendo
 * lista vazia, sem logar nada.
 */
function parseOr(expr: string, tabela: string, prefixo = ""): { sql: string; params: unknown[] } {
  const p_ = prefixo ? `${prefixo}.` : "";
  const partes = dividirTopo(expr);
  const pedacos: string[] = [];
  const params: unknown[] = [];
  for (const p of partes) {
    // A coluna é `\w+` (sem ponto) e o operador vem em seguida. Não usar
    // `[\w.]+` para a coluna: sendo guloso, em "cpf.eq.529.982.247-25" ele
    // engole "cpf.eq.529" como coluna e lê "982" como operador. O VALOR pode
    // conter pontos (CPF, CNS, decimal), então é ele que fica com o resto.
    const m = p.match(/^(\w+)\.([a-z]+)\.([\s\S]*)$/i);
    if (!m) throw new Error(`Filtro .or() não reconhecido: "${p}"`);
    const [, col, op, bruto] = m;
    const cat = catDe(tabela, col);
    if (op === "is") {
      pedacos.push(bruto === "null" ? `${p_}${cerca(col)} IS NULL` : `${p_}${cerca(col)} = ?`);
      if (bruto !== "null") params.push(bruto === "true" ? 1 : 0);
      continue;
    }
    if (op === "in") {
      const vals = bruto.replace(/^\(|\)$/g, "").split(",").map((x) => x.replace(/^"|"$/g, ""));
      pedacos.push(`${p_}${cerca(col)} IN (${vals.map(() => "?").join(", ")})`);
      vals.forEach((v) => params.push(paraBanco(v, cat)));
      continue;
    }
    if (op === "like" || op === "ilike") {
      pedacos.push(`${p_}${cerca(col)} LIKE ?`);
      params.push(semAspas(bruto).replace(/\*/g, "%"));
      continue;
    }
    const sqlOp = OPS[op];
    if (!sqlOp) throw new Error(`Operador não suportado em .or(): "${op}"`);
    pedacos.push(`${p_}${cerca(col)} ${sqlOp} ?`);
    params.push(paraBanco(semAspas(bruto), cat));
  }
  return { sql: `(${pedacos.join(" OR ")})`, params };
}

// ── Builder ─────────────────────────────────────────────────────────

type Ordem = { col: string; asc: boolean };

// O padrão é `Linha[]` (= Record<string, any>[]), não `any[]`.
// A diferença importa: com `any[]`, o padrão muito usado no projeto
// `Array.isArray(p.x) ? p.x : []` gera a união `any[] | never[]`, e o TS
// desiste de dar tipo contextual ao callback do .map() seguinte
// (noImplicitAny). Com Record<string, any> a narrowing funciona.
// `single()`/`maybeSingle()` estreitam para `any`, como o PostgREST devolvia.
class Consulta<T = Linha[]> implements PromiseLike<Resposta<T>> {
  private filtros: Filtro[] = [];
  private ordens: Ordem[] = [];
  private lim: number | null = null;
  private off = 0;
  private modo: "select" | "insert" | "update" | "upsert" | "delete" = "select";
  private selArg = "*";
  private dados: Linha[] = [];
  private onConflict: string[] = [];
  private querCount = false;
  private soCount = false;
  private umSo: "single" | "maybe" | null = null;
  private devolverRepresentacao = false;

  constructor(
    private tabela: string,
    private clinicId: string | null,
  ) {}

  // ── seleção / mutação ──
  select(arg = "*", opts?: { count?: "exact"; head?: boolean }): this {
    if (this.modo === "select") this.selArg = arg;
    else this.devolverRepresentacao = true; // .insert().select()
    if (opts?.count === "exact") this.querCount = true;
    if (opts?.head) this.soCount = true;
    return this;
  }
  insert(rows: Linha | Linha[]): this {
    this.modo = "insert";
    this.dados = Array.isArray(rows) ? rows : [rows];
    return this;
  }
  update(patch: Linha): this {
    this.modo = "update";
    this.dados = [patch];
    return this;
  }
  upsert(rows: Linha | Linha[], opts?: { onConflict?: string }): this {
    this.modo = "upsert";
    this.dados = Array.isArray(rows) ? rows : [rows];
    this.onConflict = opts?.onConflict
      ? opts.onConflict.split(",").map((x) => x.trim())
      : meta(this.tabela).pk;
    return this;
  }
  delete(): this { this.modo = "delete"; return this; }

  // ── filtros ──
  private cat(col: string): CategoriaColuna {
    return catDe(this.tabela, col);
  }
  eq(col: string, val: unknown): this {
    this.filtros.push({ t: "cmp", col, op: "=", val }); return this;
  }
  neq(col: string, val: unknown): this {
    this.filtros.push({ t: "cmp", col, op: "<>", val }); return this;
  }
  gt(col: string, val: unknown): this {
    this.filtros.push({ t: "cmp", col, op: ">", val }); return this;
  }
  gte(col: string, val: unknown): this {
    this.filtros.push({ t: "cmp", col, op: ">=", val }); return this;
  }
  lt(col: string, val: unknown): this {
    this.filtros.push({ t: "cmp", col, op: "<", val }); return this;
  }
  lte(col: string, val: unknown): this {
    this.filtros.push({ t: "cmp", col, op: "<=", val }); return this;
  }
  is(col: string, val: null | boolean): this {
    this.filtros.push({ t: "is", col, val }); return this;
  }
  in(col: string, vals: unknown[]): this {
    this.filtros.push({ t: "in", col, vals }); return this;
  }
  like(col: string, padrao: string): this {
    this.filtros.push({ t: "like", col, padrao, sensivel: true }); return this;
  }
  ilike(col: string, padrao: string): this {
    this.filtros.push({ t: "like", col, padrao, sensivel: false }); return this;
  }
  contains(col: string, val: unknown): this {
    this.filtros.push({ t: "contains", col, val }); return this;
  }
  or(expr: string): this {
    // Compilação adiada p/ where(prefixo): só ali sabemos o alias da tabela
    // (t0), necessário p/ não gerar coluna ambígua quando a query tem JOINs.
    this.filtros.push({ t: "or", expr, tabela: this.tabela });
    return this;
  }
  not(col: string, op: string, val: unknown): this {
    this.filtros.push({ t: "not", col, op, val }); return this;
  }
  match(cond: Linha): this {
    for (const [col, val] of Object.entries(cond)) this.eq(col, val);
    return this;
  }
  filter(col: string, op: string, val: unknown): this {
    if (op === "is") return this.is(col, val as null);
    if (op === "in") return this.in(col, val as unknown[]);
    const sqlOp = OPS[op];
    if (!sqlOp) throw new Error(`Operador não suportado em .filter(): "${op}"`);
    this.filtros.push({ t: "cmp", col, op: sqlOp, val });
    return this;
  }

  // ── ordenação / paginação ──
  order(col: string, opts?: { ascending?: boolean }): this {
    this.ordens.push({ col, asc: opts?.ascending !== false });
    return this;
  }
  limit(n: number): this { this.lim = n; return this; }
  range(de: number, ate: number): this {
    this.off = de; this.lim = ate - de + 1; return this;
  }
  single(): Consulta<Linha | null> {
    this.umSo = "single"; this.lim = 2;
    return this as unknown as Consulta<Linha | null>;
  }
  maybeSingle(): Consulta<Linha | null> {
    this.umSo = "maybe"; this.lim = 2;
    return this as unknown as Consulta<Linha | null>;
  }

  // ── compilação do WHERE ──
  private where(prefixo = ""): { sql: string; params: unknown[] } {
    const p = prefixo ? `${prefixo}.` : "";
    const pedacos: string[] = [];
    const params: unknown[] = [];

    // Isolamento multitenant: substitui a RLS do Postgres.
    if (this.clinicId && meta(this.tabela).temClinicId) {
      pedacos.push(`${p}${cerca("clinic_id")} = ?`);
      params.push(this.clinicId);
    }

    for (const f of this.filtros) {
      switch (f.t) {
        case "cmp":
          if (f.val === null) { pedacos.push(`${p}${cerca(f.col)} IS NULL`); break; }
          pedacos.push(`${p}${cerca(f.col)} ${f.op} ?`);
          params.push(paraBanco(f.val, this.cat(f.col)));
          break;
        case "is":
          pedacos.push(f.val === null
            ? `${p}${cerca(f.col)} IS NULL`
            : `${p}${cerca(f.col)} = ?`);
          if (f.val !== null) params.push(f.val ? 1 : 0);
          break;
        case "in": {
          if (f.vals.length === 0) { pedacos.push("1 = 0"); break; }
          pedacos.push(`${p}${cerca(f.col)} IN (${f.vals.map(() => "?").join(", ")})`);
          f.vals.forEach((v) => params.push(paraBanco(v, this.cat(f.col))));
          break;
        }
        case "like":
          // utf8mb4_unicode_ci já é case-insensitive; ilike e like caem no
          // mesmo LIKE. Para like sensível a caixa, força collation binária.
          pedacos.push(f.sensivel
            ? `${p}${cerca(f.col)} COLLATE utf8mb4_bin LIKE ?`
            : `${p}${cerca(f.col)} LIKE ?`);
          params.push(f.padrao.replace(/\*/g, "%"));
          break;
        case "contains": {
          // No Postgres era array/jsonb contains. Em MySQL, JSON_CONTAINS.
          pedacos.push(`JSON_CONTAINS(${p}${cerca(f.col)}, ?)`);
          params.push(JSON.stringify(f.val));
          break;
        }
        case "or": {
          const { sql, params: pOr } = parseOr(f.expr, f.tabela, prefixo);
          pedacos.push(sql);
          params.push(...pOr);
          break;
        }
        case "not": {
          const sqlOp = OPS[f.op];
          if (f.op === "is") {
            pedacos.push(f.val === null
              ? `${p}${cerca(f.col)} IS NOT NULL`
              : `NOT (${p}${cerca(f.col)} = ?)`);
            if (f.val !== null) params.push(f.val ? 1 : 0);
            break;
          }
          if (!sqlOp) throw new Error(`Operador não suportado em .not(): "${f.op}"`);
          pedacos.push(`NOT (${p}${cerca(f.col)} ${sqlOp} ?)`);
          params.push(paraBanco(f.val, this.cat(f.col)));
          break;
        }
      }
    }
    return {
      sql: pedacos.length ? ` WHERE ${pedacos.join(" AND ")}` : "",
      params,
    };
  }

  // ── execução ──
  then<R1 = Resposta<T>, R2 = never>(
    ok?: ((v: Resposta<T>) => R1 | PromiseLike<R1>) | null,
    falha?: ((e: unknown) => R2 | PromiseLike<R2>) | null,
  ): PromiseLike<R1 | R2> {
    return this.executar().then(ok, falha);
  }

  private async executar(): Promise<Resposta<T>> {
    try {
      switch (this.modo) {
        case "select": return await this.rodarSelect();
        case "insert": return await this.rodarInsert();
        case "update": return await this.rodarUpdate();
        case "upsert": return await this.rodarUpsert();
        case "delete": return await this.rodarDelete();
      }
    } catch (e) {
      const err = e as Error & { code?: string; sqlMessage?: string };
      return {
        data: (this.umSo ? null : []) as T,
        error: {
          message: err.sqlMessage ?? err.message,
          code: err.code,
          details: err.stack?.split("\n")[1]?.trim(),
        },
        count: null,
      };
    }
  }

  /** Monta e roda o SELECT, incluindo embeds. */
  private async rodarSelect(): Promise<Resposta<T>> {
    const parse = parseSelect(this.selArg);
    const base = this.tabela;

    // Colunas do próprio registro
    const colsBase = parse.colunas.includes("*")
      ? Object.keys(meta(base).colunas)
      : parse.colunas.filter((c) => c && c !== "*");

    const sel: string[] = colsBase.map((c) => `t0.${cerca(c)} AS ${cerca(c)}`);
    const joins: string[] = [];
    // Mapa alias→tabela para converter os valores na volta
    const aliasTabela = new Map<string, string>([["t0", base]]);
    let n = 0;

    // Embeds N:1 viram JOIN; embeds 1:N são consultados depois.
    const umParaMuitos: Embed[] = [];

    const percorrer = (tabelaPai: string, aliasPai: string, embeds: Embed[], caminho: string) => {
      for (const e of embeds) {
        const relUm = acharRelacaoParaUm(tabelaPai, e);
        if (!relUm) {
          if (caminho === "") { umParaMuitos.push(e); continue; }
          throw new Error(
            `Embed "${e.tabela}" dentro de "${caminho}" não é N:1 — aninhamento 1:N ` +
            `em profundidade não é suportado.`,
          );
        }
        const alias = `t${++n}`;
        aliasTabela.set(alias, e.tabela);
        joins.push(
          `${e.inner ? "INNER" : "LEFT"} JOIN ${cerca(e.tabela)} ${alias} ` +
          `ON ${alias}.${cerca(relUm.colunaAlvo)} = ${aliasPai}.${cerca(relUm.colunaLocal)}`,
        );
        const pref = caminho ? `${caminho}.${e.apelido}` : e.apelido;
        const cols = e.colunas.includes("*")
          ? Object.keys(meta(e.tabela).colunas)
          : e.colunas.filter((c) => c && c !== "*");
        for (const c of cols) {
          sel.push(`${alias}.${cerca(c)} AS ${cerca(`${pref}.${c}`)}`);
        }
        percorrer(e.tabela, alias, e.embeds, pref);
      }
    };
    percorrer(base, "t0", parse.embeds, "");

    const { sql: onde, params } = this.where("t0");
    const ordem = this.ordens.length
      ? ` ORDER BY ${this.ordens.map((o) => `t0.${cerca(o.col)} ${o.asc ? "ASC" : "DESC"}`).join(", ")}`
      : "";

    // count exato: COUNT(*) com os mesmos filtros/joins
    let count: number | null = null;
    if (this.querCount || this.soCount) {
      const sqlCount =
        `SELECT COUNT(*) AS n FROM ${cerca(base)} t0 ${joins.join(" ")}${onde}`;
      const r = await consultar<{ n: number }>(sqlCount, params);
      count = Number(r[0]?.n ?? 0);
      if (this.soCount) return { data: [] as unknown as T, error: null, count };
    }

    const limite = this.lim != null
      ? ` LIMIT ${Number(this.lim)}${this.off ? ` OFFSET ${Number(this.off)}` : ""}`
      : "";
    const sql =
      `SELECT ${sel.length ? sel.join(", ") : "t0.*"} FROM ${cerca(base)} t0` +
      `${joins.length ? " " + joins.join(" ") : ""}${onde}${ordem}${limite}`;

    const brutas = await consultar(sql, params);

    // Reconstrói o formato do PostgREST: embed N:1 vira objeto aninhado.
    const linhas = brutas.map((r) => this.hidratar(r, base, aliasTabela));

    // Embeds 1:N: uma consulta por relação, agrupando pelos ids do lote.
    for (const e of umParaMuitos) {
      const rel = acharRelacaoParaMuitos(base, e);
      if (!rel) {
        throw new Error(
          `Embed "${e.tabela}" não tem relação com ${base} no schema — ` +
          `verifique o nome ou a FK.`,
        );
      }
      const ids = [...new Set(linhas.map((l) => (l as Linha)[rel.colunaAlvo]))]
        .filter((v) => v !== null && v !== undefined);
      const porId = new Map<unknown, Linha[]>();
      if (ids.length > 0) {
        const colsF = e.colunas.includes("*")
          ? Object.keys(meta(e.tabela).colunas)
          : e.colunas.filter((c) => c && c !== "*");
        // a coluna da FK é necessária para agrupar, mesmo se não pedida
        const colsSel = [...new Set([...colsF, rel.colunaLocal])];
        const sqlF =
          `SELECT ${colsSel.map((c) => `${cerca(c)}`).join(", ")} ` +
          `FROM ${cerca(e.tabela)} WHERE ${cerca(rel.colunaLocal)} IN (${ids.map(() => "?").join(", ")})`;
        const filhas = await consultar(sqlF, ids);
        for (const f of filhas) {
          const conv: Linha = {};
          for (const [k, v] of Object.entries(f)) {
            conv[k] = daBanco(v, catDe(e.tabela, k));
          }
          const chave = conv[rel.colunaLocal];
          if (!porId.has(chave)) porId.set(chave, []);
          // não devolve a coluna de agrupamento se não foi pedida
          if (!colsF.includes(rel.colunaLocal)) delete conv[rel.colunaLocal];
          porId.get(chave)!.push(conv);
        }
      }
      for (const l of linhas) {
        (l as Linha)[e.apelido] = porId.get((l as Linha)[rel.colunaAlvo]) ?? [];
      }
    }

    if (this.umSo) {
      if (linhas.length === 0) {
        if (this.umSo === "maybe") return { data: null as T, error: null, count };
        return {
          data: null as T,
          error: { message: "Nenhuma linha encontrada", code: "PGRST116" },
          count,
        };
      }
      if (linhas.length > 1 && this.umSo === "single") {
        return {
          data: null as T,
          error: { message: "Mais de uma linha retornada", code: "PGRST116" },
          count,
        };
      }
      return { data: linhas[0] as T, error: null, count };
    }
    return { data: linhas as T, error: null, count };
  }

  /** Achata "professionals.profiles.full_name" em objetos aninhados. */
  private hidratar(
    bruta: Linha,
    base: string,
    aliasTabela: Map<string, string>,
  ): Linha {
    const out: Linha = {};
    // tabela de cada caminho, para saber a categoria da coluna
    for (const [chave, valor] of Object.entries(bruta)) {
      if (!chave.includes(".")) {
        out[chave] = daBanco(valor, catDe(base, chave));
        continue;
      }
      const partes = chave.split(".");
      const coluna = partes.pop()!;
      let alvo = out;
      let tabelaAtual = base;
      for (const p of partes) {
        // resolve a tabela do embed pelo grafo
        const rel = (meta(tabelaAtual).paraUm[p] ?? [])[0];
        tabelaAtual = rel ? rel.para : p;
        if (alvo[p] == null || typeof alvo[p] !== "object") alvo[p] = {};
        alvo = alvo[p] as Linha;
      }
      alvo[coluna] = daBanco(valor, catDe(tabelaAtual, coluna));
    }
    // Embed N:1 sem match no LEFT JOIN vem com todas as colunas null: o
    // PostgREST devolve null no lugar do objeto, não um objeto de nulls.
    for (const [k, v] of Object.entries(out)) {
      if (v && typeof v === "object" && !Array.isArray(v)) {
        const vals = Object.values(v as Linha);
        if (vals.length > 0 && vals.every((x) => x === null)) out[k] = null;
      }
    }
    return out;
  }

  private colunasValidas(): Set<string> {
    return new Set(Object.keys(meta(this.tabela).colunas));
  }

  private async rodarInsert(): Promise<Resposta<T>> {
    const validas = this.colunasValidas();
    const linhas = this.dados.map((d) => {
      const r: Linha = { ...d };
      // Injeta a clínica ativa: no Postgres isso vinha do DEFAULT + RLS.
      if (this.clinicId && meta(this.tabela).temClinicId && r.clinic_id == null) {
        r.clinic_id = this.clinicId;
      }
      return r;
    });
    const cols = [...new Set(linhas.flatMap((l) => Object.keys(l)))]
      .filter((c) => validas.has(c));
    if (cols.length === 0) throw new Error(`INSERT em ${this.tabela} sem colunas válidas.`);

    const params: unknown[] = [];
    const tuplas = linhas.map((l) => {
      const vals = cols.map((c) => {
        params.push(paraBanco(l[c] ?? null, this.cat(c)));
        return "?";
      });
      return `(${vals.join(", ")})`;
    });
    const sql =
      `INSERT INTO ${cerca(this.tabela)} (${cols.map(cerca).join(", ")}) ` +
      `VALUES ${tuplas.join(", ")}`;
    await executar(sql, params);

    if (!this.devolverRepresentacao) {
      return { data: (this.umSo ? null : []) as T, error: null, count: null };
    }
    return await this.lerDeVolta(linhas, cols);
  }

  private async rodarUpsert(): Promise<Resposta<T>> {
    const validas = this.colunasValidas();
    const linhas = this.dados.map((d) => {
      const r: Linha = { ...d };
      if (this.clinicId && meta(this.tabela).temClinicId && r.clinic_id == null) {
        r.clinic_id = this.clinicId;
      }
      return r;
    });
    const cols = [...new Set(linhas.flatMap((l) => Object.keys(l)))]
      .filter((c) => validas.has(c));
    const params: unknown[] = [];
    const tuplas = linhas.map((l) => `(${cols.map((c) => {
      params.push(paraBanco(l[c] ?? null, this.cat(c)));
      return "?";
    }).join(", ")})`);
    // MySQL não tem ON CONFLICT (cols); usa ON DUPLICATE KEY, que dispara em
    // qualquer índice único. Como onConflict aqui sempre coincide com um
    // índice único existente, o efeito é o mesmo.
    const atualiza = cols
      .filter((c) => !this.onConflict.includes(c))
      .map((c) => `${cerca(c)} = VALUES(${cerca(c)})`);
    const sql =
      `INSERT INTO ${cerca(this.tabela)} (${cols.map(cerca).join(", ")}) ` +
      `VALUES ${tuplas.join(", ")}` +
      (atualiza.length ? ` ON DUPLICATE KEY UPDATE ${atualiza.join(", ")}` : "");
    await executar(sql, params);
    if (!this.devolverRepresentacao) {
      return { data: (this.umSo ? null : []) as T, error: null, count: null };
    }
    return await this.lerDeVolta(linhas, cols);
  }

  /**
   * Relê as linhas gravadas para o `.insert().select()` devolver o registro
   * completo (com defaults do banco), como o PostgREST fazia.
   */
  private async lerDeVolta(linhas: Linha[], cols: string[]): Promise<Resposta<T>> {
    const pk = meta(this.tabela).pk;
    const chaves = pk.length && linhas.every((l) => pk.every((k) => l[k] != null))
      ? pk
      : this.onConflict.length ? this.onConflict : [];

    let lidas: Linha[] = [];
    if (chaves.length > 0) {
      const cond = linhas.map(() =>
        `(${chaves.map((k) => `${cerca(k)} = ?`).join(" AND ")})`).join(" OR ");
      const params = linhas.flatMap((l) => chaves.map((k) => paraBanco(l[k], this.cat(k))));
      lidas = await consultar(
        `SELECT * FROM ${cerca(this.tabela)} WHERE ${cond}`, params);
    } else {
      // Sem PK conhecida no payload (id gerado pelo banco): usa as colunas
      // enviadas como filtro e pega as mais recentes.
      const usar = cols.filter((c) => c !== "id").slice(0, 4);
      const cond = usar.map((c) => `${cerca(c)} <=> ?`).join(" AND ");
      const params = usar.map((c) => paraBanco(linhas[0][c] ?? null, this.cat(c)));
      lidas = await consultar(
        `SELECT * FROM ${cerca(this.tabela)}${cond ? ` WHERE ${cond}` : ""} ` +
        `ORDER BY ${meta(this.tabela).colunas.created_at ? cerca("created_at") : cerca(pk[0] ?? "id")} DESC ` +
        `LIMIT ${linhas.length}`, params);
    }

    const conv = lidas.map((r) => {
      const o: Linha = {};
      for (const [k, v] of Object.entries(r)) o[k] = daBanco(v, this.cat(k));
      return o;
    });
    if (this.umSo) {
      if (conv.length === 0) {
        return this.umSo === "maybe"
          ? { data: null as T, error: null, count: null }
          : { data: null as T, error: { message: "Nenhuma linha encontrada", code: "PGRST116" }, count: null };
      }
      return { data: conv[0] as T, error: null, count: null };
    }
    return { data: conv as T, error: null, count: null };
  }

  private async rodarUpdate(): Promise<Resposta<T>> {
    const validas = this.colunasValidas();
    const patch = this.dados[0] ?? {};
    const cols = Object.keys(patch).filter((c) => validas.has(c));
    if (cols.length === 0) throw new Error(`UPDATE em ${this.tabela} sem colunas válidas.`);
    const params: unknown[] = cols.map((c) => paraBanco(patch[c] ?? null, this.cat(c)));
    const { sql: onde, params: pOnde } = this.where();
    if (!onde) {
      throw new Error(
        `UPDATE em ${this.tabela} sem filtro — bloqueado para não reescrever a tabela inteira.`,
      );
    }

    // Se for preciso devolver as linhas afetadas (.select() encadeado),
    // captura a PK das linhas ANTES do UPDATE. Reaplicar o mesmo WHERE
    // depois do UPDATE (como era feito antes) falha sempre que o patch
    // muda uma coluna usada no próprio filtro — ex.: transição de estado
    // `.update({status:"B"}).eq("status","A")`: depois do UPDATE nenhuma
    // linha tem mais `status = "A"`, então a releitura via WHERE original
    // sempre volta vazia, mesmo com o UPDATE tendo funcionado certinho.
    const pk = meta(this.tabela).pk;
    let pkRows: Linha[] = [];
    if (this.devolverRepresentacao) {
      if (pk.length === 0) {
        throw new Error(
          `UPDATE...select() em ${this.tabela} sem PK conhecida — não é possível reler as linhas afetadas.`,
        );
      }
      pkRows = await consultar(
        `SELECT ${pk.map((k) => cerca(k)).join(", ")} FROM ${cerca(this.tabela)}${onde}`,
        pOnde,
      );
    }

    const sql =
      `UPDATE ${cerca(this.tabela)} SET ${cols.map((c) => `${cerca(c)} = ?`).join(", ")}${onde}`;
    const r = await executar(sql, [...params, ...pOnde]);

    if (!this.devolverRepresentacao) {
      return { data: (this.umSo ? null : []) as T, error: null, count: r.affectedRows };
    }
    // relê as linhas afetadas pela PK capturada antes do UPDATE (não pelo
    // WHERE original, que pode ter ficado obsoleto — ver comentário acima).
    let lidas: Linha[] = [];
    if (pkRows.length > 0) {
      const condPk = pkRows
        .map(() => `(${pk.map((k) => `${cerca(k)} = ?`).join(" AND ")})`)
        .join(" OR ");
      const paramsPk = pkRows.flatMap((linha) => pk.map((k) => linha[k]));
      lidas = await consultar(
        `SELECT * FROM ${cerca(this.tabela)} WHERE ${condPk}`,
        paramsPk,
      );
    }
    const conv = lidas.map((x) => {
      const o: Linha = {};
      for (const [k, v] of Object.entries(x)) o[k] = daBanco(v, this.cat(k));
      return o;
    });
    if (this.umSo) {
      if (conv.length === 0) {
        return this.umSo === "maybe"
          ? { data: null as T, error: null, count: null }
          : { data: null as T, error: { message: "Nenhuma linha encontrada", code: "PGRST116" }, count: null };
      }
      return { data: conv[0] as T, error: null, count: null };
    }
    return { data: conv as T, error: null, count: r.affectedRows };
  }

  private async rodarDelete(): Promise<Resposta<T>> {
    const { sql: onde, params } = this.where();
    if (!onde) {
      throw new Error(
        `DELETE em ${this.tabela} sem filtro — bloqueado para não apagar a tabela inteira.`,
      );
    }
    let antes: Linha[] = [];
    if (this.devolverRepresentacao) {
      antes = await consultar(`SELECT * FROM ${cerca(this.tabela)}${onde}`, params);
    }
    const r = await executar(`DELETE FROM ${cerca(this.tabela)}${onde}`, params);
    const conv = antes.map((x) => {
      const o: Linha = {};
      for (const [k, v] of Object.entries(x)) o[k] = daBanco(v, this.cat(k));
      return o;
    });
    return { data: (this.umSo ? conv[0] ?? null : conv) as T, error: null, count: r.affectedRows };
  }

  /** Só para os testes: devolve o SQL sem executar. */
  _sqlDebug(): { sql: string; params: unknown[] } {
    const parse = parseSelect(this.selArg);
    const colsBase = parse.colunas.includes("*")
      ? Object.keys(meta(this.tabela).colunas)
      : parse.colunas.filter((c) => c && c !== "*");
    const sel = colsBase.map((c) => `t0.${cerca(c)} AS ${cerca(c)}`);
    const joins: string[] = [];
    let n = 0;
    const percorrer = (pai: string, aliasPai: string, embeds: Embed[], caminho: string) => {
      for (const e of embeds) {
        const rel = acharRelacaoParaUm(pai, e);
        if (!rel) continue;
        const alias = `t${++n}`;
        joins.push(
          `${e.inner ? "INNER" : "LEFT"} JOIN ${cerca(e.tabela)} ${alias} ` +
          `ON ${alias}.${cerca(rel.colunaAlvo)} = ${aliasPai}.${cerca(rel.colunaLocal)}`);
        const pref = caminho ? `${caminho}.${e.apelido}` : e.apelido;
        const cols = e.colunas.includes("*")
          ? Object.keys(meta(e.tabela).colunas)
          : e.colunas.filter((c) => c && c !== "*");
        cols.forEach((c) => sel.push(`${alias}.${cerca(c)} AS ${cerca(`${pref}.${c}`)}`));
        percorrer(e.tabela, alias, e.embeds, pref);
      }
    };
    percorrer(this.tabela, "t0", parse.embeds, "");
    const { sql: onde, params } = this.where("t0");
    const ordem = this.ordens.length
      ? ` ORDER BY ${this.ordens.map((o) => `t0.${cerca(o.col)} ${o.asc ? "ASC" : "DESC"}`).join(", ")}`
      : "";
    const limite = this.lim != null
      ? ` LIMIT ${Number(this.lim)}${this.off ? ` OFFSET ${Number(this.off)}` : ""}` : "";
    return {
      sql: `SELECT ${sel.join(", ")} FROM ${cerca(this.tabela)} t0` +
        `${joins.length ? " " + joins.join(" ") : ""}${onde}${ordem}${limite}`,
      params,
    };
  }
}

// ── Cliente ─────────────────────────────────────────────────────────

export type ClienteDb = {
  from(tabela: string): Consulta;
  /** Escopo de clínica ativo (null = sem escopo, equivalente a service-role). */
  readonly clinicId: string | null;
};

/**
 * Cria um cliente de banco.
 * @param clinicId quando informado, TODA consulta a tabela com clinic_id é
 *   filtrada por ele — este é o substituto da RLS. `null` ignora o escopo e
 *   equivale ao antigo cliente service-role: use só no servidor, em rotina
 *   administrativa, nunca a partir de dado vindo do usuário.
 */
export function criarClienteDb(clinicId: string | null): ClienteDb {
  return {
    clinicId,
    from(tabela: string) {
      return new Consulta(tabela, clinicId);
    },
  };
}

export { Consulta };

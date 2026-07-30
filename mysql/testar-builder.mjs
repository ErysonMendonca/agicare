// Testes do query builder: confere o SQL gerado para os padrões REAIS
// extraídos do código do projeto. Roda sem MySQL (não executa nada).
//
//   node mysql/testar-builder.mjs
import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { execSync } from "node:child_process";

const RAIZ = "/sessions/admiring-sleepy-gauss/mnt/agicare";
const TMP = "/tmp/builder-test";

// Transpila os dois módulos TS para ESM (sem checagem de tipos, só remove
// as anotações) para poder importar no Node.
mkdirSync(TMP, { recursive: true });
execSync(
  `npx esbuild ${RAIZ}/src/lib/db/query-builder.ts ${RAIZ}/src/lib/db/schema-meta.ts ` +
  `--outdir=${TMP} --format=esm --platform=node --log-level=error`,
  { cwd: RAIZ, stdio: "inherit" },
);
// O builder importa ./mysql (pool real). Nos testes, substitui por um duplo
// que só registra o SQL, sem abrir conexão.
writeFileSync(`${TMP}/mysql.js`, `
export let ultimas = [];
export function _reset() { ultimas = []; }
export let respostas = [];
export function _responder(rs) { respostas = rs.slice(); }
export async function consultar(sql, params = []) {
  ultimas.push({ sql, params });
  return respostas.length ? respostas.shift() : [];
}
export async function executar(sql, params = []) {
  ultimas.push({ sql, params });
  return { affectedRows: 1, insertId: 0 };
}
export function getPool() { throw new Error("sem pool nos testes"); }
export async function transacao(fn) { return fn({}); }
`);

// esbuild preserva os imports sem extensão; o ESM do Node exige extensão.
for (const f of ["query-builder.js", "schema-meta.js"]) {
  const p = `${TMP}/${f}`;
  writeFileSync(p, readFileSync(p, "utf8")
    .replace(/from "\.\/(mysql|schema-meta|query-builder)"/g, 'from "./$1.js"'));
}

const { criarClienteDb } = await import(`${TMP}/query-builder.js`);
const espia = await import(`${TMP}/mysql.js`);

let ok = 0, falhas = [];

function normaliza(s) { return s.replace(/\s+/g, " ").trim(); }

async function teste(nome, montar, esperado, esperaParams) {
  espia._reset();
  try {
    await montar();
  } catch (e) {
    falhas.push({ nome, erro: `lançou: ${e.message}` });
    return;
  }
  const reg = espia.ultimas;
  if (reg.length === 0) { falhas.push({ nome, erro: "não gerou SQL" }); return; }
  const sql = normaliza(reg[reg.length - 1].sql);
  const params = reg[reg.length - 1].params;

  const partes = Array.isArray(esperado) ? esperado : [esperado];
  const faltando = partes.filter((p) => !sql.includes(normaliza(p)));
  if (faltando.length) {
    falhas.push({ nome, erro: `SQL não contém:\n      ${faltando.join("\n      ")}\n    gerado: ${sql}` });
    return;
  }
  if (esperaParams && JSON.stringify(params) !== JSON.stringify(esperaParams)) {
    falhas.push({ nome, erro: `params esperados ${JSON.stringify(esperaParams)}, obtidos ${JSON.stringify(params)}` });
    return;
  }
  ok++;
}

const db = criarClienteDb(null);           // sem escopo (service-role)
const dbC = criarClienteDb("CLINICA-1");   // com escopo de clínica

console.log("── Básico ───────────────────────────────────────────");

await teste("select de colunas simples",
  () => db.from("patients").select("id, full_name, cpf"),
  "SELECT t0.`id` AS `id`, t0.`full_name` AS `full_name`, t0.`cpf` AS `cpf` FROM `patients` t0");

await teste("select *",
  () => db.from("clinics").select("*"),
  ["SELECT t0.`id` AS `id`", "FROM `clinics` t0"]);

await teste("eq + order + limit",
  () => db.from("patients").select("id").eq("active", true).order("created_at", { ascending: false }).limit(10),
  ["WHERE t0.`active` = ?", "ORDER BY t0.`created_at` DESC", "LIMIT 10"],
  [1]);

await teste("eq com null vira IS NULL",
  () => db.from("queue_entries").select("id").eq("professional_id", null),
  "WHERE t0.`professional_id` IS NULL", []);

await teste("is(null)",
  () => db.from("procedure_executions").select("id").is("document_id", null),
  "WHERE t0.`document_id` IS NULL", []);

await teste("in com lista",
  () => db.from("billable_events").select("id").in("status", ["pendente", "faturado"]),
  "WHERE t0.`status` IN (?, ?)", ["pendente", "faturado"]);

await teste("in vazio não casa nada",
  () => db.from("billable_events").select("id").in("id", []),
  "WHERE 1 = 0", []);

await teste("range vira LIMIT/OFFSET",
  () => db.from("cid_codes").select("code").range(20, 39),
  "LIMIT 20 OFFSET 20");

await teste("count exact + head só conta",
  () => db.from("cid_codes").select("*", { count: "exact", head: true }),
  "SELECT COUNT(*) AS n FROM `cid_codes` t0");

await teste("or do PostgREST",
  () => db.from("patients").select("id").or("cpf.eq.111,full_name.ilike.*ana*"),
  "WHERE (`cpf` = ? OR `full_name` LIKE ?)", ["111", "%ana%"]);

await teste("not",
  () => db.from("queue_entries").select("id").not("status", "eq", "finalizado"),
  "WHERE NOT (t0.`status` = ?)", ["finalizado"]);

await teste("match vira vários eq",
  () => db.from("role_permissions").select("*").match({ role: "admin", module: "fila" }),
  ["t0.`role` = ?", "t0.`module` = ?"]);

console.log("── Embeds (o ponto crítico) ─────────────────────────");

await teste("embed N:1 nível 1",
  () => db.from("billable_events").select("code, patients(full_name)"),
  ["t1.`full_name` AS `patients.full_name`",
   "LEFT JOIN `patients` t1 ON t1.`id` = t0.`patient_id`"]);

await teste("embed N:1 nível 2 (professionals→profiles)",
  () => db.from("billable_events").select("code, professionals(profiles(full_name))"),
  ["LEFT JOIN `professionals` t1 ON t1.`id` = t0.`professional_id`",
   "LEFT JOIN `profiles` t2 ON t2.`id` = t1.`profile_id`",
   "t2.`full_name` AS `professionals.profiles.full_name`"]);

await teste("embed real do faturamento (2 embeds, um aninhado)",
  () => db.from("billable_events").select(
    "id, code, kind, service, amount, status, created_at, patients(full_name), professionals(profiles(full_name))"),
  ["LEFT JOIN `patients` t1 ON t1.`id` = t0.`patient_id`",
   "LEFT JOIN `professionals` t2 ON t2.`id` = t0.`professional_id`",
   "LEFT JOIN `profiles` t3 ON t3.`id` = t2.`profile_id`"]);

await teste("embed real da fila (appointments aninhando professionals→profiles)",
  () => db.from("queue_entries").select(
    "id, status, appointments(starts_at, reason, professionals(profiles(full_name)))"),
  ["LEFT JOIN `appointments` t1 ON t1.`id` = t0.`appointment_id`",
   "LEFT JOIN `professionals` t2 ON t2.`id` = t1.`professional_id`",
   "LEFT JOIN `profiles` t3 ON t3.`id` = t2.`profile_id`",
   "t3.`full_name` AS `appointments.professionals.profiles.full_name`"]);

await teste("!inner vira INNER JOIN",
  () => db.from("dispensation_items").select("prescription_item_id, dispensations!inner(status)"),
  "INNER JOIN `dispensations` t1");

await teste("dica !coluna desambigua FK (profiles!requested_by)",
  () => db.from("product_requests").select("id, profiles!requested_by(full_name)"),
  "LEFT JOIN `profiles` t1 ON t1.`id` = t0.`requested_by`");

await teste("dica !coluna alternativa (profiles!attended_by)",
  () => db.from("product_requests").select("id, profiles!attended_by(full_name)"),
  "LEFT JOIN `profiles` t1 ON t1.`id` = t0.`attended_by`");

// Embed ambíguo SEM dica tem que ser reportado, não escolher uma FK em
// silêncio. Como o supabase-js, o builder devolve o erro em .error (não
// lança), então é isso que conferimos.
espia._reset();
const amb = await db.from("product_requests").select("id, profiles(full_name)");
if (amb.error && /amb[íi]guo/i.test(amb.error.message)) ok++;
else falhas.push({ nome: "embed ambíguo deve reportar erro", erro: `esperava erro de ambiguidade em .error, obteve: ${JSON.stringify(amb.error)}` });

console.log("── Isolamento por clínica (substituto da RLS) ───────");

await teste("cliente com escopo injeta clinic_id",
  () => dbC.from("patients").select("id").eq("active", true),
  ["WHERE t0.`clinic_id` = ?", "t0.`active` = ?"],
  ["CLINICA-1", 1]);

await teste("cliente sem escopo NÃO injeta",
  () => db.from("patients").select("id").eq("active", true),
  "WHERE t0.`active` = ?",
  [1]);

await teste("tabela sem clinic_id não recebe o filtro",
  () => dbC.from("profiles").select("id"),
  "FROM `profiles` t0");

await teste("insert com escopo preenche clinic_id",
  () => dbC.from("cargos").insert({ name: "Recepção", base_role: "recepcao" }),
  ["INSERT INTO `cargos`", "`clinic_id`"]);

console.log("── Escrita ──────────────────────────────────────────");

await teste("insert simples",
  () => db.from("cid_codes").insert({ code: "A00", description: "Cólera" }),
  "INSERT INTO `cid_codes` (`code`, `description`) VALUES (?, ?)",
  ["A00", "Cólera"]);

await teste("insert em lote",
  () => db.from("cid_codes").insert([{ code: "A00" }, { code: "A01" }]),
  "VALUES (?), (?)", ["A00", "A01"]);

await teste("boolean vira 1/0",
  () => db.from("cid_codes").insert({ code: "A00", active: false }),
  "INSERT INTO `cid_codes`", ["A00", 0]);

await teste("json é serializado",
  () => db.from("clinic_settings").update({ branding: { cor: "#fff" } }).eq("clinic_id", "C1"),
  "UPDATE `clinic_settings` SET `branding` = ?",
  ['{"cor":"#fff"}', "C1"]);

await teste("update com filtro",
  () => db.from("queue_entries").update({ status: "finalizado" }).eq("id", "Q1"),
  ["UPDATE `queue_entries` SET `status` = ?", "WHERE t0.`id` = ?".replace("t0.", "")],
  ["finalizado", "Q1"]);

await teste("delete com filtro",
  () => db.from("procedure_executions").delete().eq("id", "P1"),
  "DELETE FROM `procedure_executions` WHERE `id` = ?", ["P1"]);

await teste("upsert usa ON DUPLICATE KEY",
  () => db.from("role_permissions").upsert(
    { clinic_id: "C1", role: "admin", module: "fila", can_view: true },
    { onConflict: "clinic_id,role,module" }),
  ["INSERT INTO `role_permissions`", "ON DUPLICATE KEY UPDATE `can_view` = VALUES(`can_view`)"]);

// UPDATE/DELETE sem filtro têm que ser bloqueados
for (const [nome, fn] of [
  ["update sem filtro é bloqueado", () => db.from("patients").update({ full_name: "x" })],
  ["delete sem filtro é bloqueado", () => db.from("patients").delete()],
]) {
  const r = await fn();
  if (r.error && /sem filtro/i.test(r.error.message)) ok++;
  else falhas.push({ nome, erro: `esperava erro de proteção, obteve ${JSON.stringify(r.error)}` });
}

console.log("── Conversão de valores na volta ────────────────────");

// TINYINT→boolean, JSON string→objeto, DATETIME→ISO com Z.
// Colunas reais de clinic_settings: notify_email (bool), branding (json),
// updated_at (timestamptz).
espia._reset();
espia._responder([[{
  id: "X1", notify_email: 1, branding: '{"cor":"#000"}',
  updated_at: "2026-07-29 13:45:00.000",
}]]);
const r1 = await db.from("clinic_settings")
  .select("id, notify_email, branding, updated_at").maybeSingle();
const d = r1.data ?? {};
const checa = [
  [d.notify_email === true, `notify_email devia ser boolean true, veio ${JSON.stringify(d.notify_email)}`],
  [d.branding && d.branding.cor === "#000", `branding devia ser objeto, veio ${JSON.stringify(d.branding)}`],
  [typeof d.updated_at === "string" && d.updated_at.endsWith("Z"), `updated_at devia terminar em Z, veio ${JSON.stringify(d.updated_at)}`],
];
for (const [passou, msg] of checa) {
  if (passou) ok++; else falhas.push({ nome: "conversão de valores", erro: msg });
}

// Embed N:1 sem match deve virar null, não objeto de nulls
espia._reset();
espia._responder([[{ id: "E1", "patients.full_name": null }]]);
const r2 = await db.from("billable_events").select("id, patients(full_name)").maybeSingle();
if (r2.data && r2.data.patients === null) ok++;
else falhas.push({ nome: "embed sem match deve ser null", erro: `veio ${JSON.stringify(r2.data?.patients)}` });

// Embed N:1 com match deve virar objeto aninhado
espia._reset();
espia._responder([[{ id: "E1", "professionals.profiles.full_name": "Dra. Ana" }]]);
const r3 = await db.from("billable_events").select("id, professionals(profiles(full_name))").maybeSingle();
if (r3.data?.professionals?.profiles?.full_name === "Dra. Ana") ok++;
else falhas.push({ nome: "embed aninhado hidratado", erro: `veio ${JSON.stringify(r3.data)}` });

console.log("── single / maybeSingle ─────────────────────────────");

espia._reset(); espia._responder([[]]);
const vazio = await db.from("patients").select("id").maybeSingle();
if (vazio.data === null && vazio.error === null) ok++;
else falhas.push({ nome: "maybeSingle vazio → data null, sem erro", erro: JSON.stringify(vazio) });

espia._reset(); espia._responder([[]]);
const vazioS = await db.from("patients").select("id").single();
if (vazioS.data === null && vazioS.error) ok++;
else falhas.push({ nome: "single vazio → erro", erro: JSON.stringify(vazioS) });

espia._reset(); espia._responder([[{ id: "A" }, { id: "B" }]]);
const dois = await db.from("patients").select("id").single();
if (dois.error) ok++;
else falhas.push({ nome: "single com 2 linhas → erro", erro: JSON.stringify(dois) });

console.log("── 1:N (embed que vira consulta separada) ───────────");

espia._reset();
// 1ª resposta = linhas base; 2ª = filhas
espia._responder([
  [{ id: "P1" }, { id: "P2" }],
  [{ starts_at: "2026-07-29 10:00:00", patient_id: "P1" },
   { starts_at: "2026-07-29 11:00:00", patient_id: "P1" }],
]);
const r4 = await db.from("patients").select("id, appointments(starts_at)");
const p1 = (r4.data ?? []).find((x) => x.id === "P1");
const p2 = (r4.data ?? []).find((x) => x.id === "P2");
if (Array.isArray(p1?.appointments) && p1.appointments.length === 2
    && Array.isArray(p2?.appointments) && p2.appointments.length === 0) ok++;
else falhas.push({ nome: "embed 1:N agrupa por id", erro: JSON.stringify(r4.data) });

// Recusa recursos não suportados em vez de errar em silêncio
for (const [nome, fn] of [
  ["operador desconhecido em .filter() lança", () => db.from("patients").select("id").filter("cpf", "fts", "x")],
  ["operador desconhecido em .or() lança", () => db.from("patients").select("id").or("cpf.fts.x")],
]) {
  let erro = null;
  try { fn(); } catch (e) { erro = e.message; }
  if (erro && /não suportado/i.test(erro)) ok++;
  else falhas.push({ nome, erro: `esperava erro, obteve ${erro ?? "nenhum"}` });
}

// ── Resultado ───────────────────────────────────────────────────────
rmSync(TMP, { recursive: true, force: true });
console.log(`\n${"═".repeat(60)}`);
console.log(`PASSOU: ${ok}   FALHOU: ${falhas.length}`);
console.log("═".repeat(60));
falhas.forEach((f) => console.log(`  ✗ ${f.nome}\n    ${f.erro}`));
process.exit(falhas.length ? 1 : 0);

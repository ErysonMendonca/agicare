// Introspecção do schema REAL do Supabase vs. o que as migrations esperam.
// Detecta migrations NÃO aplicadas (tabelas/colunas faltando). Read-only.
// Uso: node scripts/schema-check.mjs
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

// carrega .env.local manualmente
const env = {};
for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error("Faltam URL/SERVICE KEY no .env.local"); process.exit(1); }
const sb = createClient(url, key, { auth: { persistSession: false } });

// (tabela -> colunas a validar). Colunas = as adicionadas por ALTER nas migrations
// (as mais sujeitas a "migration não aplicada"). '*' valida só existência da tabela.
const EXPECTED = {
  // 0001
  profiles: ["id", "full_name", "role"],
  professionals: ["id", "specialty", "council_reg", "active", "cep", "address", "address_number", "complement", "neighborhood", "city", "state"], // 0012
  patients: ["id", "convenio", "blood_type", "allergies", "in_treatment", "active", // 0002
             "mother_name", "gender", "manual_record", // 0004
             "cns", "social_name", "naturality", "nationality", "race", "ethnicity", "marital_status", "legal_guardian", "plan", "death_date", "death_cause"], // 0010
  appointments: ["id", "status", "starts_at", "schedule_id"], // 0005
  medical_records: ["id"],
  // 0002
  procedures: ["id", "active", "commercial_desc", "setup_min", "cleanup_min", "sessions", "cost", "commission_pct", "tax_pct"], // +0010
  queue_entries: ["id", "status", "cancel_reason"], // +0003
  stock_products: ["id", "cost", "price", "expiry", "location", "supplier_id"], // +0006
  stock_movements: ["id", "invoice_number", "supplier_id", "total_value"], // +0006
  billable_events: ["id", "status", "amount"],
  lab_cases: ["id", "price_base", "additions", "discounts", "total", "payment_status"], // +0009
  // 0004
  vital_signs: ["id"],
  // 0005
  schedules: ["id"], schedule_blocks: ["id"],
  // 0006
  suppliers: ["id"], dispensations: ["id"], dispensation_items: ["id"],
  purchase_requests: ["id"], quotations: ["id"], inventories: ["id"], inventory_counts: ["id"],
  // 0007
  anamneses: ["id"], prescriptions: ["id"], prescription_items: ["id"], care_orders: ["id"],
  prescription_checks: ["id", "status"], certificates: ["id"], consents: ["id"],
  // 0008
  nursing_notes: ["id"], sae_records: ["id"], care_checks: ["id"], fluid_balance: ["id"],
  fluid_balance_entries: ["id"], nursing_evolutions: ["id"], assessment_scales: ["id"], nursing_procedures: ["id"],
  // 0009
  tiss_batches: ["id"], tiss_guides: ["id"], billing_items: ["id"],
  // 0010
  clinic_settings: ["id"],
};

const missingTables = [], missingCols = [], ok = [];
for (const [table, cols] of Object.entries(EXPECTED)) {
  const { error } = await sb.from(table).select(cols.join(",")).limit(1);
  if (!error) { ok.push(table); continue; }
  const msg = error.message || "";
  if (/does not exist|find the table|schema cache/i.test(msg) && /table|relation/i.test(msg + (error.hint||""))) {
    missingTables.push(`${table}  → ${msg}`);
  } else if (/column/i.test(msg)) {
    // descobre qual coluna falta: testa uma a uma
    const bad = [];
    for (const c of cols) {
      const r = await sb.from(table).select(c).limit(1);
      if (r.error && /column/i.test(r.error.message)) bad.push(c);
    }
    if (bad.length) missingCols.push(`${table}: faltam [${bad.join(", ")}]`);
    else missingTables.push(`${table}  → ${msg}`);
  } else {
    // outro erro (ex.: tabela não exposta) — reporta cru
    missingTables.push(`${table}  → ${msg}`);
  }
}

console.log("\n=== INTROSPECÇÃO DO SCHEMA SUPABASE ===");
console.log(`OK (tabela+colunas existem): ${ok.length}/${Object.keys(EXPECTED).length}`);
if (missingTables.length) { console.log("\n❌ TABELAS FALTANDO / inacessíveis (migration não aplicada?):"); missingTables.forEach(t => console.log("  - " + t)); }
if (missingCols.length) { console.log("\n⚠️  COLUNAS FALTANDO (ALTER não aplicado):"); missingCols.forEach(c => console.log("  - " + c)); }
if (!missingTables.length && !missingCols.length) console.log("\n✅ Tudo aplicado: todas as tabelas e colunas esperadas existem.");
console.log();

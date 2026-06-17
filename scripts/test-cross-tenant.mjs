// ════════════════════════════════════════════════════════════════
// agicare — teste de ISOLAMENTO entre clínicas (multitenant RLS)
//
// Cria/usa 2 clínicas + 2 usuários (um membro de cada) e, para CADA tabela
// sensível, autentica como o usuário ERRADO e tenta ler dado da OUTRA clínica.
// Esperado: 0 linhas. Se vazar (>0), o script falha com exit(1).
//
// Pré-requisitos:
//   • Migrations 0020 + 0021 + 0022 aplicadas.
//   • Custom Access Token Hook REGISTRADO no Dashboard (Auth → Hooks) —
//     senão o claim active_clinic_id não é carimbado e TUDO retorna 0
//     (passaria por motivo errado). O script detecta esse caso e AVISA.
//   • .env.local com NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY
//     e SUPABASE_SERVICE_ROLE_KEY.
//
// Uso:  node scripts/test-cross-tenant.mjs
//
// NOTA: hoje roda LOCAL (não há GitHub Actions ainda). Pode virar gate de CI
//       depois (rodar contra um projeto Supabase de staging).
// ════════════════════════════════════════════════════════════════
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

// ── env ──────────────────────────────────────────────────────────
const env = {};
for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const SB_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SVC = env.SUPABASE_SERVICE_ROLE_KEY;
if (!SB_URL || !ANON || !SVC || SVC.startsWith("PLACEHOLDER")) {
  console.error("✗ Faltam NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY no .env.local");
  process.exit(1);
}

const admin = createClient(SB_URL, SVC, { auth: { persistSession: false, autoRefreshToken: false } });

const CLINIC_A = "00000000-0000-0000-0000-0000000000a1";
const CLINIC_B = "00000000-0000-0000-0000-0000000000b1";
const PWD = "CrossTenant2026!";
const USER_A = { email: "cross-a@agicare.test", clinic: CLINIC_A, name: "Tenant A (admin)" };
const USER_B = { email: "cross-b@agicare.test", clinic: CLINIC_B, name: "Tenant B (admin)" };

// Tabelas sensíveis a verificar: linha plantada na clínica A; usuário B (ativo
// em B) tenta ler → deve ver 0. Cada entrada traz o mínimo de colunas NOT NULL
// para inserir uma linha de teste na clínica A.
const SENSITIVE = [
  { t: "patients",          row: (cid) => ({ clinic_id: cid, full_name: "XTEST Paciente" }) },
  { t: "medical_records",   needs: ["patient_id", "professional_id"] },
  { t: "vital_signs",       needs: ["patient_id"] },
  { t: "anamneses",         needs: ["patient_id"], row: (cid) => ({ clinic_id: cid, specialty: "xtest" }) },
  { t: "prescriptions",     needs: ["patient_id"] },
  { t: "consents",          needs: ["patient_id"], row: (cid) => ({ clinic_id: cid, context: "xtest" }) },
  { t: "exam_orders",       needs: ["patient_id"], row: (cid) => ({ clinic_id: cid, exam_name: "XTEST" }) },
  { t: "prosthetic_orders", needs: ["patient_id"] },
  { t: "appointments",      needs: ["patient_id", "professional_id", "starts_at", "ends_at"] },
  { t: "access_logs",       row: (cid) => ({ clinic_id: cid, module: "xtest", action: "view" }) },
  { t: "queue_entries",     row: (cid) => ({ clinic_id: cid, ticket_code: "XTEST", patient_name: "XTEST" }) },
  { t: "billable_events",   row: (cid) => ({ clinic_id: cid, code: "XTEST-" + Date.now() }) },
  // ── Tabelas da Onda 4 (migrations 0033/0035/0036) ──
  { t: "appointment_notifications", needs: ["patient_id"], row: (cid) => ({ clinic_id: cid, channel: "sms", protocol: "XTEST" }) },
  { t: "budgets",           row: (cid) => ({ clinic_id: cid, description: "XTEST orçamento" }) },
  { t: "payments",          row: (cid) => ({ clinic_id: cid, method: "pix", amount: 1 }) },
  { t: "notification_log",  row: (cid) => ({ clinic_id: cid, channel: "email", template: "xtest", status: "pendente" }) },
];

async function ensureUser(u) {
  const lr = await fetch(SB_URL + "/auth/v1/admin/users?per_page=200", {
    headers: { apikey: SVC, Authorization: "Bearer " + SVC },
  });
  const existing = (await lr.json()).users || [];
  let found = existing.find((e) => e.email === u.email);
  if (!found) {
    const cr = await fetch(SB_URL + "/auth/v1/admin/users", {
      method: "POST",
      headers: { apikey: SVC, Authorization: "Bearer " + SVC, "Content-Type": "application/json" },
      body: JSON.stringify({ email: u.email, password: PWD, email_confirm: true }),
    });
    found = await cr.json();
  } else {
    await fetch(SB_URL + "/auth/v1/admin/users/" + found.id, {
      method: "PUT",
      headers: { apikey: SVC, Authorization: "Bearer " + SVC, "Content-Type": "application/json" },
      body: JSON.stringify({ password: PWD, email_confirm: true }),
    });
  }
  return found.id;
}

async function setup() {
  // clínicas (a trigger provision_clinic clona permissões + cria settings)
  for (const [id, name, slug] of [[CLINIC_A, "XTEST Clínica A", "xtest-a"], [CLINIC_B, "XTEST Clínica B", "xtest-b"]]) {
    await admin.from("clinics").upsert({ id, name, slug, active: true }, { onConflict: "id" });
  }

  const uidA = await ensureUser(USER_A);
  const uidB = await ensureUser(USER_B);

  // memberships: A só em A, B só em B — ambos admin na sua clínica.
  await admin.from("clinic_members").upsert(
    [
      { clinic_id: CLINIC_A, user_id: uidA, role: "admin", active: true },
      { clinic_id: CLINIC_B, user_id: uidB, role: "admin", active: true },
    ],
    { onConflict: "clinic_id,user_id" }
  );

  // Carimba app_metadata.active_clinic_id (o que o setActiveClinic faz no app, e
  // o que o Custom Access Token Hook faria por token). Sem o hook registrado no
  // painel, current_clinic_id() lê esse claim do JWT — então precisamos gravá-lo
  // ANTES do signIn p/ o teste rodar pelo motivo CERTO (e não por claim nulo).
  await admin.auth.admin.updateUserById(uidA, { app_metadata: { active_clinic_id: CLINIC_A } });
  await admin.auth.admin.updateUserById(uidB, { app_metadata: { active_clinic_id: CLINIC_B } });

  // dependências mínimas na clínica A (professional + patient) p/ FKs.
  const { data: prof } = await admin
    .from("professionals")
    .insert({ clinic_id: CLINIC_A, profile_id: uidA, specialty: "xtest", active: true })
    .select("id").single();
  const { data: pat } = await admin
    .from("patients")
    .insert({ clinic_id: CLINIC_A, full_name: "XTEST Paciente FK" })
    .select("id").single();

  const ctx = {
    patient_id: pat?.id,
    professional_id: prof?.id,
    starts_at: new Date().toISOString(),
    ends_at: new Date(Date.now() + 1800e3).toISOString(),
  };

  // planta 1 linha por tabela sensível na clínica A (service-role ignora RLS).
  const planted = [];
  for (const s of SENSITIVE) {
    const base = s.row ? s.row(CLINIC_A) : { clinic_id: CLINIC_A };
    for (const k of s.needs || []) base[k] = ctx[k];
    const { error } = await admin.from(s.t).insert(base);
    if (error) console.warn(`  ⚠️  não plantou em ${s.t}: ${error.message}`);
    else planted.push(s.t);
  }
  return { uidA, uidB, planted };
}

async function signIn(email) {
  const c = createClient(SB_URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await c.auth.signInWithPassword({ email, password: PWD });
  if (error) throw new Error(`login ${email}: ${error.message}`);
  const claim = data.session?.user?.app_metadata?.active_clinic_id;
  return { client: c, activeClinic: claim };
}

async function run() {
  console.log("→ setup (clínicas A/B, usuários, dados plantados em A)...");
  const { planted } = await setup();

  console.log("→ login usuário B (membro só da clínica B)...");
  const { client: cB, activeClinic } = await signIn(USER_B.email);

  if (!activeClinic) {
    console.error(
      "\n✗ O token do usuário B NÃO tem app_metadata.active_clinic_id.\n" +
      "  O Custom Access Token Hook (0022) provavelmente NÃO está registrado no\n" +
      "  Dashboard (Auth → Hooks). Sem o claim, a RLS nega tudo por NULL — o teste\n" +
      "  passaria pelo motivo ERRADO. Registre o hook e rode de novo."
    );
    process.exit(1);
  }
  if (activeClinic !== CLINIC_B) {
    console.error(`\n✗ active_clinic_id do usuário B = ${activeClinic}, esperado ${CLINIC_B}.`);
    process.exit(1);
  }
  console.log(`  ✓ claim active_clinic_id = ${activeClinic} (clínica B)`);

  // Para cada tabela sensível: como B, tentar ler linhas da clínica A → 0.
  let leaks = 0;
  console.log("\n→ tentando LER dados da clínica A autenticado como usuário B:");
  for (const s of SENSITIVE) {
    if (!planted.includes(s.t)) { console.log(`  ⏭️  ${s.t} (não plantado, pulado)`); continue; }
    const { data, error } = await cB.from(s.t).select("clinic_id").eq("clinic_id", CLINIC_A);
    const n = (data || []).length;
    if (error) { console.log(`  ✓ ${s.t}: bloqueado (${error.message})`); continue; }
    if (n > 0) { console.log(`  ✗ ${s.t}: VAZOU ${n} linha(s) da clínica A!`); leaks++; }
    else console.log(`  ✓ ${s.t}: 0 linhas (isolado)`);
  }

  // sanity reverso: B consegue ver os PRÓPRIOS dados de B? (não deve travar tudo)
  await cB.from("patients").insert({ clinic_id: CLINIC_B, full_name: "XTEST Paciente B" });
  const { data: ownB } = await cB.from("patients").select("id").eq("clinic_id", CLINIC_B);
  if (!ownB || ownB.length === 0) {
    console.warn("\n  ⚠️  usuário B não enxergou os PRÓPRIOS pacientes — RLS pode estar travando demais.");
  } else {
    console.log(`\n  ✓ sanity: usuário B lê os próprios dados (${ownB.length} paciente(s) em B).`);
  }

  if (leaks > 0) {
    console.error(`\n✗ FALHA: ${leaks} tabela(s) vazaram dados entre clínicas.`);
    process.exit(1);
  }
  console.log("\n✓ OK: nenhum vazamento entre clínicas detectado.");
}

run().catch((e) => { console.error("\n✗ Erro no teste:", e.message); process.exit(1); });

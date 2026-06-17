// agicare — seed completa do Supabase.
// Uso: npm run seed
// Cria usuários demo (por papel) + popula todas as tabelas com dados PT-BR realistas.
// Idempotente: limpa as tabelas de domínio e repovoa.
import { readFileSync } from "node:fs";

// ── env ──────────────────────────────────────────────────────────
readFileSync(".env.local", "utf8").split(/\r?\n/).forEach((l) => {
  const m = l.match(/^([^=#]+)=(.*)$/);
  if (m) process.env[m[1].trim()] = m[2].trim();
});
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SVC = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !SVC || SVC.startsWith("PLACEHOLDER")) {
  console.error("✗ Configure NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env.local");
  process.exit(1);
}
const H = { apikey: SVC, Authorization: "Bearer " + SVC, "Content-Type": "application/json" };
const ZERO = "00000000-0000-0000-0000-000000000000";
// Clínica default (mesma da migration 0020). Todo dado do seed é desta clínica.
const DEFAULT_CLINIC_ID = "00000000-0000-0000-0000-000000000001";
const DEMO_PASSWORD = "Agicare2026!";

const rest = async (path, opts = {}) => {
  const r = await fetch(URL + "/rest/v1/" + path, { ...opts, headers: { ...H, ...(opts.headers || {}) } });
  const txt = await r.text();
  if (!r.ok) throw new Error(`REST ${path} → ${r.status}: ${txt.slice(0, 200)}`);
  return txt ? JSON.parse(txt) : null;
};
// Tabelas de domínio cujo insert NÃO carimba clinic_id automaticamente
// (não têm a coluna): nenhuma hoje — todas as de domínio recebem clinic_id.
// `insert` carimba clinic_id = DEFAULT_CLINIC_ID em cada linha (multitenant).
const insert = (table, rows) => {
  const stamped = (Array.isArray(rows) ? rows : [rows]).map((r) => ({
    clinic_id: DEFAULT_CLINIC_ID,
    ...r,
  }));
  return rest(table, {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(stamped),
  });
};
const wipe = (table) => rest(`${table}?id=neq.${ZERO}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });

// ── multitenant: garante a clínica default + memberships ─────────
async function ensureDefaultClinic() {
  // Idempotente (on conflict do nothing via Prefer resolution=merge-duplicates).
  await rest("clinics", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify([
      { id: DEFAULT_CLINIC_ID, name: "Clínica Padrão", slug: "clinica-padrao", active: true },
    ]),
  });
}

async function ensureMemberships(users) {
  // Cada usuário demo vira membro ATIVO da clínica default com o seu papel.
  // Idempotente: upsert na PK (clinic_id, user_id).
  const rows = users.map((u) => ({
    clinic_id: DEFAULT_CLINIC_ID,
    user_id: u.id,
    role: u.role,
    active: true,
  }));
  await rest("clinic_members", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(rows),
  });
}

// ── usuários demo (admin API) ────────────────────────────────────
const DEMO_USERS = [
  { email: "admin@agicare.test",   role: "admin",    full_name: "Admin AGIcare" },
  { email: "medico@agicare.test",  role: "medico",   full_name: "Dra. Marina Souza" },
  { email: "medico2@agicare.test", role: "medico",   full_name: "Dr. Carlos Eduardo" },
  { email: "recepcao@agicare.test",role: "recepcao", full_name: "Ana (Recepção)" },
];

async function ensureUsers() {
  // lista existentes
  const lr = await fetch(URL + "/auth/v1/admin/users?per_page=200", { headers: H });
  const existing = (await lr.json()).users || [];
  const out = [];
  for (const u of DEMO_USERS) {
    let found = existing.find((e) => e.email === u.email);
    if (found) {
      // garante senha conhecida + carimba a clínica ativa no app_metadata
      // (o Custom Access Token Hook valida a membership e usa este claim).
      await fetch(URL + "/auth/v1/admin/users/" + found.id, {
        method: "PUT", headers: H,
        body: JSON.stringify({
          password: DEMO_PASSWORD,
          email_confirm: true,
          app_metadata: { active_clinic_id: DEFAULT_CLINIC_ID },
        }),
      });
    } else {
      const cr = await fetch(URL + "/auth/v1/admin/users", {
        method: "POST", headers: H,
        body: JSON.stringify({
          email: u.email, password: DEMO_PASSWORD, email_confirm: true,
          user_metadata: { full_name: u.full_name },
          app_metadata: { active_clinic_id: DEFAULT_CLINIC_ID },
        }),
      });
      found = await cr.json();
    }
    // papel + nome no profile (trigger já criou o profile)
    await rest("profiles?id=eq." + found.id, {
      method: "PATCH", headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ role: u.role, full_name: u.full_name }),
    });
    out.push({ ...u, id: found.id });
  }
  return out;
}

// ── helpers de data ──────────────────────────────────────────────
const now = new Date();
const at = (dayOffset, h, m = 0) => {
  const d = new Date(now);
  d.setDate(d.getDate() + dayOffset);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
};
const isoDate = (dayOffset) => {
  const d = new Date(now);
  d.setDate(d.getDate() + dayOffset);
  return d.toISOString().slice(0, 10);
};

async function run() {
  console.log("→ clínica default...");
  await ensureDefaultClinic();

  console.log("→ usuários demo...");
  const users = await ensureUsers();
  const medicos = users.filter((u) => u.role === "medico");

  console.log("→ memberships (clinic_members)...");
  await ensureMemberships(users);

  console.log("→ limpando tabelas de domínio...");
  for (const t of ["stock_movements", "queue_entries", "appointments", "medical_records",
    "billable_events", "lab_cases", "patients", "procedures", "stock_products", "professionals"]) {
    await wipe(t);
  }

  console.log("→ profissionais...");
  const profs = await insert("professionals", [
    { profile_id: medicos[0].id, specialty: "Cardiologia", council_reg: "CRM 123.456-SP", bio: "Cardiologista", active: true },
    { profile_id: medicos[1].id, specialty: "Ortopedia", council_reg: "CRM 234.567-SP", bio: "Ortopedista", active: true },
  ]);

  console.log("→ pacientes...");
  const patients = await insert("patients", [
    { full_name: "João Pedro Oliveira", cpf: "111.222.333-44", phone: "(11) 91234-5678", email: "joao.oliveira@email.com", convenio: "Unimed", blood_type: "O+", allergies: true, in_treatment: true, birth_date: "1985-03-12" },
    { full_name: "Maria Clara Santos", cpf: "222.333.444-55", phone: "(11) 92345-6789", email: "maria.santos@email.com", convenio: "Particular", blood_type: "A+", allergies: false, in_treatment: false, birth_date: "1990-07-22" },
    { full_name: "Pedro Henrique Lima", cpf: "333.444.555-66", phone: "(11) 93456-7890", email: "pedro.lima@email.com", convenio: "Amil", blood_type: "B+", allergies: true, in_treatment: true, birth_date: "1978-11-05" },
    { full_name: "Ana Paula Costa", cpf: "444.555.666-77", phone: "(11) 94567-8901", email: "ana.costa@email.com", convenio: "Bradesco Saúde", blood_type: "AB+", allergies: false, in_treatment: true, birth_date: "1995-01-30" },
    { full_name: "Roberto Carlos Lima", cpf: "555.666.777-88", phone: "(11) 95678-9012", email: "roberto.lima@email.com", convenio: "Unimed", blood_type: "O-", allergies: false, in_treatment: false, birth_date: "1969-09-18" },
    { full_name: "Juliana Ferreira", cpf: "666.777.888-99", phone: "(11) 96789-0123", email: "juliana.f@email.com", convenio: "SulAmérica", blood_type: "A-", allergies: true, in_treatment: false, birth_date: "1988-05-14" },
    { full_name: "Marcos Vinícius Alves", cpf: "777.888.999-00", phone: "(11) 97890-1234", email: "marcos.alves@email.com", convenio: "Particular", blood_type: "B-", allergies: false, in_treatment: true, birth_date: "2000-12-02" },
    { full_name: "Beatriz Almeida", cpf: "888.999.000-11", phone: "(11) 98901-2345", email: "bia.almeida@email.com", convenio: "Amil", blood_type: "O+", allergies: false, in_treatment: false, birth_date: "1992-04-09" },
    { full_name: "Fernando Souza Rocha", cpf: "999.000.111-22", phone: "(11) 99012-3456", email: "fernando.rocha@email.com", convenio: "Unimed", blood_type: "AB-", allergies: true, in_treatment: true, birth_date: "1975-08-27" },
    { full_name: "Camila Nogueira", cpf: "000.111.222-33", phone: "(11) 90123-4567", email: "camila.n@email.com", convenio: "Bradesco Saúde", blood_type: "A+", allergies: false, in_treatment: false, birth_date: "1998-02-16" },
  ]);

  console.log("→ procedimentos...");
  await insert("procedures", [
    { code: "PROC001", name: "Limpeza de Pele Profunda", description: "Limpeza facial completa", category: "Facial", duration_min: 85, price: 250, margin_pct: 32, active: true },
    { code: "PROC002", name: "Toxina Botulínica", description: "Aplicação de botox", category: "Injetáveis", duration_min: 55, price: 1200, margin_pct: 28, active: true },
    { code: "PROC003", name: "Drenagem Linfática", description: "Massagem corporal", category: "Corporal", duration_min: 60, price: 180, margin_pct: 38, active: true },
    { code: "PROC004", name: "Eletrocardiograma", description: "ECG de repouso", category: "Cardiologia", duration_min: 30, price: 150, margin_pct: 45, active: true },
    { code: "PROC005", name: "Infiltração Articular", description: "Procedimento ortopédico", category: "Ortopedia", duration_min: 40, price: 600, margin_pct: 35, active: true },
    { code: "PROC006", name: "Consulta de Retorno", description: "Reavaliação", category: "Consulta", duration_min: 30, price: 120, margin_pct: 50, active: true },
  ]);

  console.log("→ estoque...");
  const stock = await insert("stock_products", [
    { code: "MED001", name: "Dipirona 500mg", category: "Medicamento", unit: "cx", quantity: 8, min_quantity: 20, lot: "L2401", active: true },
    { code: "MED002", name: "Soro Fisiológico 0,9% 500ml", category: "Medicamento", unit: "un", quantity: 45, min_quantity: 30, lot: "L2402", active: true },
    { code: "MAT001", name: "Luva Cirúrgica M", category: "Material", unit: "cx", quantity: 5, min_quantity: 15, lot: "L2403", active: true },
    { code: "MAT002", name: "Seringa 5ml", category: "Material", unit: "cx", quantity: 60, min_quantity: 25, lot: "L2404", active: true },
    { code: "MED003", name: "Anestésico Lidocaína", category: "Medicamento", unit: "fr", quantity: 3, min_quantity: 10, lot: "L2405", active: true },
    { code: "MAT003", name: "Gaze Estéril", category: "Material", unit: "pct", quantity: 120, min_quantity: 40, lot: "L2406", active: true },
    { code: "MAT004", name: "Álcool 70% 1L", category: "Material", unit: "un", quantity: 12, min_quantity: 10, lot: "L2407", active: true },
    { code: "MED004", name: "Toxina Botulínica 100U", category: "Medicamento", unit: "fr", quantity: 2, min_quantity: 8, lot: "L2408", active: true },
  ]);
  await insert("stock_movements", [
    { product_id: stock[0].id, type: "saida", quantity: 4, reason: "Dispensação prescrição" },
    { product_id: stock[1].id, type: "entrada", quantity: 50, reason: "Compra fornecedor" },
    { product_id: stock[2].id, type: "saida", quantity: 10, reason: "Uso em procedimento" },
  ]);

  console.log("→ fila de atendimento...");
  await insert("queue_entries", [
    { ticket_code: "A001", patient_id: patients[0].id, patient_name: patients[0].full_name, priority: "normal", professional_id: profs[0].id, specialty: "Cardiologia", insurance: "Unimed", status: "aguardando" },
    { ticket_code: "A002", patient_id: patients[2].id, patient_name: patients[2].full_name, priority: "urgente", professional_id: profs[0].id, specialty: "Cardiologia", insurance: "Amil", status: "aguardando" },
    { ticket_code: "P001", patient_id: patients[3].id, patient_name: patients[3].full_name, priority: "preferencial", professional_id: profs[0].id, specialty: "Cardiologia", insurance: "Bradesco Saúde", status: "aguardando" },
    { ticket_code: "A003", patient_id: patients[4].id, patient_name: patients[4].full_name, priority: "normal", professional_id: profs[1].id, specialty: "Ortopedia", insurance: "Unimed", status: "chamado" },
    { ticket_code: "A004", patient_id: patients[5].id, patient_name: patients[5].full_name, priority: "normal", professional_id: profs[1].id, specialty: "Ortopedia", insurance: "SulAmérica", status: "em_atendimento" },
  ]);

  console.log("→ agendamentos...");
  await insert("appointments", [
    { patient_id: patients[0].id, professional_id: profs[0].id, starts_at: at(0, 8), ends_at: at(0, 8, 30), status: "confirmado", reason: "Consulta cardiológica" },
    { patient_id: patients[1].id, professional_id: profs[0].id, starts_at: at(0, 9), ends_at: at(0, 9, 30), status: "agendado", reason: "Retorno" },
    { patient_id: patients[3].id, professional_id: profs[1].id, starts_at: at(0, 10), ends_at: at(0, 10, 40), status: "em_atendimento", reason: "Avaliação ortopédica" },
    { patient_id: patients[5].id, professional_id: profs[1].id, starts_at: at(1, 14), ends_at: at(1, 14, 30), status: "agendado", reason: "Infiltração" },
    { patient_id: patients[7].id, professional_id: profs[0].id, starts_at: at(2, 11), ends_at: at(2, 11, 30), status: "agendado", reason: "Primeira consulta" },
    { patient_id: patients[8].id, professional_id: profs[0].id, starts_at: at(-1, 15), ends_at: at(-1, 15, 30), status: "concluido", reason: "ECG" },
  ]);

  console.log("→ faturamento...");
  await insert("billable_events", [
    { code: "EVT-2024-001", patient_id: patients[1].id, professional_id: profs[0].id, kind: "convenio", service: "Consulta + Exames", amount: 350, status: "pendente" },
    { code: "EVT-2024-002", patient_id: patients[6].id, professional_id: profs[1].id, kind: "particular", service: "Procedimento Cirúrgico", amount: 1200, status: "pendente" },
    { code: "EVT-2024-003", patient_id: patients[3].id, professional_id: profs[0].id, kind: "convenio", service: "Consulta de Retorno", amount: 280, status: "faturado" },
    { code: "EVT-2024-004", patient_id: patients[8].id, professional_id: profs[1].id, kind: "convenio", service: "Infiltração Articular", amount: 600, status: "glosado" },
  ]);

  console.log("→ laboratório...");
  await insert("lab_cases", [
    { code: "LAB-001", patient_id: patients[0].id, type: "Prótese unitária", status: "em_andamento", urgent: false, due_date: isoDate(3) },
    { code: "LAB-002", patient_id: patients[2].id, type: "Coroa de porcelana", status: "pendente", urgent: true, due_date: isoDate(1) },
    { code: "LAB-003", patient_id: patients[5].id, type: "Placa de mordida", status: "finalizado", urgent: false, due_date: isoDate(-2) },
  ]);

  console.log("\n✓ Seed concluída.");
  console.log("  Logins demo (senha: " + DEMO_PASSWORD + "):");
  users.forEach((u) => console.log(`   - ${u.email}  (${u.role})`));
}

run().catch((e) => { console.error("\n✗ Erro na seed:", e.message); process.exit(1); });

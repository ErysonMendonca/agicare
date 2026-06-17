// agicare — migração ONE-OFF de objetos do bucket 'protetico' para o layout
// multitenant exigido pela policy da 0021:
//
//   ANTES:  <patient_id>/<order_id>/<arquivo>
//   DEPOIS: <clinic_id>/<patient_id>/<order_id>/<arquivo>
//
// A policy 0021 (protetico_staff_all) exige que a 1ª pasta do path seja a
// clínica ativa: (storage.foldername(name))[1] = current_clinic_id(). Arquivos
// no layout antigo ficam INVISÍVEIS até serem movidos.
//
// Como rodar (UMA vez, manualmente, DEPOIS de aplicar a 0020 e 0021):
//   node scripts/migrate-protetico-paths.mjs
//   node scripts/migrate-protetico-paths.mjs --dry   (só lista, não move)
//
// Service-role (ignora RLS). Idempotente: pula o que já está no layout novo.
// Descobre a clínica de cada arquivo via prosthetic_files → prosthetic_orders.clinic_id
// (fallback: patients.clinic_id). Loga tudo o que move.
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
const DRY = process.argv.includes("--dry");
const BUCKET = "protetico";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const H = { apikey: SVC, Authorization: "Bearer " + SVC, "Content-Type": "application/json" };

const rest = async (path, opts = {}) => {
  const r = await fetch(URL + "/rest/v1/" + path, { ...opts, headers: { ...H, ...(opts.headers || {}) } });
  const txt = await r.text();
  if (!r.ok) throw new Error(`REST ${path} → ${r.status}: ${txt.slice(0, 200)}`);
  return txt ? JSON.parse(txt) : null;
};

// Storage API: listar e mover objetos.
const storage = async (path, opts = {}) => {
  const r = await fetch(URL + "/storage/v1/" + path, { ...opts, headers: { ...H, ...(opts.headers || {}) } });
  const txt = await r.text();
  if (!r.ok) throw new Error(`STORAGE ${path} → ${r.status}: ${txt.slice(0, 200)}`);
  return txt ? JSON.parse(txt) : null;
};

// Lista recursivamente os objetos do bucket sob um prefixo.
async function listAll(prefix = "") {
  const out = [];
  const stack = [prefix];
  while (stack.length) {
    const dir = stack.pop();
    let offset = 0;
    // paginação da list API
    for (;;) {
      const items = await storage(`object/list/${BUCKET}`, {
        method: "POST",
        body: JSON.stringify({ prefix: dir, limit: 100, offset, sortBy: { column: "name", order: "asc" } }),
      });
      if (!items || items.length === 0) break;
      for (const it of items) {
        const full = dir ? `${dir}/${it.name}` : it.name;
        // Heurística: itens "pasta" não têm metadata/id; descemos neles.
        if (it.id === null || it.metadata === null) stack.push(full);
        else out.push(full);
      }
      if (items.length < 100) break;
      offset += 100;
    }
  }
  return out;
}

// Resolve a clínica de um arquivo pelo seu storage_path antigo.
// Estratégia: a linha em prosthetic_files tem storage_path == path antigo e
// order_id → prosthetic_orders.clinic_id. Fallback: patient (2º segmento? não —
// no layout antigo é <patient_id>/<order_id>/...). Usamos order → clinic.
const orderClinicCache = new Map();
async function clinicForPath(oldPath) {
  // 1) Via prosthetic_files (fonte canônica do registro).
  const rows = await rest(
    `prosthetic_files?storage_path=eq.${encodeURIComponent(oldPath)}&select=order_id,clinic_id`,
  );
  if (rows && rows.length) {
    if (rows[0].clinic_id) return rows[0].clinic_id;
    const orderId = rows[0].order_id;
    if (orderId) return clinicForOrder(orderId);
  }
  // 2) Fallback: deduz order_id do path antigo (<patient>/<order>/<arquivo>).
  const segs = oldPath.split("/");
  if (segs.length >= 2 && UUID_RE.test(segs[1])) return clinicForOrder(segs[1]);
  return null;
}

async function clinicForOrder(orderId) {
  if (orderClinicCache.has(orderId)) return orderClinicCache.get(orderId);
  const rows = await rest(`prosthetic_orders?id=eq.${orderId}&select=clinic_id`);
  const clinic = rows && rows.length ? rows[0].clinic_id : null;
  orderClinicCache.set(orderId, clinic);
  return clinic;
}

async function run() {
  console.log(`→ listando objetos do bucket '${BUCKET}'${DRY ? " (DRY-RUN)" : ""}...`);
  const objects = await listAll("");
  console.log(`  ${objects.length} objeto(s) encontrado(s).`);

  let moved = 0, skipped = 0, failed = 0;

  for (const oldPath of objects) {
    const firstSeg = oldPath.split("/")[0];

    // Idempotência: já está no layout novo (1ª pasta é um UUID de clínica)?
    if (UUID_RE.test(firstSeg)) {
      // Pode ser um clinic_id (novo) OU um patient_id (antigo). Distinguimos:
      // se existir prosthetic_files apontando para este path, é o registro;
      // se a clínica resolvida == firstSeg, já está migrado.
      const clinic = await clinicForPath(oldPath);
      if (clinic && clinic === firstSeg) { skipped++; continue; }
      // 1ª pasta é UUID mas NÃO é a clínica → é o patient_id antigo; migra.
      if (!clinic) {
        console.warn(`  ⚠ sem clínica resolvível, pulando: ${oldPath}`);
        skipped++;
        continue;
      }
      const newPath = `${clinic}/${oldPath}`;
      await moveOne(oldPath, newPath, () => { moved++; }, () => { failed++; });
      continue;
    }

    // 1ª pasta não-UUID → migra para <clinic>/<oldPath>.
    const clinic = await clinicForPath(oldPath);
    if (!clinic) {
      console.warn(`  ⚠ sem clínica resolvível, pulando: ${oldPath}`);
      skipped++;
      continue;
    }
    const newPath = `${clinic}/${oldPath}`;
    await moveOne(oldPath, newPath, () => { moved++; }, () => { failed++; });
  }

  console.log(`\n✓ Concluído. movidos=${moved} pulados=${skipped} falhas=${failed}`);
  if (DRY) console.log("  (DRY-RUN: nada foi movido de fato.)");
}

async function moveOne(oldPath, newPath, onOk, onErr) {
  console.log(`  ${DRY ? "[dry] " : ""}mover: ${oldPath}  →  ${newPath}`);
  if (DRY) { onOk(); return; }
  try {
    await storage("object/move", {
      method: "POST",
      body: JSON.stringify({ bucketId: BUCKET, sourceKey: oldPath, destinationKey: newPath }),
    });
    // Atualiza o registro de metadados para o novo path.
    await rest(`prosthetic_files?storage_path=eq.${encodeURIComponent(oldPath)}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ storage_path: newPath }),
    });
    onOk();
  } catch (e) {
    console.error(`  ✗ falha ao mover ${oldPath}: ${e.message}`);
    onErr();
  }
}

run().catch((e) => { console.error("\n✗ Erro na migração:", e.message); process.exit(1); });

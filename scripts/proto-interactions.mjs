import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const OUT = 'docs/figma-shots/proto/int';
mkdirSync(OUT, { recursive: true });
const URL = 'https://afar-patron-55557012.figma.site/';
const slug = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 32);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

async function login() {
  await page.goto(URL, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(2500);
  const inputs = page.locator('input');
  await inputs.nth(0).fill('João');
  await inputs.nth(1).fill('123456');
  await page.getByRole('combobox').click();
  await page.waitForTimeout(600);
  const opt = page.getByRole('option').first();
  if (await opt.count()) await opt.click(); else { await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter'); }
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: /^entrar$/i }).click();
  await page.waitForTimeout(3500);
}

async function gotoScreen(label) {
  const btn = page.locator('aside button, nav button').filter({ hasText: new RegExp('^' + label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) }).first();
  await btn.click();
  await page.waitForTimeout(1500);
}

// returns distinct actionable labels in the main content area
async function contentButtons() {
  return await page.evaluate(() => {
    const seen = new Set(); const out = [];
    document.querySelectorAll('main button, [role=main] button, button').forEach((e) => {
      const r = e.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return;
      if (r.x < 256) return; // skip sidebar
      const t = (e.textContent || '').trim();
      const key = t || ('@' + Math.round(r.x) + ',' + Math.round(r.y));
      if (seen.has(key)) return; seen.add(key);
      out.push({ text: t, x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), top: Math.round(r.y) });
    });
    return out;
  });
}

const ACTION = /novo|nova|adicionar|cadastr|\+|editar|exclu|filtr|exportar|agendar|escala|detalhe|financeiro|iniciar|chamar|conferir|faturar|aplicar|separa|geral|integ|notific|seguran|aparên|backup|marca|conv[eê]nio|tiss|check|entrada|invent|compras|dispens/i;

async function snap(name) {
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${OUT}/${name}.png` });
}
async function closeOverlay() {
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
}

await login();
console.log('logged in');

// Topbar overlays (bell + user menu) — captured once from dashboard
await gotoScreen('Dashboard');
try {
  const bell = page.locator('header button, [class*=top] button').first();
  await page.mouse.click(1204, 36); await snap('topbar_bell'); await closeOverlay();
} catch (e) { console.log('bell fail', e.message.split('\n')[0]); }

const SCREENS = ['Dashboard','Fila de Atendimento','Pacientes','Agenda','Prontuário','Procedimentos','Laboratório','Profissionais','Estoque','Faturamento','Relatórios','Configurações'];

for (const screen of SCREENS) {
  try {
    await gotoScreen(screen);
    const btns = (await contentButtons()).filter(b => b.text && ACTION.test(b.text));
    // dedupe by slug, cap 10
    const seen = new Set(); const picks = [];
    for (const b of btns) { const s = slug(b.text); if (!s || seen.has(s)) continue; seen.add(s); picks.push(b); if (picks.length >= 10) break; }
    console.log(screen, '->', picks.map(p => p.text).join(' | '));
    for (const b of picks) {
      try {
        await gotoScreen(screen); // reset state
        const loc = page.locator('button', { hasText: b.text }).first();
        await loc.scrollIntoViewIfNeeded();
        await loc.click({ timeout: 4000 });
        await snap('int_' + slug(screen) + '__' + slug(b.text));
        await closeOverlay();
      } catch (e) { console.log('  btn fail', screen, b.text, e.message.split('\n')[0]); }
    }
  } catch (e) { console.log('screen fail', screen, e.message.split('\n')[0]); }
}
await browser.close();
console.log('DONE interactions');

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
  await inputs.nth(0).fill('João'); await inputs.nth(1).fill('123456');
  await page.getByRole('combobox').click(); await page.waitForTimeout(600);
  const opt = page.getByRole('option').first();
  if (await opt.count()) await opt.click(); else { await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter'); }
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: /^entrar$/i }).click();
  await page.waitForTimeout(3500);
}
async function gotoScreen(label) {
  const btn = page.locator('aside button, nav button').filter({ hasText: new RegExp('^' + label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) }).first();
  await btn.click({ timeout: 6000 }); await page.waitForTimeout(1400);
}
async function snap(name) { await page.waitForTimeout(900); await page.screenshot({ path: `${OUT}/${name}.png` }); }
async function hardClose() {
  for (let k = 0; k < 2; k++) {
    await page.keyboard.press('Escape'); await page.waitForTimeout(300);
    const x = page.locator('button').filter({ hasText: /^(cancelar|fechar|voltar)$/i }).first();
    if (await x.count().catch(() => 0)) { try { await x.click({ timeout: 1500 }); } catch {} }
    // click a safe backdrop corner
    try { await page.mouse.click(8, 460); } catch {}
    await page.waitForTimeout(300);
  }
}

await login();
console.log('logged in');

// 1) Topbar user menu (bottom-left user button in sidebar)
try { await gotoScreen('Dashboard'); await page.mouse.click(120, 828); await snap('sidebar_user_menu'); await hardClose(); } catch (e) { console.log('user menu fail', e.message.split('\n')[0]); }

// 2) Remaining modals/dropdowns
const TASKS = [
  ['Pacientes', /^exportar$/i, 'pacientes__exportar'],
  ['Agenda', /novo agendamento/i, 'agenda__novo_agendamento'],
  ['Laboratório', /novo caso/i, 'laboratorio__novo_caso'],
  ['Profissionais', /novo profissional/i, 'profissionais__novo_profissional'],
  ['Fila de Atendimento', /chamar|atender|iniciar/i, 'fila__chamar'],
];
for (const [screen, re, name] of TASKS) {
  try {
    await gotoScreen(screen);
    const loc = page.locator('button').filter({ hasText: re }).first();
    if (await loc.count().catch(() => 0)) { await loc.scrollIntoViewIfNeeded({ timeout: 4000 }); await loc.click({ timeout: 4000 }); await snap('int_' + name); await hardClose(); }
    else console.log('no btn', screen, re);
  } catch (e) { console.log('task fail', name, e.message.split('\n')[0]); await hardClose(); }
}

// 3) Tab screens — click each tab and snapshot
const TABS = {
  'Estoque': ['Dispensação','Separação','Entrada','Inventário','Relatórios','Compras','Cadastro'],
  'Faturamento': ['Eventos','Check-out','Convênios','TISS'],
  'Configurações': ['Geral','Integrações','Notificações','Segurança','Aparência','Backup','Marca'],
};
for (const [screen, tabs] of Object.entries(TABS)) {
  for (const tab of tabs) {
    try {
      await gotoScreen(screen);
      const loc = page.locator('button', { hasText: new RegExp('^' + tab, 'i') }).filter({ hasNotText: /salvar/i }).first();
      if (await loc.count().catch(() => 0)) { await loc.click({ timeout: 4000 }); await snap('tab_' + slug(screen) + '__' + slug(tab)); }
      else console.log('no tab', screen, tab);
    } catch (e) { console.log('tab fail', screen, tab, e.message.split('\n')[0]); }
  }
}
await browser.close();
console.log('DONE');

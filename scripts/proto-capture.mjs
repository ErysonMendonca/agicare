import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const OUT = 'docs/figma-shots/proto';
mkdirSync(OUT, { recursive: true });
const URL = 'https://afar-patron-55557012.figma.site/';
const slug = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

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
  if (await opt.count()) await opt.click();
  else { await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter'); }
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: /^entrar$/i }).click();
  await page.waitForTimeout(3500);
}

const NAV = ['Dashboard','Fila de Atendimento','Pacientes','Agenda','Prontuário','Procedimentos','Laboratório','Profissionais','Estoque','Faturamento','Relatórios','Configurações'];

await login();
console.log('Logged in:', page.url());

let i = 0;
for (const item of NAV) {
  i++;
  try {
    // click the sidebar button whose text starts with the item label
    const btn = page.locator('aside button, nav button').filter({ hasText: new RegExp('^' + item.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) }).first();
    const target = (await btn.count()) ? btn : page.getByRole('button', { name: new RegExp(item, 'i') }).first();
    await target.click();
    await page.waitForTimeout(1800);
    const name = String(i).padStart(2, '0') + '_' + slug(item);
    await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
    console.log('captured', name);
  } catch (e) {
    console.log('FAIL nav', item, e.message.split('\n')[0]);
  }
}
await browser.close();
console.log('DONE main screens');

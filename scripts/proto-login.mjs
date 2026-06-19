import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const OUT = 'docs/figma-shots/proto';
mkdirSync(OUT, { recursive: true });
const URL = 'https://afar-patron-55557012.figma.site/';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(URL, { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(2500);

// Fill login
const inputs = page.locator('input');
await inputs.nth(0).fill('João');
await inputs.nth(1).fill('123456');

// Open clinic combobox and pick first option
const combo = page.getByRole('combobox');
await combo.click();
await page.waitForTimeout(800);
await page.screenshot({ path: `${OUT}/login_clinic_dropdown.png` });
// pick first option
const opt = page.getByRole('option').first();
if (await opt.count()) { await opt.click(); } else {
  // fallback: press down+enter
  await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter');
}
await page.waitForTimeout(500);

// Click Entrar
await page.getByRole('button', { name: /entrar/i }).click();
await page.waitForTimeout(3000);
await page.screenshot({ path: `${OUT}/after_login.png` });

// dump nav structure
const nav = await page.evaluate(() => {
  const out = [];
  document.querySelectorAll('a, button, [role=button], [role=tab], [role=menuitem]').forEach((e) => {
    const r = e.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) {
      out.push({ tag: e.tagName, text: (e.textContent || '').trim().slice(0, 50), x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width) });
    }
  });
  return out;
});
console.log('URL after login:', page.url());
console.log('NAV:', JSON.stringify(nav, null, 0));
await browser.close();

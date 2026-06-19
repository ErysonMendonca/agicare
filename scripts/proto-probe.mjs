import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const OUT = 'docs/figma-shots/proto';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto('https://afar-patron-55557012.figma.site/', { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(3000);
await page.screenshot({ path: `${OUT}/_probe_landing.png`, fullPage: false });

// dump visible interactive elements to understand the DOM
const els = await page.evaluate(() => {
  const out = [];
  document.querySelectorAll('button, a, [role=button], input, [data-name]').forEach((e) => {
    const r = e.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) {
      out.push({ tag: e.tagName, text: (e.textContent || '').trim().slice(0, 40), role: e.getAttribute('role'), x: Math.round(r.x), y: Math.round(r.y) });
    }
  });
  return out.slice(0, 60);
});
console.log('TITLE:', await page.title());
console.log('ELEMENTS:', JSON.stringify(els, null, 1));
await browser.close();

// Loga no protótipo do Figma com as credenciais demo e captura as telas internas.
// Uso: node scripts/figma-login-capture.mjs
import { chromium } from 'playwright'
import { mkdir, writeFile } from 'node:fs/promises'

const BASE = 'https://afar-patron-55557012.figma.site/'
const OUT = 'docs/figma-shots'

const settle = async (page, ms = 1500) => {
  await page.waitForTimeout(ms)
  await page.evaluate(() => window.scrollTo(0, 0)).catch(() => {})
}

const shot = (page, name) =>
  page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true })

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })
await page.goto(BASE, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {})
await settle(page, 2500)

// ── Login (usuário João / senha 123456 / clínica) ──────────────
await page.fill('#usuario', 'João').catch(() => {})
await page.fill('#senha', '123456').catch(() => {})
// seleciona a clínica via <select> nativo, se existir
try {
  await page.locator('select').first().selectOption({ index: 1 })
} catch {
  // fallback: dropdown custom
  await page.getByText('Selecione a clínica').click().catch(() => {})
  await page.getByText('Clínica 1').click().catch(() => {})
}
await settle(page, 500)
await page.getByRole('button', { name: /entrar/i }).click().catch(() => {})
await settle(page, 3000)
await shot(page, 'app__01_dashboard')

// ── Descobre os itens de navegação (sidebar/menu) ──────────────
const navItems = await page.evaluate(() => {
  const items = [...document.querySelectorAll('button, a, [role="button"], [role="menuitem"], nav *')]
    .map((el) => (el.innerText || '').trim())
    .filter((t) => t && t.length > 1 && t.length < 28 && !t.includes('\n'))
  return [...new Set(items)]
})
await writeFile('docs/figma-app-nav.json', JSON.stringify(navItems, null, 2))
console.log('NAV CANDIDATES:', JSON.stringify(navItems))

// ── Clica em cada candidato de navegação e captura ─────────────
const slug = (t) => t.toLowerCase().replace(/[^\w]+/g, '_').replace(/^_|_$/g, '')
let i = 2
for (const label of navItems) {
  try {
    const loc = page.getByText(label, { exact: true }).first()
    if (!(await loc.count())) continue
    await loc.click({ timeout: 4000 })
    await settle(page, 1800)
    await shot(page, `app__${String(i).padStart(2, '0')}_${slug(label)}`)
    console.log('captured:', label)
    i++
  } catch (e) {
    console.log('skip:', label, String(e).slice(0, 60))
  }
}

console.log('OK — telas internas capturadas')
await browser.close()

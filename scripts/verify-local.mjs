// Captura as telas renderizadas localmente para comparar com o Figma.
import { chromium } from 'playwright'
import { mkdir } from 'node:fs/promises'

const OUT = 'docs/local-shots'
const routes = [
  ['home', '/'],
  ['admin_login', '/admin/login'],
  ['dashboard', '/dashboard'],
  ['fila', '/fila'],
  ['pacientes', '/pacientes'],
  ['agenda', '/agenda'],
  ['prontuario', '/prontuario'],
  ['procedimentos', '/procedimentos'],
  ['laboratorio', '/laboratorio'],
  ['profissionais', '/profissionais'],
  ['estoque', '/estoque'],
  ['faturamento', '/faturamento'],
  ['relatorios', '/relatorios'],
  ['configuracoes', '/configuracoes'],
]

await mkdir(OUT, { recursive: true })
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })

for (const [name, path] of routes) {
  try {
    await page.goto('http://localhost:3000' + path, { waitUntil: 'networkidle', timeout: 30000 })
    await page.waitForTimeout(900)
    await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true })
    console.log('shot:', name)
  } catch (e) {
    console.log('FAIL:', name, String(e).slice(0, 80))
  }
}

await browser.close()
console.log('OK')

// Smoke da Onda 4: loga como admin e visita as rotas-chave (incl. as tocadas
// pelas migrations 0030-0035), capturando pageerror/console.error e o status.
// Uso: `npm run dev` em outro terminal, depois `node scripts/smoke-onda4.mjs`.
import { chromium } from 'playwright'

const BASE = 'http://localhost:3000'
const EMAIL = 'admin@agicare.test'
const SENHA = 'Agicare2026!'

const rotas = [
  ['dashboard', '/dashboard'],
  ['pacientes', '/pacientes'],
  ['agenda', '/agenda'],
  ['estoque', '/estoque'],
  ['procedimentos', '/procedimentos'],
  ['profissionais', '/profissionais'],
  ['faturamento', '/faturamento'],
  ['relatorios', '/relatorios'],
  ['configuracoes', '/configuracoes'],
  ['prontuario', '/prontuario'],
]

const b = await chromium.launch()
const p = await b.newPage({ viewport: { width: 1440, height: 900 } })

// espera o server subir
for (let i = 0; i < 40; i++) {
  try { const r = await p.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 4000 }); if (r) break } catch { await p.waitForTimeout(1000) }
}
await p.waitForTimeout(800)

// login real
await p.fill('#usuario', EMAIL)
await p.fill('#senha', SENHA)
await Promise.all([
  p.waitForURL('**/dashboard', { timeout: 20000 }).catch(() => {}),
  p.getByRole('button', { name: /entrar/i }).click(),
])
await p.waitForTimeout(1500)
const logado = p.url().includes('/dashboard')
console.log(`LOGIN: ${logado ? 'OK' : 'FALHOU'} (url=${p.url()})`)
if (!logado) { await b.close(); process.exit(1) }

let falhas = 0
for (const [nome, rota] of rotas) {
  const erros = []
  const onErr = (e) => erros.push('pageerror: ' + String(e).slice(0, 140))
  const onConsole = (m) => { if (m.type() === 'error') erros.push('console: ' + m.text().slice(0, 140)) }
  p.on('pageerror', onErr)
  p.on('console', onConsole)
  let status = '?'
  try {
    const resp = await p.goto(BASE + rota, { waitUntil: 'networkidle', timeout: 25000 })
    status = resp ? resp.status() : '?'
    await p.waitForTimeout(700)
  } catch (e) {
    erros.push('goto: ' + String(e).slice(0, 100))
  }
  p.off('pageerror', onErr)
  p.off('console', onConsole)
  const redir = !p.url().includes(rota)
  const ok = status === 200 && erros.length === 0 && !redir
  if (!ok) falhas++
  console.log(`${ok ? 'OK ' : 'XX '} ${nome.padEnd(14)} status=${status}${redir ? ' [REDIRECIONOU p/ ' + p.url() + ']' : ''}${erros.length ? '\n     ' + erros.join('\n     ') : ''}`)
}

console.log(`\nRESULTADO: ${rotas.length - falhas}/${rotas.length} rotas limpas` + (falhas ? ` — ${falhas} com problema` : ' — TODAS OK'))
await b.close()
process.exit(falhas ? 1 : 0)

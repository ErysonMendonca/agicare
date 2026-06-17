// Captura o site publicado do Figma para replicação fiel.
// Uso: node scripts/figma-capture.mjs
// Saída: docs/figma-shots/*.png  +  docs/figma-structure.json
import { chromium } from 'playwright'
import { mkdir, writeFile } from 'node:fs/promises'

const BASE = 'https://afar-patron-55557012.figma.site/'
const OUT = 'docs/figma-shots'

const slug = (u) => {
  const p = new URL(u).pathname.replace(/\/+$/, '') || '/home'
  return p.replace(/^\//, '').replace(/[^\w-]+/g, '_') || 'home'
}

async function capture(page, url, name) {
  await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {})
  await page.waitForTimeout(2500) // deixa fontes/animações assentarem
  // rola até o fim para forçar lazy-load
  await page.evaluate(async () => {
    await new Promise((res) => {
      let y = 0
      const t = setInterval(() => {
        window.scrollBy(0, 600)
        y += 600
        if (y >= document.body.scrollHeight) {
          clearInterval(t)
          res()
        }
      }, 100)
    })
  })
  await page.waitForTimeout(800)
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.waitForTimeout(400)
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true })
}

const run = async () => {
  await mkdir(OUT, { recursive: true })
  const browser = await chromium.launch()

  // Desktop
  const ctxD = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })
  const pageD = await ctxD.newPage()
  await pageD.goto(BASE, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {})
  await pageD.waitForTimeout(2500)

  // Descobre links internos / textos para mapear a estrutura
  const info = await pageD.evaluate(() => {
    const origin = location.origin
    const links = [...document.querySelectorAll('a[href]')]
      .map((a) => a.href)
      .filter((h) => h.startsWith(origin))
    const texts = [...document.querySelectorAll('h1,h2,h3,nav,button')]
      .map((e) => e.tagName + ': ' + (e.innerText || '').trim())
      .filter((t) => t.length > 4)
    return { title: document.title, links: [...new Set(links)], texts: texts.slice(0, 120) }
  })

  const pages = [...new Set([BASE, ...info.links])]
  await writeFile('docs/figma-structure.json', JSON.stringify({ ...info, pages }, null, 2))

  for (const url of pages) {
    const name = 'desktop__' + slug(url)
    console.log('desktop:', url)
    await capture(pageD, url, name)
  }
  await ctxD.close()

  // Mobile
  const ctxM = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true })
  const pageM = await ctxM.newPage()
  for (const url of pages) {
    const name = 'mobile__' + slug(url)
    console.log('mobile:', url)
    await capture(pageM, url, name)
  }
  await ctxM.close()

  await browser.close()
  console.log('OK — capturadas', pages.length, 'páginas (desktop + mobile)')
}

run().catch((e) => {
  console.error(e)
  process.exit(1)
})

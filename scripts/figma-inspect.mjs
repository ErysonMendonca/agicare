// Inspeciona o DOM e os tokens computados da tela de login do Figma.
import { chromium } from 'playwright'
import { writeFile } from 'node:fs/promises'

const BASE = 'https://afar-patron-55557012.figma.site/'

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
await page.goto(BASE, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {})
await page.waitForTimeout(2500)

const data = await page.evaluate(() => {
  const styleOf = (el) => {
    if (!el) return null
    const s = getComputedStyle(el)
    return {
      tag: el.tagName,
      text: (el.innerText || '').slice(0, 40),
      color: s.color,
      background: s.backgroundColor,
      backgroundImage: s.backgroundImage.slice(0, 160),
      fontFamily: s.fontFamily,
      fontSize: s.fontSize,
      fontWeight: s.fontWeight,
      borderRadius: s.borderRadius,
      boxShadow: s.boxShadow.slice(0, 80),
    }
  }
  const inputs = [...document.querySelectorAll('input')].map((i) => ({
    type: i.type, name: i.name, id: i.id, placeholder: i.placeholder,
  }))
  const selects = [...document.querySelectorAll('select')].map((s) => ({
    name: s.name, id: s.id,
    options: [...s.options].map((o) => o.text),
  }))
  const buttons = [...document.querySelectorAll('button')].map((b) => ({
    text: (b.innerText || '').trim(), ...styleOf(b),
  }))
  // tenta achar o gradiente do fundo
  const bgEls = [document.body, ...document.querySelectorAll('div')]
    .map(styleOf)
    .filter((s) => s && s.backgroundImage && s.backgroundImage.includes('gradient'))
    .slice(0, 5)

  return {
    bodyFont: getComputedStyle(document.body).fontFamily,
    inputs, selects, buttons,
    gradients: bgEls,
    h1: styleOf(document.querySelector('h1')),
    h2: styleOf(document.querySelector('h2')),
  }
})

await writeFile('docs/figma-dom.json', JSON.stringify(data, null, 2))
console.log(JSON.stringify(data, null, 2))
await browser.close()

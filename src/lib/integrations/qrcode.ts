/**
 * Gerador de QR Code AUTOCONTIDO (sem dependência de rede nem de lib externa).
 *
 * Por que existir: o comprovante de agendamento (escopo 7.2) precisa de um QR
 * REAL e escaneável a partir do protocolo. O projeto não tem lib de QR, e a UI
 * antes só pintava um ícone (`lucide:QrCode`) — falso. Este módulo gera o
 * código de verdade e devolve um SVG pronto para embutir (`<svg>`), sem fetch.
 *
 * Escopo da implementação (suficiente e honesto p/ o caso de uso):
 *  - Modo BYTE (UTF-8), nível de correção de erro M (~15%).
 *  - Versões 1–10 com seleção automática (protocolos curtos cabem na v1/v2).
 *  - Reed–Solomon sobre GF(256), 8 máscaras com escolha pela menor penalidade.
 *
 * É PURO (sem imports de servidor) → seguro em Client Components.
 *
 * Referência do algoritmo: ISO/IEC 18004 (QR Code).
 */

// ── Galois Field GF(256) com polinômio primitivo 0x11d ────────────
const GF_EXP = new Uint8Array(512)
const GF_LOG = new Uint8Array(256)
;(() => {
  let x = 1
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x
    GF_LOG[x] = i
    x <<= 1
    if (x & 0x100) x ^= 0x11d
  }
  for (let i = 255; i < 512; i++) GF_EXP[i] = GF_EXP[i - 255]
})()

function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0
  return GF_EXP[GF_LOG[a] + GF_LOG[b]]
}

/** Polinômio gerador Reed–Solomon de grau `degree`. */
function rsGeneratorPoly(degree: number): number[] {
  let poly = [1]
  for (let i = 0; i < degree; i++) {
    const next = new Array<number>(poly.length + 1).fill(0)
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= poly[j]
      next[j + 1] ^= gfMul(poly[j], GF_EXP[i])
    }
    poly = next
  }
  return poly
}

/** Codewords de correção de erro para um bloco de dados. */
function rsEncode(data: number[], ecLen: number): number[] {
  const gen = rsGeneratorPoly(ecLen)
  const res = new Array<number>(ecLen).fill(0)
  for (const d of data) {
    const factor = d ^ res[0]
    res.shift()
    res.push(0)
    if (factor !== 0) {
      for (let i = 0; i < ecLen; i++) res[i] ^= gfMul(gen[i + 1], factor)
    }
  }
  return res
}

// ── Tabelas por versão (nível de correção M) ──────────────────────
// ecPerBlock = codewords de EC por bloco; groups = [[nBlocos, dadosPorBloco]].
type VersionSpec = { ecPerBlock: number; groups: [number, number][] }
const M_SPECS: Record<number, VersionSpec> = {
  1: { ecPerBlock: 10, groups: [[1, 16]] },
  2: { ecPerBlock: 16, groups: [[1, 28]] },
  3: { ecPerBlock: 26, groups: [[1, 44]] },
  4: { ecPerBlock: 18, groups: [[2, 32]] },
  5: { ecPerBlock: 24, groups: [[2, 43]] },
  6: { ecPerBlock: 16, groups: [[4, 27]] },
  7: { ecPerBlock: 18, groups: [[4, 31]] },
  8: { ecPerBlock: 22, groups: [[2, 38], [2, 39]] },
  9: { ecPerBlock: 22, groups: [[3, 36], [2, 37]] },
  10: { ecPerBlock: 26, groups: [[4, 43], [1, 44]] },
}

/** Capacidade de dados (codewords) por versão = soma das group capacities. */
function dataCodewords(version: number): number {
  return M_SPECS[version].groups.reduce((acc, [n, d]) => acc + n * d, 0)
}

/** Posições centrais dos padrões de alinhamento por versão (1–10). */
const ALIGN_POS: Record<number, number[]> = {
  1: [],
  2: [6, 18],
  3: [6, 22],
  4: [6, 26],
  5: [6, 30],
  6: [6, 34],
  7: [6, 22, 38],
  8: [6, 24, 42],
  9: [6, 26, 46],
  10: [6, 28, 50],
}

const MAX_VERSION = 10

// ── Codificação dos dados (modo byte) ─────────────────────────────
function encodeData(bytes: number[], version: number): number[] {
  const totalData = dataCodewords(version)
  const bits: number[] = []
  const push = (val: number, len: number) => {
    for (let i = len - 1; i >= 0; i--) bits.push((val >> i) & 1)
  }

  push(0b0100, 4) // indicador de modo: byte
  // Indicador de contagem: 8 bits p/ versões 1–9, 16 bits p/ 10–26.
  push(bytes.length, version <= 9 ? 8 : 16)
  for (const b of bytes) push(b, 8)

  // Terminador (até 4 bits) sem estourar a capacidade.
  const capacityBits = totalData * 8
  for (let i = 0; i < 4 && bits.length < capacityBits; i++) bits.push(0)
  // Completa o último byte.
  while (bits.length % 8 !== 0) bits.push(0)

  const codewords: number[] = []
  for (let i = 0; i < bits.length; i += 8) {
    let v = 0
    for (let j = 0; j < 8; j++) v = (v << 1) | bits[i + j]
    codewords.push(v)
  }
  // Bytes de preenchimento alternados (0xEC, 0x11).
  const pads = [0xec, 0x11]
  let p = 0
  while (codewords.length < totalData) codewords.push(pads[p++ % 2])
  return codewords
}

/** Intercala blocos de dados e de EC conforme a estrutura da versão. */
function interleave(codewords: number[], version: number): number[] {
  const spec = M_SPECS[version]
  const blocks: number[][] = []
  const ecBlocks: number[][] = []
  let offset = 0
  for (const [nBlocks, dataPerBlock] of spec.groups) {
    for (let b = 0; b < nBlocks; b++) {
      const data = codewords.slice(offset, offset + dataPerBlock)
      offset += dataPerBlock
      blocks.push(data)
      ecBlocks.push(rsEncode(data, spec.ecPerBlock))
    }
  }

  const result: number[] = []
  const maxData = Math.max(...blocks.map((b) => b.length))
  for (let i = 0; i < maxData; i++) {
    for (const b of blocks) if (i < b.length) result.push(b[i])
  }
  for (let i = 0; i < spec.ecPerBlock; i++) {
    for (const ec of ecBlocks) result.push(ec[i])
  }
  return result
}

// ── Matriz e padrões de função ────────────────────────────────────
type Matrix = { size: number; cells: Int8Array; reserved: Uint8Array }

function makeMatrix(version: number): Matrix {
  const size = 17 + version * 4
  return {
    size,
    cells: new Int8Array(size * size).fill(-1),
    reserved: new Uint8Array(size * size),
  }
}

function set(m: Matrix, r: number, c: number, val: number, reserve = true) {
  m.cells[r * m.size + c] = val ? 1 : 0
  if (reserve) m.reserved[r * m.size + c] = 1
}
function get(m: Matrix, r: number, c: number): number {
  return m.cells[r * m.size + c]
}
function isReserved(m: Matrix, r: number, c: number): boolean {
  return m.reserved[r * m.size + c] === 1
}

function placeFinder(m: Matrix, row: number, col: number) {
  for (let r = -1; r <= 7; r++) {
    for (let c = -1; c <= 7; c++) {
      const rr = row + r
      const cc = col + c
      if (rr < 0 || rr >= m.size || cc < 0 || cc >= m.size) continue
      const inRing =
        r >= 0 && r <= 6 && c >= 0 && c <= 6
          ? r === 0 || r === 6 || c === 0 || c === 6
          : false
      const inCore = r >= 2 && r <= 4 && c >= 2 && c <= 4
      const dark = (r >= 0 && r <= 6 && c >= 0 && c <= 6) && (inRing || inCore)
      set(m, rr, cc, dark ? 1 : 0)
    }
  }
}

function placeAlignment(m: Matrix, version: number) {
  const pos = ALIGN_POS[version]
  const last = pos[pos.length - 1]
  for (const r of pos) {
    for (const c of pos) {
      // Pula apenas os 3 cantos que colidem com os finders. Os alinhamentos
      // sobre a linha/coluna de timing são desenhados por cima (padrão correto).
      if ((r === 6 && c === 6) || (r === 6 && c === last) || (r === last && c === 6))
        continue
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          const dark = Math.max(Math.abs(dr), Math.abs(dc)) !== 1
          set(m, r + dr, c + dc, dark ? 1 : 0)
        }
      }
    }
  }
}

function placeFunctionPatterns(m: Matrix, version: number) {
  const size = m.size
  placeFinder(m, 0, 0)
  placeFinder(m, 0, size - 7)
  placeFinder(m, size - 7, 0)
  // Timing patterns.
  for (let i = 8; i < size - 8; i++) {
    const v = i % 2 === 0 ? 1 : 0
    if (!isReserved(m, 6, i)) set(m, 6, i, v)
    if (!isReserved(m, i, 6)) set(m, i, 6, v)
  }
  placeAlignment(m, version)
  // Módulo escuro fixo.
  set(m, size - 8, 8, 1)
  // Reserva área de format info (preenchida depois com a máscara escolhida).
  reserveFormatArea(m)
}

function reserveFormatArea(m: Matrix) {
  const size = m.size
  for (let i = 0; i <= 8; i++) {
    if (i !== 6) {
      m.reserved[8 * size + i] = 1
      m.reserved[i * size + 8] = 1
    }
  }
  for (let i = 0; i < 8; i++) {
    m.reserved[8 * size + (size - 1 - i)] = 1
    m.reserved[(size - 1 - i) * size + 8] = 1
  }
}

// ── Preenchimento dos dados em zig-zag ────────────────────────────
function placeData(m: Matrix, bytes: number[]) {
  const size = m.size
  const bits: number[] = []
  for (const b of bytes) for (let i = 7; i >= 0; i--) bits.push((b >> i) & 1)

  let idx = 0
  let upward = true
  for (let col = size - 1; col > 0; col -= 2) {
    if (col === 6) col-- // pula a coluna de timing
    for (let i = 0; i < size; i++) {
      const row = upward ? size - 1 - i : i
      for (let c = 0; c < 2; c++) {
        const cc = col - c
        if (isReserved(m, row, cc)) continue
        const bit = idx < bits.length ? bits[idx++] : 0
        m.cells[row * size + cc] = bit
      }
    }
    upward = !upward
  }
}

// ── Máscaras ──────────────────────────────────────────────────────
const MASKS: ((r: number, c: number) => boolean)[] = [
  (r, c) => (r + c) % 2 === 0,
  (r) => r % 2 === 0,
  (_r, c) => c % 3 === 0,
  (r, c) => (r + c) % 3 === 0,
  (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
  (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
  (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
  (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
]

function applyMask(m: Matrix, maskFn: (r: number, c: number) => boolean): Matrix {
  const out: Matrix = {
    size: m.size,
    cells: Int8Array.from(m.cells),
    reserved: m.reserved,
  }
  for (let r = 0; r < m.size; r++) {
    for (let c = 0; c < m.size; c++) {
      if (isReserved(m, r, c)) continue
      if (maskFn(r, c)) out.cells[r * m.size + c] ^= 1
    }
  }
  return out
}

/** Penalidade de uma máscara (regras N1–N4 do padrão). */
function penalty(m: Matrix): number {
  const size = m.size
  let score = 0
  const at = (r: number, c: number) => m.cells[r * size + c]

  // N1: corridas de 5+ iguais (linhas e colunas).
  for (let r = 0; r < size; r++) {
    let runC = 1
    let runR = 1
    for (let c = 1; c < size; c++) {
      if (at(r, c) === at(r, c - 1)) runC++
      else { if (runC >= 5) score += 3 + (runC - 5); runC = 1 }
      if (at(c, r) === at(c - 1, r)) runR++
      else { if (runR >= 5) score += 3 + (runR - 5); runR = 1 }
    }
    if (runC >= 5) score += 3 + (runC - 5)
    if (runR >= 5) score += 3 + (runR - 5)
  }

  // N2: blocos 2x2 da mesma cor.
  for (let r = 0; r < size - 1; r++) {
    for (let c = 0; c < size - 1; c++) {
      const v = at(r, c)
      if (v === at(r, c + 1) && v === at(r + 1, c) && v === at(r + 1, c + 1))
        score += 3
    }
  }

  // N3: padrão 1:1:3:1:1 (finder-like) em linhas e colunas.
  const pat1 = [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0]
  const pat2 = [0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 1]
  const matches = (arr: number[], start: number, pat: number[]) => {
    for (let k = 0; k < pat.length; k++) if (arr[start + k] !== pat[k]) return false
    return true
  }
  for (let r = 0; r < size; r++) {
    const rowArr: number[] = []
    const colArr: number[] = []
    for (let c = 0; c < size; c++) {
      rowArr.push(at(r, c))
      colArr.push(at(c, r))
    }
    for (let c = 0; c <= size - 11; c++) {
      if (matches(rowArr, c, pat1) || matches(rowArr, c, pat2)) score += 40
      if (matches(colArr, c, pat1) || matches(colArr, c, pat2)) score += 40
    }
  }

  // N4: proporção de módulos escuros.
  let dark = 0
  for (let i = 0; i < m.cells.length; i++) if (m.cells[i] === 1) dark++
  const ratio = (dark * 100) / (size * size)
  const k = Math.floor(Math.abs(ratio - 50) / 5)
  score += k * 10

  return score
}

// ── Format info (BCH 15,5) ────────────────────────────────────────
/** Valor de 15 bits do format info (nível M + máscara), já com o XOR padrão. */
function formatValue(maskIndex: number): number {
  // Nível M = 0b00; concatena com a máscara (3 bits) → 5 bits de dados.
  const data = (0b00 << 3) | maskIndex
  let rem = data
  for (let i = 0; i < 10; i++) {
    rem = (rem << 1) ^ ((rem >> 9) * 0b10100110111)
  }
  return ((data << 10) | rem) ^ 0b101010000010010
}

function placeFormat(m: Matrix, maskIndex: number) {
  const size = m.size
  const value = formatValue(maskIndex)
  const bit = (i: number) => (value >> i) & 1
  // Cópia 1: borda do finder superior-esquerdo (índices LSB → MSB).
  for (let i = 0; i <= 5; i++) set(m, i, 8, bit(i))
  set(m, 7, 8, bit(6))
  set(m, 8, 8, bit(7))
  set(m, 8, 7, bit(8))
  for (let i = 9; i < 15; i++) set(m, 8, 14 - i, bit(i))
  // Cópia 2: distribuída pelos finders inferior-esquerdo e superior-direito.
  for (let i = 0; i < 8; i++) set(m, 8, size - 1 - i, bit(i))
  for (let i = 8; i < 15; i++) set(m, size - 15 + i, 8, bit(i))
}

// ── API pública ───────────────────────────────────────────────────
/** Matriz booleana final (true = módulo escuro), sem quiet zone. */
export function generateQrMatrix(text: string): boolean[][] {
  const bytes = Array.from(new TextEncoder().encode(text))

  // Seleciona a menor versão cujo nível M comporta os dados.
  let version = 0
  for (let v = 1; v <= MAX_VERSION; v++) {
    const headerBytes = 1 + (v <= 9 ? 1 : 2) // mode+count aproximado em bytes
    if (bytes.length + headerBytes <= dataCodewords(v)) {
      version = v
      break
    }
  }
  if (version === 0) {
    throw new Error('Conteúdo longo demais para o QR (máx. versão 10).')
  }

  const codewords = encodeData(bytes, version)
  const finalCodewords = interleave(codewords, version)

  const base = makeMatrix(version)
  placeFunctionPatterns(base, version)
  placeData(base, finalCodewords)

  // Escolhe a máscara de menor penalidade.
  let best: Matrix | null = null
  let bestScore = Infinity
  for (let i = 0; i < MASKS.length; i++) {
    const masked = applyMask(base, MASKS[i])
    placeFormat(masked, i)
    const score = penalty(masked)
    if (score < bestScore) {
      bestScore = score
      best = masked
    }
  }

  const m = best!
  const out: boolean[][] = []
  for (let r = 0; r < m.size; r++) {
    const row: boolean[] = []
    for (let c = 0; c < m.size; c++) row.push(get(m, r, c) === 1)
    out.push(row)
  }
  return out
}

/**
 * Gera o QR como string SVG (quiet zone de 4 módulos). Os módulos escuros saem
 * num único `<path>` para um SVG compacto. `size` = lado em px do SVG.
 */
export function qrToSvg(text: string, size = 160): string {
  const matrix = generateQrMatrix(text)
  const quiet = 4
  const count = matrix.length + quiet * 2
  let path = ''
  for (let r = 0; r < matrix.length; r++) {
    for (let c = 0; c < matrix.length; c++) {
      if (matrix[r][c]) path += `M${c + quiet} ${r + quiet}h1v1h-1z`
    }
  }
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" ` +
    `viewBox="0 0 ${count} ${count}" shape-rendering="crispEdges" role="img" ` +
    `aria-label="QR Code do comprovante">` +
    `<rect width="${count}" height="${count}" fill="#ffffff"/>` +
    `<path d="${path}" fill="#0f172a"/>` +
    `</svg>`
  )
}

/** SVG como data URL (útil para `<img src>` ou impressão). */
export function qrToDataUrl(text: string, size = 160): string {
  const svg = qrToSvg(text, size)
  const encoded =
    typeof window === 'undefined'
      ? Buffer.from(svg).toString('base64')
      : window.btoa(unescape(encodeURIComponent(svg)))
  return `data:image/svg+xml;base64,${encoded}`
}

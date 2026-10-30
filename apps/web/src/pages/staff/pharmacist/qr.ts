// Minimal QR Code encoder (ISO/IEC 18004): byte mode, error correction level M, versions 1 to 6.
// Enough for the hand-over label payload "CFHO|<rx number>|<code>" (up to 106 bytes). No dependencies.

interface VersionInfo {
  /** data codewords per block, number of blocks, ec codewords per block */
  data: number
  blocks: number
  ec: number
  capacity: number
}

const VERSIONS: Record<number, VersionInfo> = {
  1: { data: 16, blocks: 1, ec: 10, capacity: 14 },
  2: { data: 28, blocks: 1, ec: 16, capacity: 26 },
  3: { data: 44, blocks: 1, ec: 26, capacity: 42 },
  4: { data: 32, blocks: 2, ec: 18, capacity: 62 },
  5: { data: 43, blocks: 2, ec: 24, capacity: 84 },
  6: { data: 27, blocks: 4, ec: 16, capacity: 106 },
}

// ---- Galois field GF(256), primitive polynomial 0x11d
const EXP = new Array<number>(512)
const LOG = new Array<number>(256)
;(() => {
  let x = 1
  for (let i = 0; i < 255; i++) {
    EXP[i] = x
    LOG[x] = i
    x <<= 1
    if (x & 0x100) x ^= 0x11d
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255]!
})()

function gfMul(a: number, b: number): number {
  return a === 0 || b === 0 ? 0 : EXP[LOG[a]! + LOG[b]!]!
}

function rsGenerator(degree: number): number[] {
  let poly = [1]
  for (let i = 0; i < degree; i++) {
    const next = new Array<number>(poly.length + 1).fill(0)
    for (let j = 0; j < poly.length; j++) {
      next[j] = next[j]! ^ gfMul(poly[j]!, 1)
      next[j + 1] = next[j + 1]! ^ gfMul(poly[j]!, EXP[i]!)
    }
    poly = next
  }
  return poly
}

function rsRemainder(data: number[], ecLen: number): number[] {
  const gen = rsGenerator(ecLen)
  const res = new Array<number>(ecLen).fill(0)
  for (const b of data) {
    const factor = b ^ res.shift()!
    res.push(0)
    for (let i = 0; i < ecLen; i++) res[i] = res[i]! ^ gfMul(gen[i + 1]!, factor)
  }
  return res
}

function utf8(text: string): number[] {
  return Array.from(new TextEncoder().encode(text))
}

function buildCodewords(bytes: number[], v: VersionInfo): number[] {
  const totalData = v.data * v.blocks
  const bits: number[] = []
  const push = (val: number, len: number) => {
    for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1)
  }
  push(0b0100, 4)
  push(bytes.length, 8)
  for (const b of bytes) push(b, 8)
  push(0, Math.min(4, totalData * 8 - bits.length))
  while (bits.length % 8) bits.push(0)
  const cw: number[] = []
  for (let i = 0; i < bits.length; i += 8) cw.push(parseInt(bits.slice(i, i + 8).join(''), 2))
  for (let pad = 0xec; cw.length < totalData; pad = pad === 0xec ? 0x11 : 0xec) cw.push(pad)

  const dataBlocks: number[][] = []
  for (let b = 0; b < v.blocks; b++) dataBlocks.push(cw.slice(b * v.data, (b + 1) * v.data))
  const ecBlocks = dataBlocks.map((blk) => rsRemainder(blk, v.ec))
  const out: number[] = []
  for (let i = 0; i < v.data; i++) for (const blk of dataBlocks) out.push(blk[i]!)
  for (let i = 0; i < v.ec; i++) for (const blk of ecBlocks) out.push(blk[i]!)
  return out
}

type Grid = (boolean | null)[][]

function newGrid(size: number): Grid {
  return Array.from({ length: size }, () => new Array<boolean | null>(size).fill(null))
}

function placeFinder(g: Grid, r0: number, c0: number) {
  for (let dr = -1; dr <= 7; dr++) {
    for (let dc = -1; dc <= 7; dc++) {
      const r = r0 + dr
      const c = c0 + dc
      if (r < 0 || c < 0 || r >= g.length || c >= g.length) continue
      const inRing = dr >= 0 && dr <= 6 && dc >= 0 && dc <= 6
      const dark = inRing && (dr === 0 || dr === 6 || dc === 0 || dc === 6 || (dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4))
      g[r]![c] = dark
    }
  }
}

function placeFunctionPatterns(version: number): Grid {
  const size = 17 + 4 * version
  const g = newGrid(size)
  placeFinder(g, 0, 0)
  placeFinder(g, 0, size - 7)
  placeFinder(g, size - 7, 0)
  for (let i = 8; i < size - 8; i++) {
    g[6]![i] = i % 2 === 0
    g[i]![6] = i % 2 === 0
  }
  if (version >= 2) {
    const p = size - 7
    for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) g[p + dr]![p + dc] = Math.max(Math.abs(dr), Math.abs(dc)) !== 1
  }
  g[size - 8]![8] = true // dark module
  // reserve format information areas (filled later)
  for (let i = 0; i < 9; i++) {
    if (g[8]![i] === null) g[8]![i] = false
    if (g[i]![8] === null) g[i]![8] = false
  }
  for (let i = 0; i < 8; i++) {
    if (g[8]![size - 1 - i] === null) g[8]![size - 1 - i] = false
    if (g[size - 1 - i]![8] === null) g[size - 1 - i]![8] = false
  }
  return g
}

function isFunction(version: number): boolean[][] {
  const g = placeFunctionPatterns(version)
  return g.map((row) => row.map((c) => c !== null))
}

function maskBit(mask: number, r: number, c: number): boolean {
  switch (mask) {
    case 0: return (r + c) % 2 === 0
    case 1: return r % 2 === 0
    case 2: return c % 3 === 0
    case 3: return (r + c) % 3 === 0
    case 4: return (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0
    case 5: return ((r * c) % 2) + ((r * c) % 3) === 0
    case 6: return (((r * c) % 2) + ((r * c) % 3)) % 2 === 0
    default: return (((r + c) % 2) + ((r * c) % 3)) % 2 === 0
  }
}

function formatBits(mask: number): number {
  const data = (0b00 << 3) | mask // error correction level M = 00
  let rem = data
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537)
  return ((data << 10) | rem) ^ 0x5412
}

function applyFormat(g: boolean[][], mask: number) {
  const size = g.length
  const bits = formatBits(mask)
  const bit = (i: number) => ((bits >>> i) & 1) === 1
  for (let i = 0; i <= 5; i++) g[i]![8] = bit(i)
  g[7]![8] = bit(6)
  g[8]![8] = bit(7)
  g[8]![7] = bit(8)
  for (let i = 9; i < 15; i++) g[8]![14 - i] = bit(i)
  for (let i = 0; i < 8; i++) g[8]![size - 1 - i] = bit(i)
  for (let i = 8; i < 15; i++) g[size - 15 + i]![8] = bit(i)
  g[size - 8]![8] = true
}

function penalty(g: boolean[][]): number {
  const n = g.length
  let score = 0
  const runs = (line: boolean[]) => {
    let s = 0
    let run = 1
    for (let i = 1; i < n; i++) {
      if (line[i] === line[i - 1]) run++
      else {
        if (run >= 5) s += run - 2
        run = 1
      }
    }
    if (run >= 5) s += run - 2
    return s
  }
  for (let i = 0; i < n; i++) {
    score += runs(g[i]!)
    score += runs(g.map((row) => row[i]!))
  }
  for (let r = 0; r < n - 1; r++)
    for (let c = 0; c < n - 1; c++) {
      const v = g[r]![c]
      if (v === g[r]![c + 1] && v === g[r + 1]![c] && v === g[r + 1]![c + 1]) score += 3
    }
  const pat1 = [true, false, true, true, true, false, true, false, false, false, false]
  const pat2 = [false, false, false, false, true, false, true, true, true, false, true]
  const match = (line: boolean[], start: number, pat: boolean[]) => pat.every((p, k) => line[start + k] === p)
  for (let i = 0; i < n; i++) {
    const row = g[i]!
    const col = g.map((r) => r[i]!)
    for (let s = 0; s + 11 <= n; s++) {
      if (match(row, s, pat1) || match(row, s, pat2)) score += 40
      if (match(col, s, pat1) || match(col, s, pat2)) score += 40
    }
  }
  let dark = 0
  for (const row of g) for (const c of row) if (c) dark++
  score += Math.floor(Math.abs((dark * 100) / (n * n) - 50) / 5) * 10
  return score
}

/** Returns the QR modules (true = dark) for the text, or null when it does not fit versions 1 to 6. */
export function encodeQr(text: string): boolean[][] | null {
  const bytes = utf8(text)
  const version = [1, 2, 3, 4, 5, 6].find((v) => bytes.length <= VERSIONS[v]!.capacity)
  if (!version) return null
  const info = VERSIONS[version]!
  const codewords = buildCodewords(bytes, info)
  const size = 17 + 4 * version
  const base = placeFunctionPatterns(version)
  const fn = isFunction(version)

  const bits: boolean[] = []
  for (const cw of codewords) for (let i = 7; i >= 0; i--) bits.push(((cw >>> i) & 1) === 1)
  const remainder = version === 1 ? 0 : 7
  for (let i = 0; i < remainder; i++) bits.push(false)

  const data = base.map((row) => row.map((c) => c === true))
  const dataPos: [number, number][] = []
  let upward = true
  for (let col = size - 1; col > 0; col -= 2) {
    if (col === 6) col--
    for (let k = 0; k < size; k++) {
      const r = upward ? size - 1 - k : k
      for (const c of [col, col - 1]) if (!fn[r]![c]) dataPos.push([r, c])
    }
    upward = !upward
  }

  let best: boolean[][] | null = null
  let bestScore = Infinity
  for (let mask = 0; mask < 8; mask++) {
    const g = data.map((row) => row.slice())
    dataPos.forEach(([r, c], i) => {
      g[r]![c] = (bits[i] ?? false) !== maskBit(mask, r, c)
    })
    applyFormat(g, mask)
    const s = penalty(g)
    if (s < bestScore) {
      bestScore = s
      best = g
    }
  }
  return best
}

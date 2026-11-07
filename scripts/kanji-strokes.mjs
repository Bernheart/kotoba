// Extract KanjiVG stroke paths for the Genki kanji in data/kanji/lesson-*.json into data/kanji/strokes.json.
// KanjiVG © Ulrich Apel, CC BY-SA 3.0 — https://kanjivg.tagaini.net
// Usage: node scripts/kanji-strokes.mjs   (downloads missing SVGs into node_modules/.cache/kanjivg)
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname
const DATA = join(ROOT, 'data/kanji')
const CACHE = join(ROOT, 'node_modules/.cache/kanjivg')
const SRC = 'https://raw.githubusercontent.com/KanjiVG/kanjivg/master/kanji'
/** Points per stroke stored for draw-and-check (evenly spaced along the stroke). */
const SAMPLES = 16

const kanji = readdirSync(DATA)
  .filter((f) => /^lesson-\d+\.json$/.test(f))
  .sort()
  .flatMap((f) => JSON.parse(readFileSync(join(DATA, f), 'utf8')).kanji.map((k) => k.kanji))

mkdirSync(CACHE, { recursive: true })

async function svgOf(ch) {
  const code = ch.codePointAt(0).toString(16).padStart(5, '0')
  const file = join(CACHE, `${code}.svg`)
  if (existsSync(file)) return readFileSync(file, 'utf8')
  const res = await fetch(`${SRC}/${code}.svg`)
  if (!res.ok) throw new Error(`KanjiVG has no ${ch} (${code}): HTTP ${res.status}`)
  const text = await res.text()
  writeFileSync(file, text)
  return text
}

/** Stroke paths in stroke order (ids kvg:XXXXX-s1, -s2, …). */
export function strokePaths(svg) {
  const out = []
  for (const m of svg.matchAll(/<path\b[^>]*\bid="kvg:[0-9a-f]+-s(\d+)"[^>]*>/g)) {
    const d = /\bd="([^"]+)"/.exec(m[0])?.[1]
    if (d) out.push([Number(m[1]), d])
  }
  return out.sort((a, b) => a[0] - b[0]).map(([, d]) => d)
}

/** Flatten an SVG path (M/L/H/V/C/S/Q/T/Z, absolute or relative) into a polyline. */
export function flatten(d) {
  const toks = d.match(/[a-zA-Z]|-?(?:\d+\.?\d*|\.\d+)(?:e-?\d+)?/g) ?? []
  const pts = []
  let i = 0
  let cmd = ''
  let x = 0
  let y = 0
  let sx = 0
  let sy = 0
  let cx = 0 // last control point (for S/T reflection)
  let cy = 0
  let prev = ''
  const num = () => Number(toks[i++])
  const cubic = (x1, y1, x2, y2, x3, y3) => {
    for (let s = 1; s <= 12; s++) {
      const t = s / 12
      const u = 1 - t
      pts.push([u * u * u * x + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3, u * u * u * y + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3])
    }
    cx = x2
    cy = y2
    x = x3
    y = y3
  }
  while (i < toks.length) {
    if (/[a-zA-Z]/.test(toks[i])) cmd = toks[i++]
    const rel = cmd === cmd.toLowerCase()
    const ox = rel ? x : 0
    const oy = rel ? y : 0
    switch (cmd.toUpperCase()) {
      case 'M':
        x = ox + num()
        y = oy + num()
        sx = x
        sy = y
        pts.push([x, y])
        cmd = rel ? 'l' : 'L' // further pairs are line-tos
        break
      case 'L':
        x = ox + num()
        y = oy + num()
        pts.push([x, y])
        break
      case 'H':
        x = ox + num()
        pts.push([x, y])
        break
      case 'V':
        y = oy + num()
        pts.push([x, y])
        break
      case 'C': {
        const a = [ox + num(), oy + num(), ox + num(), oy + num(), ox + num(), oy + num()]
        cubic(...a)
        break
      }
      case 'S': {
        const refl = /[CS]/i.test(prev)
        const x1 = refl ? 2 * x - cx : x
        const y1 = refl ? 2 * y - cy : y
        const a = [ox + num(), oy + num(), ox + num(), oy + num()]
        cubic(x1, y1, ...a)
        break
      }
      case 'Q': {
        const qx = ox + num()
        const qy = oy + num()
        const ex = ox + num()
        const ey = oy + num()
        cubic(x + (2 / 3) * (qx - x), y + (2 / 3) * (qy - y), ex + (2 / 3) * (qx - ex), ey + (2 / 3) * (qy - ey), ex, ey)
        cx = qx
        cy = qy
        break
      }
      case 'T': {
        const refl = /[QT]/i.test(prev)
        const qx = refl ? 2 * x - cx : x
        const qy = refl ? 2 * y - cy : y
        const ex = ox + num()
        const ey = oy + num()
        cubic(x + (2 / 3) * (qx - x), y + (2 / 3) * (qy - y), ex + (2 / 3) * (qx - ex), ey + (2 / 3) * (qy - ey), ex, ey)
        cx = qx
        cy = qy
        break
      }
      case 'Z':
        x = sx
        y = sy
        pts.push([x, y])
        break
      default:
        throw new Error(`Unsupported path command ${cmd} in ${d}`)
    }
    prev = cmd
  }
  return pts
}

/** n points evenly spaced along a polyline. */
export function resample(pts, n) {
  const segs = []
  let total = 0
  for (let k = 1; k < pts.length; k++) {
    const l = Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1])
    segs.push(l)
    total += l
  }
  if (!total) return Array.from({ length: n }, () => pts[0])
  const out = []
  let k = 0
  let acc = 0
  for (let s = 0; s < n; s++) {
    const target = (total * s) / (n - 1)
    while (k < segs.length - 1 && acc + segs[k] < target) acc += segs[k++]
    const f = segs[k] ? Math.min(1, (target - acc) / segs[k]) : 0
    const a = pts[k]
    const b = pts[k + 1] ?? a
    out.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f])
  }
  return out
}

const r1 = (v) => Math.round(v * 10) / 10

const strokes = {}
for (const ch of kanji) {
  const paths = strokePaths(await svgOf(ch))
  if (!paths.length) throw new Error(`No strokes found for ${ch}`)
  strokes[ch] = { d: paths, pts: paths.map((p) => resample(flatten(p), SAMPLES).map(([a, b]) => [r1(a), r1(b)])) }
}

writeFileSync(
  join(DATA, 'strokes.json'),
  JSON.stringify({ source: 'KanjiVG (https://kanjivg.tagaini.net), © Ulrich Apel, CC BY-SA 3.0', viewBox: 109, strokes }) + '\n',
)
console.log(`Wrote strokes for ${Object.keys(strokes).length} kanji to data/kanji/strokes.json`)

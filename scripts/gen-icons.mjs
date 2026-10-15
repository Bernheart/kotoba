// Generates PWA icons and iOS splash screens from a font-free SVG of the 言 hanko.
// Run: node scripts/gen-icons.mjs
import sharp from 'sharp'
import { mkdirSync, writeFileSync } from 'node:fs'

const BG = '#0f1117'
const ACCENT = '#ee5d3e'
const INK = '#fff6f0'

// 言 drawn with rectangles (so rendering doesn't depend on installed fonts)
const glyph = (x, y, s) => `
  <g transform="translate(${x} ${y}) scale(${s / 64})" fill="${INK}">
    <rect x="28.5" y="6" width="7" height="10" rx="3" transform="rotate(-18 32 11)"/>
    <rect x="11" y="19" width="42" height="5.2" rx="2.4"/>
    <rect x="17.5" y="29" width="29" height="4.6" rx="2.2"/>
    <rect x="17.5" y="38" width="29" height="4.6" rx="2.2"/>
    <path d="M19 47.5h26a2.5 2.5 0 0 1 2.5 2.5v9.5a2.5 2.5 0 0 1-2.5 2.5H19a2.5 2.5 0 0 1-2.5-2.5V50a2.5 2.5 0 0 1 2.5-2.5zm2.2 4.4v6.2h21.6v-6.2z"/>
  </g>`

const icon = (size, { maskable = false, rounded = true } = {}) => {
  const pad = maskable ? size * 0.2 : size * 0.16
  const r = rounded && !maskable ? size * 0.22 : 0
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${r}" fill="${ACCENT}"/>
  <rect x="${size * 0.06}" y="${size * 0.06}" width="${size * 0.88}" height="${size * 0.88}" rx="${r * 0.8}" fill="none" stroke="${INK}" stroke-opacity="0.18" stroke-width="${size * 0.012}"/>
  ${glyph(pad, pad, size - pad * 2)}
</svg>`
}

const splash = (w, h) => {
  const s = Math.round(Math.min(w, h) * 0.26)
  const x = (w - s) / 2
  const y = (h - s) / 2 - h * 0.04
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
  <rect width="${w}" height="${h}" fill="${BG}"/>
  <rect x="${x}" y="${y}" width="${s}" height="${s}" rx="${s * 0.22}" fill="${ACCENT}"/>
  ${glyph(x + s * 0.16, y + s * 0.16, s * 0.68)}
</svg>`
}

mkdirSync('public/icons', { recursive: true })
writeFileSync('public/favicon.svg', icon(64))
const png = (svg, out) => sharp(Buffer.from(svg)).png().toFile(out)
await png(icon(192), 'public/icons/icon-192.png')
await png(icon(512), 'public/icons/icon-512.png')
await png(icon(512, { maskable: true, rounded: false }), 'public/icons/maskable-512.png')
await png(icon(180, { rounded: false }), 'public/apple-touch-icon.png')

// iPhone portrait splash screens (CSS px × DPR)
export const SPLASH = [
  [375, 667, 2], // SE 2/3
  [390, 844, 3], // 12/13/14, 16e
  [393, 852, 3], // 14 Pro / 15 / 16
  [402, 874, 3], // 16 Pro
  [428, 926, 3], // 12–14 Pro Max / Plus
  [430, 932, 3], // 15/16 Plus / Pro Max
  [440, 956, 3], // 16 Pro Max
]
mkdirSync('public/splash', { recursive: true })
for (const [w, h, d] of SPLASH) await png(splash(w * d, h * d), `public/splash/splash-${w}x${h}@${d}x.png`)
console.log(
  SPLASH.map(
    ([w, h, d]) =>
      `<link rel="apple-touch-startup-image" media="(device-width: ${w}px) and (device-height: ${h}px) and (-webkit-device-pixel-ratio: ${d}) and (orientation: portrait)" href="./splash/splash-${w}x${h}@${d}x.png" />`,
  ).join('\n'),
)

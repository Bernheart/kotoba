// Writes data/VERIFY.md: every vocabulary entry marked with a "verify" note, grouped by lesson.
// Run: node scripts/verify-list.mjs
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'

const dir = 'data/vocab'
const lines = [
  '# Entries to double-check',
  '',
  'All vocabulary in this app was written for it (not copied from Genki). These entries carry a note because',
  'the reading, nuance, translation or lesson placement may differ from your course. Fix them in the app',
  '(Words → tap the word → Edit) or in the JSON file, then delete the `verify` field.',
  '',
]
let n = 0
for (const f of readdirSync(dir).filter((x) => /^lesson-\d+\.json$/.test(x)).sort()) {
  const data = JSON.parse(readFileSync(`${dir}/${f}`, 'utf8'))
  const marked = data.words.filter((w) => w.verify)
  if (!marked.length) continue
  lines.push(`## Lesson ${data.lesson} — ${data.title.en}`, '')
  for (const w of marked) {
    lines.push(`- **${w.japanese}** (${w.kana}) — ${w.en} / ${w.pl}  `, `  ${w.verify}`)
    n++
  }
  lines.push('')
}
lines.splice(6, 0, `**${n} entries** across all lessons.`, '')
writeFileSync('data/VERIFY.md', lines.join('\n'))
console.log(`data/VERIFY.md: ${n} entries`)

/**
 * The vocabulary rules of tests/vocab.test.ts, for one deck word before import:
 * schema, kana-only reading, furigana alignment, example markup with a target and furigana on every kanji.
 */
import { alignsCleanly } from '../../src/lib/jp/furigana'
import { hasKanji, isKanaOnly, normalizeKana } from '../../src/lib/jp/chars'
import { parseMarkup } from '../../src/lib/jp/markup'
import { wordSchema } from '../../src/lib/schema'
import type { Word } from '../../src/lib/types'

export type DeckWord = Omit<Word, 'id' | 'source'>

export function wordProblems(w: DeckWord): string[] {
  const problems: string[] = []
  const r = wordSchema.safeParse({ ...w, id: 'check' })
  if (!r.success) problems.push(...r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`))
  if (!isKanaOnly(w.kana)) problems.push(`kana "${w.kana}" is not kana`)
  if (w.furigana) {
    const s = parseMarkup(w.furigana)
    if (s.plain !== w.japanese) problems.push('furigana override does not spell the word')
    if (normalizeKana(s.kana) !== normalizeKana(w.kana)) problems.push('furigana override reading differs from kana')
  } else if (!alignsCleanly(w.japanese, w.kana)) problems.push(`${w.japanese} / ${w.kana} does not align (add a furigana override)`)
  if (w.example) {
    const s = parseMarkup(w.example.ja)
    if (!s.hasTarget) problems.push('example has no *target*')
    if (/[{|*}]/.test(s.plain)) problems.push('broken example markup')
    for (const seg of s.segs) {
      if (seg.reading && !isKanaOnly(seg.reading)) problems.push(`example reading "${seg.reading}" is not kana`)
      if (!seg.reading && hasKanji(seg.text)) problems.push(`kanji without furigana in "${seg.text}"`)
    }
  }
  return problems
}

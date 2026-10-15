import { hasKanji, normalizeKana } from './jp/chars'
import type { Lang, Word } from './types'
import { foldDiacritics } from './vocab'

export type Verdict = 'correct' | 'almost' | 'wrong'

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  const m = a.length
  const n = b.length
  if (!m) return n
  if (!n) return m
  let prev = Array.from({ length: n + 1 }, (_, j) => j)
  for (let i = 1; i <= m; i++) {
    const cur = [i]
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1))
    }
    prev = cur
  }
  return prev[n]!
}

/** Normalise an English/Polish meaning for comparison. */
export function normMeaning(s: string): string {
  return foldDiacritics(s)
    .replace(/[‘’`]/g, "'")
    .replace(/\(.*?\)/g, ' ')
    .replace(/[…."!?]/g, ' ')
    .replace(/^\s*(to|a|an|the|be)\s+/, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** All accepted meanings: each "; "-separated synonym, also split on "," and "/". */
export function meaningVariants(w: Pick<Word, 'en' | 'pl'>, lang?: Lang): string[] {
  const src = lang === 'en' ? [w.en] : lang === 'pl' ? [w.pl] : [w.en, w.pl]
  const out = new Set<string>()
  for (const s of src) {
    for (const part of (s ?? '').split(/;/)) {
      const n = normMeaning(part)
      if (n) out.add(n)
      for (const sub of part.split(/[,/]/)) {
        const m = normMeaning(sub)
        if (m.length > 1) out.add(m)
      }
    }
  }
  return [...out]
}

/** Typed meaning check. Both languages are accepted; small typos count as "almost". */
export function checkMeaning(input: string, w: Pick<Word, 'en' | 'pl'>): Verdict {
  const v = normMeaning(input)
  if (!v) return 'wrong'
  const variants = meaningVariants(w)
  if (variants.includes(v)) return 'correct'
  for (const c of variants) {
    const d = levenshtein(v, c)
    if ((c.length >= 5 && d <= 1) || (c.length >= 9 && d <= 2)) return 'almost'
  }
  return 'wrong'
}

/** Typed Japanese check: kana (any script, long-vowel insensitive), the written form, or listed alternatives. */
export function checkJapanese(input: string, w: Pick<Word, 'japanese' | 'kana' | 'alt'>): Verdict {
  const raw = input.trim().replace(/[～〜~\s]/g, '')
  if (!raw) return 'wrong'
  const strip = (s: string) => s.replace(/[～〜~\s]/g, '')
  if (raw === strip(w.japanese)) return 'correct'
  if ((w.alt ?? []).some((a) => strip(a) === raw)) return 'correct'
  const k = normalizeKana(raw)
  if (hasKanji(raw)) return 'wrong'
  if (k === normalizeKana(w.kana)) return 'correct'
  if ((w.alt ?? []).some((a) => normalizeKana(a) === k)) return 'correct'
  // dropped/extra small っ or long vowel is a near miss
  const target = normalizeKana(w.kana)
  if (target.length >= 4 && levenshtein(k, target) === 1) return 'almost'
  return 'wrong'
}

export function checkKanaString(input: string, expected: string): Verdict {
  const a = normalizeKana(input)
  const b = normalizeKana(expected)
  if (!a) return 'wrong'
  if (a === b) return 'correct'
  return 'wrong'
}

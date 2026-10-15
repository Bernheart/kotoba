import { escapeRegExp, hasKanji, isKanji, kataToHira } from './chars'

export interface Seg {
  text: string
  reading?: string
  target?: boolean
}

/**
 * Split a written form into ruby segments using its reading, so okurigana stays bare:
 * 食べる / たべる → [食(た)][べる]. Falls back to one ruby over the whole word when the
 * kana runs can't be matched (jukujikun like 今日, irregular readings).
 */
export function alignFurigana(text: string, reading: string): Seg[] {
  if (!hasKanji(text) || !reading) return [{ text }]
  const runs: { text: string; kanji: boolean }[] = []
  for (const ch of text) {
    const k = isKanji(ch)
    const last = runs.at(-1)
    if (last && last.kanji === k) last.text += ch
    else runs.push({ text: ch, kanji: k })
  }
  if (runs.length === 1) return [{ text, reading }]
  const pattern = runs.map((r) => (r.kanji ? '(.+?)' : `(${escapeRegExp(kataToHira(r.text))})`)).join('')
  const m = new RegExp(`^${pattern}$`, 'u').exec(kataToHira(reading))
  if (!m) return [{ text, reading }]
  return runs.map((r, i) => (r.kanji ? { text: r.text, reading: m[i + 1] } : { text: r.text }))
}

/** True when alignment produced per-kanji readings (used by the data validator). */
export function alignsCleanly(text: string, reading: string): boolean {
  const segs = alignFurigana(text, reading)
  return segs.length > 1 || !hasKanji(text) || segs[0]!.text.split('').every(isKanji)
}

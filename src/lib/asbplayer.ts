import type { WordProgress } from './progress'
import type { Word } from './types'

/** A deck of character / place names (e.g. `arcane-names`, made by tools/arcane). */
export const isNamesDeck = (deck?: string) => !!deck && deck.endsWith('-names')

/**
 * Words you have studied (learning or known), one written form per line: the plain-text format of
 * asbplayer's Settings → Annotation → My word database → Import Words. asbplayer runs each line through
 * Yomitan (dictionary forms), then colours the words in subtitles and shows how much of an episode you know.
 * Names are left out: they aren't dictionary words, so Yomitan would split them into pieces (ヘクスコア →
 * クスコ, ア…) and those pieces would be marked as known.
 */
export function asbplayerWords(words: Pick<Word, 'id' | 'japanese' | 'deck'>[], progress: Map<string, WordProgress>): string[] {
  const out = new Set<string>()
  for (const w of words) {
    if (isNamesDeck(w.deck)) continue
    const status = progress.get(w.id)?.status
    if (status !== 'learning' && status !== 'known') continue
    const form = w.japanese.replace(/[～〜]/g, '').trim()
    if (form) out.add(form)
  }
  return [...out]
}

export function asbplayerFile(lines: string[], now = new Date()): File {
  const day = now.toISOString().slice(0, 10)
  return new File([lines.join('\n') + '\n'], `kotoba-known-words-${day}.txt`, { type: 'text/plain' })
}

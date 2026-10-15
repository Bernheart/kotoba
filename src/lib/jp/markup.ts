import { alignFurigana, type Seg } from './furigana'

/**
 * Sentence markup used in example sentences:
 *   {毎日|まいにち} {日本語|にほんご}を *{勉強|べんきょう}します* 。
 * - `{base|reading}` → ruby (auto-aligned, so `{食べます|たべます}` keeps べます bare)
 * - ASCII spaces → tile boundaries for the sentence builder (not rendered)
 * - `*…*` → the target word (blanked in cloze cards)
 */

export interface Chunk {
  segs: Seg[]
  text: string
  kana: string
  target: boolean
}

export interface Sentence {
  chunks: Chunk[]
  segs: Seg[]
  plain: string
  kana: string
  hasTarget: boolean
}

const PUNCT_ONLY = /^[。、！？!?「」『』…—\-・〜～\s]+$/u

function pushText(segs: Seg[], text: string, target: boolean) {
  const last = segs.at(-1)
  if (last && !last.reading && !!last.target === target) last.text += text
  else segs.push(target ? { text, target } : { text })
}

function finishChunk(segs: Seg[]): Chunk {
  return {
    segs,
    text: segs.map((s) => s.text).join(''),
    kana: segs.map((s) => s.reading ?? s.text).join(''),
    target: segs.some((s) => s.target),
  }
}

export function parseMarkup(src: string): Sentence {
  const rawChunks: Seg[][] = [[]]
  let target = false
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]!
    if (ch === '*') {
      target = !target
    } else if (ch === ' ') {
      if (rawChunks.at(-1)!.length) rawChunks.push([])
    } else if (ch === '{') {
      const end = src.indexOf('}', i)
      if (end < 0) {
        pushText(rawChunks.at(-1)!, src.slice(i), target)
        break
      }
      const [base = '', reading = ''] = src.slice(i + 1, end).split('|')
      for (const s of alignFurigana(base, reading)) {
        if (s.reading) rawChunks.at(-1)!.push(target ? { ...s, target } : s)
        else pushText(rawChunks.at(-1)!, s.text, target)
      }
      i = end
    } else {
      pushText(rawChunks.at(-1)!, ch, target)
    }
  }
  const chunks: Chunk[] = []
  for (const segs of rawChunks.filter((c) => c.length)) {
    const c = finishChunk(segs)
    // Punctuation never becomes its own tile: glue it to the previous chunk.
    if (PUNCT_ONLY.test(c.text) && chunks.length) {
      const prev = chunks.pop()!
      chunks.push(finishChunk([...prev.segs, ...segs]))
    } else chunks.push(c)
  }
  const segs = chunks.flatMap((c) => c.segs)
  return {
    chunks,
    segs,
    plain: chunks.map((c) => c.text).join(''),
    kana: chunks.map((c) => c.kana).join(''),
    hasTarget: chunks.some((c) => c.target),
  }
}

/** Anki-style `日本語[にほんご]` → `{日本語|にほんご}` (base = kanji run before the bracket). */
export function fromAnkiFurigana(s: string): string {
  return s.replace(/([㐀-鿿々〆ヶ]+)\[([^\]]+)\]/g, '{$1|$2}')
}

export function stripMarkup(src: string): string {
  return parseMarkup(src).plain
}

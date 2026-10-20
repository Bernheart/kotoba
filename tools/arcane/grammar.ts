/**
 * Grammar points for the "grammar" deck: sentence endings (〜ぞ, 〜わ, 〜んだ…) and patterns beyond Genki 1–10
 * (〜たい, 〜べき, 〜ため…). Each point finds its token ranges in a tokenized line, so the miner can count it,
 * pick an example line and mark the grammar as the cloze target.
 */
import type { WordType } from '../../src/lib/types'
import type { Tok } from './mine'

/** Token indices `[start, end)` */
export type Range = [number, number]

export interface GrammarPoint {
  /** Written form, also the key of the meanings file: 〜べき */
  japanese: string
  /** Reading in kana (the same for kana-only points) */
  kana: string
  type: WordType
  kind: 'ending' | 'pattern'
  /** Genki lesson that teaches it, if any */
  genki?: number
  find(toks: Tok[]): Range[]
}

const isSpace = (t: Tok) => t.pos === '記号' && /^\s+$/u.test(t.surface)
/** Token `i` ends a sentence: only punctuation follows before the next space (subtitles separate sentences with spaces). */
function endsSentence(toks: Tok[], i: number): boolean {
  for (let j = i + 1; j < toks.length; j++) {
    if (isSpace(toks[j]!)) return true
    if (toks[j]!.pos !== '記号') return false
  }
  return true
}

type Pred = (t: Tok, i: number, toks: Tok[]) => boolean
/** Every token matching `pred`, widened `before` tokens back and `after` tokens forward. */
const each =
  (pred: Pred, widen: (i: number, toks: Tok[]) => Range = (i) => [i, i + 1]) =>
  (toks: Tok[]): Range[] =>
    toks.flatMap((t, i) => (pred(t, i, toks) ? [widen(i, toks)] : []))

/** Matches of a regex over the line, as the ranges of tokens they overlap. */
function regex(re: RegExp) {
  return (toks: Tok[]): Range[] => {
    const starts: number[] = []
    let pos = 0
    for (const t of toks) {
      starts.push(pos)
      pos += t.surface.length
    }
    const text = toks.map((t) => t.surface).join('')
    const out: Range[] = []
    for (const m of text.matchAll(new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g'))) {
      const a = m.index!
      const b = a + m[0].length
      let s = starts.findIndex((st, i) => st + toks[i]!.surface.length > a)
      let e = starts.findIndex((st) => st >= b)
      if (s < 0) continue
      if (e < 0) e = toks.length
      out.push([s, e])
    }
    return out
  }
}

const final = (surface: string | string[]) =>
  each((t, i, toks) => t.pos === '助詞' && t.pos1 === '終助詞' && ([] as string[]).concat(surface).includes(t.surface) && endsSentence(toks, i))
/** Include a preceding て/で (the te-form glue) in the range. */
const withTe = (i: number, toks: Tok[]): Range => [i > 0 && /^[てで]$/.test(toks[i - 1]!.surface) ? i - 1 : i, i + 1]
const nonIndependent = (bases: string[]): Pred => (t) => (t.pos === '動詞' || t.pos === '形容詞') && t.pos1 === '非自立' && bases.includes(t.base)
/** Extend a range over particles/auxiliaries that complete it (ため+に, せい+で). */
const plusNext =
  (next: string[]) =>
  (i: number, toks: Tok[]): Range =>
    [i, toks[i + 1] && next.includes(toks[i + 1]!.surface) ? i + 2 : i + 1]

export const GRAMMAR: GrammarPoint[] = [
  // ---- sentence endings
  {
    japanese: '〜な', kana: '〜な', type: 'particle', kind: 'ending',
    // emphatic / musing な — not after a verb's dictionary form, which is the prohibition 〜るな
    find: each((t, i, toks) => t.pos === '助詞' && t.pos1 === '終助詞' && /^なあ?$/.test(t.surface) && endsSentence(toks, i) && !(toks[i - 1]?.pos === '動詞' && toks[i - 1]?.cform === '基本形') && toks[i - 1]?.surface !== 'か'),
  },
  {
    japanese: '〜るな', kana: '〜るな', type: 'particle', kind: 'ending',
    find: each((t, i, toks) => t.pos === '助詞' && t.surface === 'な' && toks[i - 1]?.pos === '動詞' && toks[i - 1]?.cform === '基本形', (i) => [i - 1, i + 1]),
  },
  { japanese: '〜の', kana: '〜の', type: 'particle', kind: 'ending', find: final('の') },
  { japanese: '〜わ', kana: '〜わ', type: 'particle', kind: 'ending', find: final(['わ', 'わよ', 'わね']) },
  { japanese: '〜ぞ', kana: '〜ぞ', type: 'particle', kind: 'ending', find: final('ぞ') },
  { japanese: '〜さ', kana: '〜さ', type: 'particle', kind: 'ending', find: final('さ') },
  { japanese: '〜ぜ', kana: '〜ぜ', type: 'particle', kind: 'ending', find: final('ぜ') },
  {
    japanese: '〜かな', kana: '〜かな', type: 'particle', kind: 'ending',
    find: each((t, i, toks) => t.surface === 'か' && t.pos === '助詞' && /^なあ?$/.test(toks[i + 1]?.surface ?? '') && endsSentence(toks, i + 1), (i) => [i, i + 2]),
  },
  {
    japanese: '〜んだ', kana: '〜んだ', type: 'expression', kind: 'ending', genki: 12,
    find: each((t, i, toks) => (t.surface === 'ん' || t.surface === 'の') && t.pos === '名詞' && t.pos1 === '非自立' && /^(だ|です)$/.test(toks[i + 1]?.surface ?? ''), (i) => [i, i + 2]),
  },
  {
    japanese: '〜だろう・〜でしょう', kana: '〜だろう・〜でしょう', type: 'expression', kind: 'ending', genki: 12,
    find: each((t) => t.pos === '助動詞' && /^(だろ|だろう|でしょ|でしょう)$/.test(t.surface), plusNext(['う'])),
  },
  { japanese: '〜てる', kana: '〜てる', type: 'expression', kind: 'ending', find: each(nonIndependent(['てる', 'でる']), (i) => [i, i + 1]) },

  // ---- patterns
  { japanese: '〜られる・〜れる', kana: '〜られる・〜れる', type: 'expression', kind: 'pattern', genki: 21, find: each((t) => t.pos === '動詞' && t.pos1 === '接尾' && /^(れる|られる)$/.test(t.base)) },
  { japanese: '〜させる・〜せる', kana: '〜させる・〜せる', type: 'expression', kind: 'pattern', genki: 22, find: each((t) => t.pos === '動詞' && t.pos1 === '接尾' && /^(せる|させる)$/.test(t.base)) },
  { japanese: '〜たい', kana: '〜たい', type: 'expression', kind: 'pattern', genki: 11, find: each((t) => t.pos === '助動詞' && t.base === 'たい') },
  {
    japanese: '〜ば', kana: '〜ば', type: 'particle', kind: 'pattern', genki: 22,
    find: each((t, i, toks) => t.pos === '助詞' && t.pos1 === '接続助詞' && t.surface === 'ば' && toks[i - 1]?.surface !== 'ね', (i) => [Math.max(0, i - 1), i + 1]),
  },
  { japanese: '〜なら', kana: '〜なら', type: 'expression', kind: 'pattern', genki: 13, find: each((t) => t.pos === '助動詞' && t.surface === 'なら') },
  { japanese: '〜ため', kana: '〜ため', type: 'expression', kind: 'pattern', find: each((t) => t.surface === 'ため' && t.pos === '名詞', plusNext(['に', 'の', 'だ'])) },
  { japanese: '〜と', kana: '〜と', type: 'particle', kind: 'pattern', genki: 18, find: each((t) => t.pos === '助詞' && t.pos1 === '接続助詞' && t.surface === 'と') },
  {
    japanese: '〜よう・〜おう', kana: '〜よう・〜おう', type: 'expression', kind: 'pattern', genki: 15,
    find: each((t, i, toks) => t.pos === '助動詞' && (t.base === 'う' || t.base === 'よう') && toks[i - 1]?.pos === '動詞', (i) => [i - 1, i + 1]),
  },
  { japanese: '〜てくれる', kana: '〜てくれる', type: 'expression', kind: 'pattern', genki: 16, find: each(nonIndependent(['くれる']), withTe) },
  { japanese: '〜たら', kana: '〜たら', type: 'expression', kind: 'pattern', genki: 17, find: each((t) => t.pos === '助動詞' && /^(たら|だら)$/.test(t.surface)) },
  { japanese: '〜べき', kana: '〜べき', type: 'expression', kind: 'pattern', find: each((t) => t.surface === 'べき' || t.surface === 'べく') },
  { japanese: '〜かもしれない', kana: '〜かもしれない', type: 'expression', kind: 'pattern', genki: 14, find: regex(/かも(しれ(ない|ません|ねえ|ん))?/) },
  { japanese: '〜しかない', kana: '〜しかない', type: 'expression', kind: 'pattern', find: regex(/しか(ない|ありません|ねえ|なかった)/) },
  { japanese: '〜はず', kana: '〜はず', type: 'expression', kind: 'pattern', genki: 19, find: each((t) => t.surface === 'はず' && t.pos === '名詞') },
  {
    japanese: '〜ても', kana: '〜ても', type: 'expression', kind: 'pattern', genki: 23,
    find: each((t, i, toks) => t.pos === '助詞' && t.pos1 === '接続助詞' && /^[てで]$/.test(t.surface) && toks[i + 1]?.surface === 'も' && toks[i + 1]?.pos === '助詞', (i) => [i, i + 2]),
  },
  { japanese: '〜のに', kana: '〜のに', type: 'particle', kind: 'pattern', genki: 22, find: each((t) => t.pos === '助詞' && t.pos1 === '接続助詞' && t.surface === 'のに') },
  {
    japanese: '〜てしまう・〜ちゃう', kana: '〜てしまう・〜ちゃう', type: 'expression', kind: 'pattern', genki: 18,
    find: each((t) => t.pos === '動詞' && t.pos1 === '非自立' && (/^(しまう|ちゃう|じゃう|ちまう|じまう)$/.test(t.base) || /^(ちゃ|じゃ|ちま)/.test(t.surface)), withTe),
  },
  { japanese: '〜間に', kana: '〜あいだに', type: 'expression', kind: 'pattern', genki: 21, find: each((t) => t.surface === '間' && t.reading === 'アイダ', plusNext(['に', 'は'])) },
  { japanese: '〜みたい', kana: '〜みたい', type: 'expression', kind: 'pattern', genki: 17, find: each((t) => t.surface === 'みたい') },
  { japanese: '〜せいで', kana: '〜せいで', type: 'expression', kind: 'pattern', find: each((t, i, toks) => t.surface === 'せい' && t.pos === '名詞' && /^(で|だ|じゃ)$/.test(toks[i + 1]?.surface ?? ''), (i) => [i, i + 2]) },
  { japanese: '〜なきゃ・〜なければ', kana: '〜なきゃ・〜なければ', type: 'expression', kind: 'pattern', genki: 12, find: regex(/なきゃ|なければ|なけりゃ|なくちゃ/) },
  { japanese: '〜ずに', kana: '〜ずに', type: 'expression', kind: 'pattern', find: each((t) => t.pos === '助動詞' && t.base === 'ぬ' && t.surface === 'ず', plusNext(['に'])) },
  { japanese: '〜ような・〜ようだ', kana: '〜ような・〜ようだ', type: 'expression', kind: 'pattern', genki: 22, find: each((t, i, toks) => t.surface === 'よう' && t.pos === '名詞' && /^(な|だ|です|で)$/.test(toks[i + 1]?.surface ?? ''), (i) => [i, i + 2]) },
  { japanese: '〜ように', kana: '〜ように', type: 'expression', kind: 'pattern', genki: 21, find: each((t, i, toks) => t.surface === 'よう' && t.pos === '名詞' && toks[i + 1]?.surface === 'に', (i) => [i, i + 2]) },
  { japanese: '〜すぎる', kana: '〜すぎる', type: 'expression', kind: 'pattern', genki: 12, find: each(nonIndependent(['すぎる', '過ぎる'])) },
  { japanese: '〜として', kana: '〜として', type: 'particle', kind: 'pattern', find: each((t) => t.surface === 'として' && t.pos === '助詞') },
  { japanese: '〜ないと', kana: '〜ないと', type: 'expression', kind: 'pattern', genki: 12, find: regex(/ないと(?=$|[\s　？！?!…、])/) },
  { japanese: '〜らしい', kana: '〜らしい', type: 'expression', kind: 'pattern', find: each((t) => t.pos === '助動詞' && t.base === 'らしい') },
  { japanese: '〜そう', kana: '〜そう', type: 'expression', kind: 'pattern', genki: 13, find: each((t) => t.surface === 'そう' && t.pos === '名詞' && t.pos1 === '接尾') },
  { japanese: '〜ておく', kana: '〜ておく', type: 'expression', kind: 'pattern', genki: 15, find: each(nonIndependent(['おく', 'とく', 'どく']), withTe) },
  { japanese: '〜てみる', kana: '〜てみる', type: 'expression', kind: 'pattern', genki: 13, find: each(nonIndependent(['みる']), withTe) },
  { japanese: '〜わけ', kana: '〜わけ', type: 'expression', kind: 'pattern', find: each((t) => (t.surface === 'わけ' || t.surface === '訳') && t.pos === '名詞' && t.pos1 === '非自立') },
  { japanese: '〜なさい', kana: '〜なさい', type: 'expression', kind: 'pattern', genki: 22, find: each((t) => t.surface === 'なさい') },
  { japanese: '〜ほど', kana: '〜ほど', type: 'particle', kind: 'pattern', find: each((t) => t.surface === 'ほど' && t.pos === '助詞') },
  { japanese: '〜について', kana: '〜について', type: 'particle', kind: 'pattern', find: each((t) => t.surface === 'について' && t.pos === '助詞') },
  { japanese: '〜ねば', kana: '〜ねば', type: 'expression', kind: 'pattern', find: each((t, i, toks) => t.pos === '助動詞' && t.base === 'ぬ' && t.surface === 'ね' && toks[i + 1]?.surface === 'ば', (i) => [i, i + 2]) },
  { japanese: '〜てほしい', kana: '〜てほしい', type: 'expression', kind: 'pattern', genki: 21, find: each(nonIndependent(['ほしい', '欲しい']), withTe) },
]

/** All grammar points found in a line: point → its ranges. */
export function findGrammar(toks: Tok[]): Map<string, Range[]> {
  const out = new Map<string, Range[]>()
  for (const g of GRAMMAR) {
    const r = g.find(toks).filter(([s, e]) => s >= 0 && e > s && e <= toks.length)
    if (r.length) out.set(g.japanese, r)
  }
  return out
}

/**
 * Word mining for a custom deck: token filtering, ranking by frequency × episode spread, the coverage
 * report, one unique example line per word, and Kotoba sentence markup. Pure functions over tokenizer
 * output (kuromoji / IPADIC features), so they're testable with made-up fixtures.
 */
import { hasKanji, isKanaOnly, isKatakanaWord, kataToHira, normalizeKana } from '../../src/lib/jp/chars'
import type { WordType } from '../../src/lib/types'

/** The tokenizer features we use (kuromoji's IpadicFeatures, renamed). */
export interface Tok {
  surface: string
  /** 品詞 and its details */
  pos: string
  pos1: string
  pos2: string
  /** 活用型, e.g. 五段・カ行促音便 / 一段 / サ変・スル */
  ctype: string
  /** Dictionary form (falls back to the surface) */
  base: string
  /** Reading of the surface in katakana ('' when unknown) */
  reading: string
}

export interface KuromojiToken {
  surface_form: string
  pos: string
  pos_detail_1: string
  pos_detail_2: string
  conjugated_type: string
  basic_form: string
  reading?: string
}

export function fromKuromoji(t: KuromojiToken): Tok {
  // IPADIC reads 行っ(て/た) as 行う (おこなう); in speech it is almost always 行く (いく)
  if (t.surface_form === '行っ' && t.basic_form === '行う')
    return { surface: '行っ', pos: '動詞', pos1: '自立', pos2: '*', ctype: '五段・カ行促音便', base: '行く', reading: 'イッ' }
  // いい read as 言う (どうでもいい) is the adjective いい
  if (t.surface_form === 'いい' && t.basic_form === 'いう')
    return { surface: 'いい', pos: '形容詞', pos1: '自立', pos2: '*', ctype: '形容詞・イイ', base: 'いい', reading: 'イイ' }
  // いる conjugated as a godan verb (いらない, いります) is 要る "to need", not いる "to be"
  if (t.basic_form === 'いる' && t.conjugated_type.startsWith('五段'))
    return { surface: t.surface_form, pos: t.pos, pos1: t.pos_detail_1, pos2: t.pos_detail_2, ctype: t.conjugated_type, base: '要る', reading: t.reading ?? '' }
  return {
    surface: t.surface_form,
    pos: t.pos,
    pos1: t.pos_detail_1,
    pos2: t.pos_detail_2,
    ctype: t.conjugated_type,
    base: t.basic_form && t.basic_form !== '*' ? t.basic_form : t.surface_form,
    reading: t.reading && t.reading !== '*' ? t.reading : '',
  }
}

/** Tokenizer artefacts of casual speech (～てる, ～ちゃう, ～ねえ …) that aren't words of their own. */
export const STOP_LEMMAS = new Set(['てる', 'でる', 'ちゃう', 'じゃう', 'とく', 'どく', 'ん', 'っ', 'じゃ', 'ちゃ', 'ねえ', 'ねぇ', 'す', 'つう', 'って', 'てか', 'やる', 'さ'])

/** Grammar you know from Genki that the tokenizer reports as words (ない as an adjective, よい = いい). */
export const KNOWN_GRAMMAR = ['ない', 'よい', 'いい', 'する', 'ある', 'いる', 'なる']

/** Slang adjectives written in katakana (ヤバい) confuse the tokenizer; read them in hiragana. */
export function normalizeSlang(text: string): string {
  return text.replace(/(ヤバ|マズ|スゴ|ウマ|ダサ|キモ|ウザ|エグ|ムカ)(?=[いくかけさそ])|イカ(?=れ)/gu, (m) => [...m].map((c) => String.fromCodePoint(c.codePointAt(0)! - 0x60)).join(''))
}

/**
 * Join a noun with a following one-kanji suffix into one word (評議+会 → 評議会, 科学+者, 可能+性, 科学+的),
 * which is what you'd look up and learn. Counters and name suffixes (人, さん, たち) stay separate.
 */
export function mergeCompounds(toks: Tok[]): Tok[] {
  const out: Tok[] = []
  for (const t of toks) {
    const prev = out.at(-1)
    if (
      prev &&
      prev.pos === '名詞' &&
      ['一般', 'サ変接続', '形容動詞語幹'].includes(prev.pos1) &&
      t.pos === '名詞' &&
      t.pos1 === '接尾' &&
      ['一般', '形容動詞語幹', 'サ変接続'].includes(t.pos2) &&
      /^[\p{Script=Han}]$/u.test(t.surface)
    ) {
      out[out.length - 1] = {
        ...prev,
        surface: prev.surface + t.surface,
        base: prev.base + t.base,
        reading: prev.reading && t.reading ? prev.reading + t.reading : '',
        pos1: t.pos2 === '形容動詞語幹' ? '形容動詞語幹' : '一般',
      }
    } else out.push(t)
  }
  return out
}

/** Casual verbs IPADIC lacks: いかれる "to be crazy" is read as 行か + れる (passive of 行く). */
export function fixSlangVerbs(toks: Tok[]): Tok[] {
  const out: Tok[] = []
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i]!
    const next = toks[i + 1]
    if (t.surface === 'いか' && (t.base === '行く' || t.base === 'いく') && next?.base === 'れる') {
      out.push({ surface: 'いかれ', pos: '動詞', pos1: '自立', pos2: '*', ctype: '一段', base: 'いかれる', reading: 'イカレ' })
      i++
    } else out.push(t)
  }
  return out
}

/** Names the tokenizer splits (マイ+ロ) are joined back when the pieces spell a name from the list. */
export function joinNames(toks: Tok[], names: Set<string>): Tok[] {
  const out: Tok[] = []
  for (let i = 0; i < toks.length; i++) {
    let n = 3
    while (n >= 2 && !(i + n <= toks.length && names.has(toks.slice(i, i + n).map((t) => t.surface).join('')))) n--
    if (n < 2) {
      out.push(toks[i]!)
      continue
    }
    const part = toks.slice(i, i + n)
    const surface = part.map((t) => t.surface).join('')
    out.push({ surface, pos: '名詞', pos1: '固有名詞', pos2: '*', ctype: '*', base: surface, reading: part.map((t) => t.reading || t.surface).join('') })
    i += n - 1
  }
  return out
}

export type TokClass = 'content' | 'grammar' | 'name' | 'number' | 'symbol'

const CONTENT_POS = new Set(['名詞', '動詞', '形容詞', '副詞', '連体詞', '接続詞', '感動詞'])
const JP = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u

/** What a token counts as: a word to learn (content), grammar, a name, a number or punctuation. */
export function classify(t: Tok, names: Set<string> = new Set()): TokClass {
  if (t.pos === '記号' || !JP.test(t.surface)) return /\p{N}/u.test(t.surface) ? 'number' : 'symbol'
  if (/\p{N}/u.test(t.surface)) return 'number' // １つ, ２人
  if (t.pos === '名詞' && t.pos1 === '固有名詞') return 'name'
  // a name, also with a one-kanji suffix merged on (メダルダ家)
  if (names.has(t.base) || names.has(t.surface) || (hasKanji(t.base.slice(-1)) && names.has(t.base.slice(0, -1)))) return 'name'
  if (t.pos === '名詞' && t.pos1 === '数') return 'number'
  if (!CONTENT_POS.has(t.pos)) return 'grammar'
  if (t.pos === '名詞' && ['非自立', '接尾', '特殊'].includes(t.pos1)) return 'grammar'
  if ((t.pos === '動詞' || t.pos === '形容詞') && t.pos1 !== '自立') return 'grammar'
  if (STOP_LEMMAS.has(t.base) || !JP.test(t.base)) return 'grammar'
  return 'content'
}

/** Kotoba word type from the tokenizer's part of speech and conjugation type. */
export function typeOf(t: Pick<Tok, 'pos' | 'pos1' | 'ctype'>): WordType {
  if (t.pos === '動詞') {
    if (t.ctype.startsWith('五段')) return 'verb-u'
    if (t.ctype.startsWith('一段')) return 'verb-ru'
    return 'verb-irr' // サ変 / カ変
  }
  if (t.pos === '形容詞') return 'i-adj'
  if (t.pos === '副詞') return 'adverb'
  if (t.pos === '接続詞') return 'conjunction'
  if (t.pos === '感動詞' || t.pos === '連体詞') return 'expression'
  if (t.pos1 === '代名詞') return 'pronoun'
  if (t.pos1 === '形容動詞語幹') return 'na-adj'
  return 'noun'
}

/* ---------- Known words ---------- */

export interface KnownSet {
  /** Written forms (and dictionary forms of their tokens) of words you already have */
  forms: Set<string>
  /** Normalized kana of all known words */
  kana: Set<string>
  /** Normalized kana of known words written in kana only (match any spelling) */
  kanaWords: Set<string>
}

export function knownSet(words: { japanese: string; kana: string; alt?: string[] }[], extraForms: Iterable<string> = []): KnownSet {
  const k: KnownSet = { forms: new Set(extraForms), kana: new Set(), kanaWords: new Set() }
  for (const w of words) {
    const jp = w.japanese.replace(/[～〜]/g, '')
    k.forms.add(jp)
    for (const a of w.alt ?? []) k.forms.add(a.replace(/[～〜]/g, ''))
    const kana = normalizeKana(w.kana)
    k.kana.add(kana)
    // hiragana words match any spelling with the same reading; katakana loanwords (クラス) don't match kanji (暮らす)
    if (isKanaOnly(jp) && !isKatakanaWord(jp)) k.kanaWords.add(kana)
  }
  return k
}

/**
 * Known when the written form matches, when the subtitle writes it in kana and the reading matches any
 * known word, or when you know it as a kana-only word with the same reading.
 */
export function isKnown(lemma: { japanese: string; kana: string }, k: KnownSet): boolean {
  if (k.forms.has(lemma.japanese)) return true
  const kana = normalizeKana(lemma.kana)
  if (isKanaOnly(lemma.japanese) && (k.kana.has(kana) || k.forms.has(kataToHira(lemma.japanese)))) return true
  return k.kanaWords.has(kana)
}

/**
 * The known word a lemma belongs to (for a deck of known words seen in the show). Same rules as `isKnown`:
 * written form (also forms of its tokens, 一緒 → 一緒に, and alternative spellings), or the reading when either
 * side is written in kana.
 */
export function knownIndex<W extends { japanese: string; kana: string; alt?: string[] }>(words: W[], tokenForms: [string, W][] = []) {
  const byForm = new Map<string, W>()
  const byKana = new Map<string, W[]>()
  const plain = (s: string) => s.replace(/[～〜]/g, '')
  for (const w of words) {
    if (!byForm.has(plain(w.japanese))) byForm.set(plain(w.japanese), w)
    for (const a of w.alt ?? []) if (!byForm.has(a)) byForm.set(a, w)
    const k = normalizeKana(w.kana)
    byKana.set(k, [...(byKana.get(k) ?? []), w])
  }
  for (const [f, w] of tokenForms) if (!byForm.has(f)) byForm.set(f, w)
  return (l: { japanese: string; kana: string }): W | undefined => {
    const hit = byForm.get(l.japanese) ?? byForm.get(kataToHira(l.japanese))
    if (hit) return hit
    const same = byKana.get(normalizeKana(l.kana)) ?? []
    const kanaWord = same.find((w) => isKanaOnly(plain(w.japanese)) && !isKatakanaWord(plain(w.japanese)))
    if (isKanaOnly(l.japanese)) return kanaWord ?? (same.length === 1 ? same[0] : undefined)
    return kanaWord
  }
}

/* ---------- Lines, ranking and coverage ---------- */

export interface Line {
  id: number
  ep: string
  start: number
  text: string
  toks: Tok[]
  ref: string
}

export interface Lemma {
  key: string
  japanese: string
  kana: string
  type: WordType
}

export interface WordStat extends Lemma {
  count: number
  episodes: string[]
  score: number
}

/** Lemma of a content token. `readingOf` gives the reading of a dictionary form (tokenizer lookup). */
export function lemmaOf(t: Tok, readingOf: (base: string, t: Tok) => string): Lemma {
  const kana = t.base === t.surface ? kataToHira(t.reading || t.surface) : readingOf(t.base, t)
  return { key: t.base, japanese: t.base, kana, type: typeOf(t) }
}

/** Reading of a dictionary form from a conjugated token: swap the surface's kana ending for the base's. */
export function guessBaseReading(t: Tok): string {
  const surf = t.surface
  const base = t.base
  let i = 0
  while (i < surf.length && i < base.length && surf[i] === base[i]) i++
  const surfTail = kataToHira(surf.slice(i))
  const reading = kataToHira(t.reading || surf)
  if (!reading.endsWith(surfTail)) return kataToHira(base)
  return reading.slice(0, reading.length - surfTail.length) + kataToHira(base.slice(i))
}

/**
 * Count content words. Score = occurrences × number of episodes the word appears in,
 * so a word spread over the series beats a one-episode spike.
 */
export function rankWords(lines: Line[], lemma: (t: Tok) => Lemma | null): WordStat[] {
  const stats = new Map<string, WordStat & { eps: Set<string> }>()
  for (const line of lines) {
    for (const t of line.toks) {
      const l = lemma(t)
      if (!l) continue
      let s = stats.get(l.key)
      if (!s) {
        s = { ...l, count: 0, episodes: [], score: 0, eps: new Set() }
        stats.set(l.key, s)
      }
      s.count++
      s.eps.add(line.ep)
    }
  }
  return [...stats.values()]
    .map(({ eps, ...s }) => ({ ...s, episodes: [...eps].sort(), score: s.count * eps.size }))
    .sort((a, b) => b.score - a.score || b.count - a.count || a.key.localeCompare(b.key, 'ja'))
}

export interface Coverage {
  tokens: number
  known: number
  content: number
  contentKnown: number
  /** Coverage after learning the top N new words, for each N */
  gains: { n: number; pct: number; contentPct: number }[]
}

/**
 * Share of spoken tokens you already know. Grammar, names and numbers count as known; punctuation isn't counted.
 * `newWords` are the ranked unknown words.
 */
export function coverage(lines: Line[], cls: (t: Tok) => TokClass, knownContent: (t: Tok) => boolean, newWords: WordStat[], cutoffs = [100, 200, 300, 500]): Coverage {
  let tokens = 0
  let known = 0
  let content = 0
  let contentKnown = 0
  for (const line of lines)
    for (const t of line.toks) {
      const c = cls(t)
      if (c === 'symbol') continue
      tokens++
      if (c !== 'content') known++
      else {
        content++
        if (knownContent(t)) {
          known++
          contentKnown++
        }
      }
    }
  const pct = (a: number, b: number) => (b ? (a / b) * 100 : 0)
  const gains = cutoffs.map((n) => {
    const add = newWords.slice(0, n).reduce((s, w) => s + w.count, 0)
    return { n, pct: pct(known + add, tokens), contentPct: pct(contentKnown + add, content) }
  })
  return { tokens, known, content, contentKnown, gains }
}

/* ---------- Episode prep ---------- */

/** `S1E2` → `s1e02` (a tag that sorts in episode order) */
export function episodeTag(ep: string): string {
  const m = /S(\d+)E(\d+)/i.exec(ep)
  return m ? `s${Number(m[1])}e${m[2]!.padStart(2, '0')}` : ep.toLowerCase()
}

/**
 * Prep lists: per episode, the deck words most characteristic of it — said at least `minCount` times in
 * that episode, scored by count × log(episodes / episodes the word appears in), so words spoken in every
 * episode (learned first anyway) don't fill every list. Returns word → the episodes whose list it is in.
 */
export function episodePrep(
  lines: Pick<Line, 'ep' | 'toks'>[],
  keyOf: (t: Tok) => string | null,
  deckKeys: string[],
  opts: { perEpisode?: number; minCount?: number } = {},
): Map<string, string[]> {
  const perEpisode = opts.perEpisode ?? 20
  const minCount = opts.minCount ?? 2
  const rank = new Map(deckKeys.map((k, i) => [k, i]))
  const counts = new Map<string, Map<string, number>>()
  for (const l of lines)
    for (const t of l.toks) {
      const k = keyOf(t)
      if (k === null || !rank.has(k)) continue
      const m = counts.get(l.ep) ?? new Map<string, number>()
      m.set(k, (m.get(k) ?? 0) + 1)
      counts.set(l.ep, m)
    }
  const eps = counts.size
  const spread = new Map<string, number>()
  for (const m of counts.values()) for (const k of m.keys()) spread.set(k, (spread.get(k) ?? 0) + 1)
  const out = new Map<string, string[]>()
  for (const ep of [...counts.keys()].sort((a, b) => episodeTag(a).localeCompare(episodeTag(b)))) {
    const scored = [...counts.get(ep)!]
      .filter(([, n]) => n >= minCount)
      .map(([k, n]) => ({ k, score: n * Math.log(eps / spread.get(k)!) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score || rank.get(a.k)! - rank.get(b.k)!)
      .slice(0, perEpisode)
    for (const { k } of scored) out.set(k, [...(out.get(k) ?? []), ep])
  }
  return out
}

/* ---------- Example lines ---------- */

export interface Assignment {
  key: string
  lineId?: number
  /** Other words in the line that are new to you at this point of the deck */
  otherNew: string[]
  candidates: number
}

/** A line that trails off or breaks mid-sentence (ends in a dash, ellipsis, comma or a particle). */
export function isFragment(text: string): boolean {
  return /([―—⸺…、]|[をがにとはのでもや]|から|より|けど)$/u.test(text.trim())
}

/**
 * One unique line per word. Candidates are lines of `minLen`–`maxLen` characters containing the word
 * (falling back to any length when there are none). A line's cost is the number of other words in it that
 * are still new when this word comes up (unknown words, or deck words ranked later), then whether it's a
 * sentence fragment, then its distance from an easy ~14 characters. Words with the fewest candidates choose first; a line is never reused.
 */
export function assignExamples(
  targets: string[],
  lines: { id: number; text: string; keys: Set<string> }[],
  newRank: (key: string) => number | undefined,
  opts: { minLen?: number; maxLen?: number } = {},
): Assignment[] {
  const minLen = opts.minLen ?? 6
  const maxLen = opts.maxLen ?? 30
  const len = (s: string) => s.replace(/[\s　]/g, '').length
  const rank = new Map(targets.map((k, i) => [k, i]))
  const cands = new Map<string, typeof lines>()
  for (const key of targets) {
    const all = lines.filter((l) => l.keys.has(key))
    const fit = all.filter((l) => len(l.text) >= minLen && len(l.text) <= maxLen)
    cands.set(key, fit.length ? fit : all)
  }
  const otherNew = (key: string, line: { keys: Set<string> }) => {
    const r = rank.get(key)!
    return [...line.keys].filter((k) => {
      if (k === key) return false
      const nr = newRank(k)
      return nr !== undefined && nr > r // learned later in the deck, or never
    })
  }
  const order = [...targets].sort((a, b) => cands.get(a)!.length - cands.get(b)!.length || rank.get(a)! - rank.get(b)!)
  const used = new Set<number>()
  const out = new Map<string, Assignment>()
  for (const key of order) {
    let best: { line: (typeof lines)[number]; cost: number; other: string[] } | undefined
    for (const line of cands.get(key)!) {
      if (used.has(line.id)) continue
      const other = otherNew(key, line)
      const cost = other.length * 100 + (isFragment(line.text) ? 40 : 0) + Math.abs(len(line.text) - 14)
      if (!best || cost < best.cost) best = { line, cost, other }
    }
    if (best) used.add(best.line.id)
    out.set(key, { key, lineId: best?.line.id, otherNew: best?.other ?? [], candidates: cands.get(key)!.length })
  }
  return targets.map((k) => out.get(k)!)
}

/* ---------- Kotoba markup ---------- */

/** Tokens that begin a new tile (a content word, prefix, or a pronoun/number); the rest attach to it. */
function startsTile(t: Tok, prev?: Tok): boolean {
  if (prev?.pos === '接頭詞') return false
  if (t.pos === '記号') return false
  if (t.pos === '名詞') return !['非自立', '接尾'].includes(t.pos1) && !(prev?.pos === '名詞' && prev.pos1 === '数' && t.pos1 === '数')
  if (t.pos === '動詞' || t.pos === '形容詞') return t.pos1 === '自立'
  return ['副詞', '連体詞', '接続詞', '感動詞', '接頭詞', 'フィラー'].includes(t.pos)
}

function tokenMarkup(t: Tok): string {
  if (t.pos === '記号' && /^\s+$/u.test(t.surface)) return '　'
  if (!hasKanji(t.surface)) return t.surface
  return `{${t.surface}|${kataToHira(t.reading)}}`
}

/** Tokens glued to a verb/adjective target so the cloze blank holds the whole form (食べ+た, 信じ+て). */
function extendsTarget(t: Tok): boolean {
  return t.pos === '助動詞' || (t.pos === '動詞' && t.pos1 !== '自立') || (t.pos === '形容詞' && t.pos1 !== '自立') || (t.pos === '助詞' && t.pos1 === '接続助詞' && /^[てで]$/.test(t.surface))
}

/**
 * Sentence markup: `{漢字|かな}` furigana on every kanji token, ASCII spaces between tiles (content word +
 * its particles), `*…*` around the first occurrence of the target word. Returns undefined when a kanji
 * token has no reading (unknown word), since every kanji must carry furigana.
 */
export function lineMarkup(toks: Tok[], isTarget: (t: Tok) => boolean): string | undefined {
  let out = ''
  let inTarget = false
  let done = false
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i]!
    if (hasKanji(t.surface) && !t.reading) return undefined
    const prev = toks[i - 1]
    if (inTarget && !extendsTarget(t)) {
      out += '*'
      inTarget = false
      done = true
    }
    if (i > 0 && startsTile(t, prev)) out += ' '
    if (!done && !inTarget && isTarget(t)) {
      out += '*'
      inTarget = true
      if (t.pos !== '動詞' && t.pos !== '形容詞') {
        out += tokenMarkup(t) + '*'
        inTarget = false
        done = true
        continue
      }
    }
    out += tokenMarkup(t)
  }
  if (inTarget) out += '*'
  return out.trim()
}

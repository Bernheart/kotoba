/**
 * Mine private word decks from your own subtitle files.
 *
 *   npm run arcane -- [--subs DIR] [--top 300] [--backup kotoba-backup.json] [--deck arcane]
 *
 * Reads <subs>/*S01E01*.{srt,vtt,ass} (Japanese; English/Polish cues are used as translation hints), prints the
 * coverage report and writes three drafts next to the subtitles:
 *   <deck>-draft.json        the top N words that are new to you
 *   <deck>-names-draft.json  characters, places and things, as spelled in the show
 *   <deck>-known-draft.json  words you know, each with a line from the show
 * For each one with a <id>-meanings.json, <id>-deck.json is written (Kotoba's JSON import format) after validation.
 * Everything stays next to your subtitles — never in this repo.
 */
import kuromoji, { type Tokenizer } from 'kuromoji'
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { hasKanji, isKanaOnly, kataToHira } from '../../src/lib/jp/chars'
import type { Word, WordType } from '../../src/lib/types'
import {
  assignExamples,
  classify,
  coverage,
  fixSlangVerbs,
  fromKuromoji,
  guessBaseReading,
  isKnown,
  joinNames,
  KNOWN_GRAMMAR,
  knownIndex,
  knownSet,
  lemmaOf,
  lineMarkup,
  mergeCompounds,
  normalizeSlang,
  rankWords,
  type Lemma,
  type Line,
  type Tok,
  type WordStat,
} from './mine'
import { cueLanguage, episodeOf, isDialogue, languageOf, mergeContinuations, parseSubtitles, refOf, type Cue } from './subs'
import { wordProblems, type DeckWord } from './validate'

const ROOT = resolve(import.meta.dirname, '..', '..')

function args() {
  const a = process.argv.slice(2)
  const get = (k: string, d?: string) => {
    const i = a.indexOf(`--${k}`)
    return i >= 0 ? a[i + 1] : d
  }
  const home = (p: string) => p.replace(/^~(?=\/|$)/, homedir())
  const subs = home(get('subs', '~/Documents/japanese/arcane-subs')!)
  return {
    subs,
    top: Number(get('top', '300')),
    backup: get('backup') && home(get('backup')!),
    deck: get('deck', 'arcane')!,
    /** Minimum occurrences for a name / known word to get a card */
    minNames: Number(get('min-names', '2')),
    minKnown: Number(get('min-known', '2')),
    names: home(get('names', join(ROOT, 'tools/arcane/names.txt'))!),
  }
}

/** Per-word notes Claude (or you) write after reviewing the draft. */
interface Meaning {
  en: string
  pl: string
  /** Written form / reading / type corrections (愛す → 愛する), or `skip` for misparsed tokens and names */
  japanese?: string
  kana?: string
  type?: DeckWord['type']
  furigana?: string
  skip?: boolean
  /** Tags instead of the deck's default ones */
  tags?: string[]
  /** Translation of the example line as spoken; `line` = the line it translates (plain text), so a changed pick is caught */
  ex?: { line?: string; en: string; pl: string }
  /** Hand-fixed example markup (when the tokenizer split the line badly) */
  ja?: string
}

const buildTokenizer = () =>
  new Promise<Tokenizer>((ok, fail) =>
    kuromoji.builder({ dicPath: join(ROOT, 'node_modules/kuromoji/dict') }).build((err, t) => (err ? fail(err) : ok(t))),
  )

function readCues(dir: string) {
  const ja: Cue[] = []
  const en: Cue[] = []
  const pl: Cue[] = []
  const files = readdirSync(dir).filter((f) => /\.(srt|vtt|ass|ssa)$/i.test(f))
  const eps = new Set<string>()
  for (const f of files.sort()) {
    const ep = episodeOf(f)
    if (!ep) {
      console.warn(`  skipped (no SxxEyy in the name): ${f}`)
      continue
    }
    const text = readFileSync(join(dir, f), 'utf8')
    const lang = languageOf(f) ?? (/[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(text) ? 'ja' : 'en')
    const cues = parseSubtitles(text, ep, f)
    if (lang === 'ja') {
      eps.add(ep)
      // a Japanese file may also hold other tracks' cues (multi-track export): sort them by language
      const own = cues.filter((c) => cueLanguage(c.text) === 'ja')
      ja.push(...mergeContinuations(own).filter((c) => isDialogue(c.text)))
      en.push(...cues.filter((c) => cueLanguage(c.text) === 'en'))
      pl.push(...cues.filter((c) => cueLanguage(c.text) === 'pl'))
    } else en.push(...cues)
  }
  return { ja, en, pl, eps: [...eps].sort(epOrder) }
}

function epOrder(a: string, b: string) {
  const n = (s: string) => s.match(/\d+/g)!.map(Number)
  const [sa, ea] = n(a)
  const [sb, eb] = n(b)
  return sa! - sb! || ea! - eb!
}

/** Verbs that only carry grammar inside set phrases (勉強する, ありがとうございます, ください). */
const AUX_VERBS = new Set(['する', 'ござる', 'くださる', 'いる', 'ある', 'なる', 'いただく'])

/** Particles and numbers aren't practised in the known-words deck. */
const SKIP_KNOWN_TYPES = new Set<WordType>(['particle', 'number', 'counter', 'prefix', 'suffix'])

function knownWords(backupPath?: string) {
  const words: Word[] = []
  const dir = join(ROOT, 'data/vocab')
  for (const f of readdirSync(dir).filter((x) => /^lesson-\d+\.json$/.test(x))) words.push(...JSON.parse(readFileSync(join(dir, f), 'utf8')).words)
  let own = 0
  if (backupPath) {
    const b = JSON.parse(readFileSync(backupPath, 'utf8')) as { userWords?: { id: string; kind: string; deleted?: number; word: Partial<Word> }[] }
    for (const r of b.userWords ?? []) {
      // your own words count as known — except words of a deck this tool made
      const w = r.word
      if (r.kind !== 'custom' || r.deleted || !w.japanese || !w.kana || w.deck) continue
      words.push({ tags: [], genkiLesson: 0, type: 'noun', en: '', pl: '', ...w, japanese: w.japanese, kana: w.kana, id: r.id })
      own++
    }
  }
  return { words, own, tokenForms: [] as [string, Word][] }
}

async function main() {
  const o = args()
  if (!existsSync(o.subs)) throw new Error(`No subtitle folder at ${o.subs}`)
  const names = new Set(
    existsSync(o.names)
      ? readFileSync(o.names, 'utf8')
          .split('\n')
          .map((l) => l.replace(/#.*/, '').trim())
          .filter(Boolean)
      : [],
  )
  const meaningsPath = join(o.subs, `${o.deck}-meanings.json`)
  const meanings: Record<string, Meaning> = existsSync(meaningsPath) ? JSON.parse(readFileSync(meaningsPath, 'utf8')) : {}
  const skip = new Set(Object.entries(meanings).filter(([, m]) => m.skip).map(([k]) => k))

  console.log(`Reading ${o.subs}`)
  const { ja, en, pl, eps } = readCues(o.subs)
  if (!ja.length) throw new Error('No Japanese subtitle files found (names need SxxEyy).')
  console.log(`  ${eps.length} episodes (${eps.join(' ')}), ${ja.length} lines${en.length + pl.length ? `, ${en.length} English + ${pl.length} Polish cues as translation hints` : ''}`)

  const tokenizer = await buildTokenizer()
  const tokenize = (text: string) => joinNames(fixSlangVerbs(mergeCompounds(tokenizer.tokenize(text).map(fromKuromoji))), names)
  const lines: Line[] = ja.map((c, id) => {
    const text = normalizeSlang(c.text)
    return { id, ep: c.ep, start: c.start, text, ref: refOf(c), toks: tokenize(text) }
  })

  // Known words: data/vocab + your own words, plus the dictionary forms of their tokens (一緒に → 一緒)
  const kw = knownWords(o.backup)
  const extraForms: string[] = []
  for (const w of kw.words) {
    const content = tokenize(w.japanese.replace(/[～〜]/g, '')).filter((t) => classify(t, names) === 'content')
    extraForms.push(...content.map((t) => t.base))
    // a word that is one word plus grammar (一緒に, 勉強する) is also known by that word; set phrases
    // (いってきます, よろしくお願いします) don't lend their pieces to the known-words deck
    const core = content.filter((t) => !AUX_VERBS.has(t.base))
    if (core.length === 1 && w.type !== 'expression') kw.tokenForms.push([core[0]!.base, w])
  }
  const known = knownSet(kw.words, [...extraForms, ...KNOWN_GRAMMAR])

  const readingCache = new Map<string, string>()
  const readingOf = (base: string, t: Tok) => {
    let r = readingCache.get(base)
    if (r === undefined) {
      const toks = tokenizer.tokenize(base)
      r = toks.length === 1 && toks[0]!.basic_form === base && toks[0]!.reading ? kataToHira(toks[0]!.reading) : guessBaseReading(t)
      readingCache.set(base, r)
    }
    return r
  }
  const cls = (t: Tok) => classify(t, names)
  const lemmaCache = new WeakMap<Tok, Lemma | null>()
  const lemma = (t: Tok): Lemma | null => {
    if (lemmaCache.has(t)) return lemmaCache.get(t)!
    const l = cls(t) === 'content' && !skip.has(t.base) ? lemmaOf(t, readingOf) : null
    lemmaCache.set(t, l)
    return l
  }
  const knownLemma = (l: Lemma) => isKnown(l, known)
  const ranked = rankWords(lines, (t) => {
    const l = lemma(t)
    return l && !knownLemma(l) ? l : null
  })
  const cov = coverage(lines, (t) => (cls(t) === 'content' && skip.has(t.base) ? 'name' : cls(t)), (t) => knownLemma(lemma(t)!), ranked)

  const pct = (n: number) => `${n.toFixed(1)}%`
  console.log(`\nCoverage (${cov.tokens} spoken tokens; grammar, names and numbers count as known)`)
  console.log(`  known now          ${pct((cov.known / cov.tokens) * 100)}   content words only: ${pct((cov.contentKnown / cov.content) * 100)}`)
  for (const g of cov.gains) console.log(`  + top ${String(g.n).padEnd(4)} new words ${pct(g.pct)}   content words only: ${pct(g.contentPct)}`)
  console.log(`  ${ranked.length} different new words in total; your known list: ${kw.words.length} words (${kw.own} of your own)`)

  // Three decks share the lines (one line is never used twice): new words choose first, then the show's
  // names, then the known words you see in it.
  const usable = new Set(lines.filter((l) => lineMarkup(l.toks, () => false) !== undefined).map((l) => l.id))
  const used = new Set<number>()
  const unknownKeys = new Set(ranked.map((w) => w.key))

  // other tracks' lines overlapping the Japanese line: context for translating, not copied into the deck
  const hint = (track: Cue[], l: Line) => {
    const c = ja[l.id]!
    return track
      .filter((e) => e.ep === c.ep && e.start < c.end - 0.2 && e.end > c.start + 0.2)
      .map((e) => e.text)
      .join(' ')
  }

  interface Entry extends WordStat {
    /** Fields from your known word (known-words deck) */
    base?: Partial<Word>
  }

  /** Pick a line per word, write <id>-draft.json, and when <id>-meanings.json exists, <id>-deck.json. */
  const buildDeck = (
    id: string,
    entries: Entry[],
    keyOf: (t: Tok) => string | null,
    opts: { tags: (rank: number, e: Entry) => string[]; needsExample?: boolean; more?: string[]; report?: object },
  ) => {
    const rank = new Map(entries.map((e, i) => [e.key, i]))
    const lineKeys = lines
      .filter((l) => usable.has(l.id) && !used.has(l.id))
      .map((l) => ({ id: l.id, text: l.text, keys: new Set(l.toks.flatMap((t) => [keyOf(t) ?? lemma(t)?.key ?? []].flat())) }))
    // other words in a line count as new when they're unknown, or this deck's words that come later
    const assigned = assignExamples(
      entries.map((e) => e.key),
      lineKeys,
      (k) => rank.get(k) ?? (unknownKeys.has(k) ? Infinity : undefined),
    )
    const draft = entries.map((w, i) => {
      const a = assigned[i]!
      const line = a.lineId !== undefined ? lines[a.lineId]! : undefined
      if (line) used.add(line.id)
      const markup = line ? lineMarkup(line.toks, (t) => keyOf(t) === w.key) : undefined
      return {
        rank: i + 1,
        japanese: w.japanese,
        kana: w.kana,
        type: w.type,
        count: w.count,
        episodes: w.episodes.length,
        ...(w.base ? { base: w.base } : {}),
        ...(line && markup
          ? { example: { ja: markup, plain: line.text, ref: line.ref, otherNew: a.otherNew, enHint: hint(en, line), plHint: hint(pl, line) } }
          : {}),
      }
    })
    const draftPath = join(o.subs, `${id}-draft.json`)
    writeFileSync(draftPath, JSON.stringify({ deck: id, episodes: eps, ...opts.report, words: draft, more: opts.more }, null, 1))
    console.log(`\n[${id}] draft: ${draftPath} (${draft.length} words, ${draft.filter((d) => !d.example).length} without an example line)`)

    const meaningsPath = join(o.subs, `${id}-meanings.json`)
    if (!existsSync(meaningsPath)) {
      console.log(`  No ${meaningsPath} yet — write meanings for the draft, then run again.`)
      return
    }
    const meanings: Record<string, Meaning> = JSON.parse(readFileSync(meaningsPath, 'utf8'))
    const deck: DeckWord[] = []
    const missing: string[] = []
    const stale: string[] = []
    const problems: string[] = []
    for (const d of draft) {
      const m: Partial<Meaning> = meanings[d.japanese] ?? {}
      if (m.skip) continue
      const enM = m.en || d.base?.en
      const plM = m.pl || d.base?.pl
      const exOk = !!(d.example && m.ex && (!m.ex.line || m.ex.line === d.example.plain))
      if (d.example && m.ex && !exOk) stale.push(d.japanese)
      if (!enM || !plM || (opts.needsExample && !exOk)) {
        missing.push(d.japanese)
        continue
      }
      const w: DeckWord = {
        japanese: m.japanese ?? d.japanese,
        kana: m.kana ?? d.kana,
        ...((m.furigana ?? d.base?.furigana) ? { furigana: m.furigana ?? d.base?.furigana } : {}),
        ...(d.base?.alt ? { alt: d.base.alt } : {}),
        ...(d.base?.tts ? { tts: d.base.tts } : {}),
        en: enM,
        pl: plM,
        type: m.type ?? d.type,
        genkiLesson: 0,
        deck: id,
        frequency: d.rank,
        tags: m.tags ?? opts.tags(d.rank, entries[d.rank - 1]!),
        ...(d.example && m.ex && exOk ? { example: { ja: m.ja ?? d.example.ja, en: m.ex.en, pl: m.ex.pl, ref: d.example.ref } } : {}),
      }
      const p = wordProblems(w)
      if (p.length) problems.push(`  #${d.rank} ${d.japanese}: ${p.join('; ')}`)
      deck.push(w)
    }
    if (stale.length) console.log(`  Example line changed since it was translated (${stale.length}): ${stale.join(' ')}`)
    if (missing.length) console.log(`  Missing meanings/translations for ${missing.length}: ${missing.slice(0, 40).join(' ')}${missing.length > 40 ? ' …' : ''}`)
    if (problems.length) {
      console.log(`  Validation problems (${problems.length}):\n${problems.join('\n')}`)
      process.exitCode = 1
      return
    }
    if (!deck.length) return
    const deckPath = join(o.subs, `${id}-deck.json`)
    writeFileSync(deckPath, JSON.stringify({ deck: id, words: deck }, null, 1))
    console.log(`  Deck: ${deckPath} (${deck.length} words, all valid). Import it in Kotoba: Words → Import → Choose file.`)
  }

  // 1. New words: the top N
  buildDeck(o.deck, ranked.slice(0, o.top), (t) => lemma(t)?.key ?? null, {
    tags: (r) => [`${o.deck}-${Math.min(3, Math.ceil(r / 100))}`],
    // the next new words after the deck, for reviewing names and choosing replacements
    more: ranked.slice(o.top, o.top + 300).map((w) => `${w.japanese}[${w.kana}] ${w.count}/${w.episodes.length}`),
    report: { coverage: cov },
  })

  // 2. Names of characters, places and things, as spelled in the show (メダルダ家 → メダルダ)
  const nameKey = (t: Tok) => {
    if (cls(t) !== 'name' || !/[\p{Script=Katakana}\p{Script=Han}]/u.test(t.base)) return null
    return names.has(t.base.slice(0, -1)) && hasKanji(t.base.slice(-1)) ? t.base.slice(0, -1) : t.base
  }
  const nameStats = rankWords(lines, (t) => {
    const k = nameKey(t)
    if (!k) return null
    const kana = isKanaOnly(k) ? k : kataToHira(t.reading)
    return kana && isKanaOnly(kana) ? { key: k, japanese: k, kana, type: 'noun' } : null
  }).filter((w) => w.count >= o.minNames)
  buildDeck(`${o.deck}-names`, nameStats, nameKey, { tags: () => [o.deck], needsExample: true })

  // 3. Words you know (Genki + your own), seen in the show — practice in real use
  const findKnown = knownIndex(kw.words, kw.tokenForms)
  const knownKey = (t: Tok) => {
    const l = lemma(t)
    return l && knownLemma(l) ? (findKnown(l)?.id ?? null) : null
  }
  const knownStats: Entry[] = rankWords(lines, (t) => {
    const k = knownKey(t)
    const w = k ? findKnown(lemma(t)!)! : undefined
    return w && !SKIP_KNOWN_TYPES.has(w.type) ? { key: w.id, japanese: w.japanese, kana: w.kana, type: w.type } : null
  })
    .filter((w) => w.count >= o.minKnown)
    .map((s) => {
      const w = kw.words.find((x) => x.id === s.key)!
      return { ...s, base: { en: w.en, pl: w.pl, furigana: w.furigana, alt: w.alt, tts: w.tts, genkiLesson: w.genkiLesson } }
    })
  buildDeck(`${o.deck}-known`, knownStats, knownKey, {
    tags: (_r, e) => [o.deck, ...(e.base?.genkiLesson ? [`genki-${e.base.genkiLesson}`] : [])],
    needsExample: true,
  })
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})

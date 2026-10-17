/**
 * Mine a private word deck from your own subtitle files.
 *
 *   npm run arcane -- [--subs DIR] [--top 300] [--backup kotoba-backup.json] [--deck arcane]
 *
 * Reads <subs>/*S01E01*.{srt,vtt,ass} (Japanese; English files are used as translation hints), prints the
 * coverage report and writes <subs>/arcane-draft.json. If <subs>/arcane-meanings.json exists, it is merged in
 * and <subs>/arcane-deck.json is written (Kotoba's JSON import format) after validation.
 * Everything stays next to your subtitles — never in this repo.
 */
import kuromoji, { type Tokenizer } from 'kuromoji'
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { kataToHira } from '../../src/lib/jp/chars'
import {
  assignExamples,
  classify,
  coverage,
  fromKuromoji,
  guessBaseReading,
  isKnown,
  KNOWN_GRAMMAR,
  knownSet,
  lemmaOf,
  lineMarkup,
  mergeCompounds,
  normalizeSlang,
  rankWords,
  type Lemma,
  type Line,
  type Tok,
} from './mine'
import { episodeOf, isDialogue, languageOf, mergeContinuations, parseSubtitles, refOf, type Cue } from './subs'
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
    names: home(get('names', join(ROOT, 'tools/arcane/names.txt'))!),
  }
}

/** Per-word notes Claude (or you) write after reviewing the draft. */
interface Meaning {
  en: string
  pl: string
  /** Reading / type corrections, or `skip` for misparsed tokens and names */
  kana?: string
  type?: DeckWord['type']
  furigana?: string
  skip?: boolean
  /** Translation of the example line as spoken */
  ex?: { en: string; pl: string }
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
      ja.push(...mergeContinuations(cues).filter((c) => isDialogue(c.text)))
    } else en.push(...cues)
  }
  return { ja, en, eps: [...eps].sort(epOrder) }
}

function epOrder(a: string, b: string) {
  const n = (s: string) => s.match(/\d+/g)!.map(Number)
  const [sa, ea] = n(a)
  const [sb, eb] = n(b)
  return sa! - sb! || ea! - eb!
}

function knownWords(backupPath?: string) {
  const words: { japanese: string; kana: string; alt?: string[] }[] = []
  const dir = join(ROOT, 'data/vocab')
  for (const f of readdirSync(dir).filter((x) => /^lesson-\d+\.json$/.test(x))) words.push(...JSON.parse(readFileSync(join(dir, f), 'utf8')).words)
  let own = 0
  if (backupPath) {
    const b = JSON.parse(readFileSync(backupPath, 'utf8')) as { userWords?: { kind: string; deleted?: number; word: { japanese?: string; kana?: string; deck?: string } }[] }
    for (const r of b.userWords ?? []) {
      // your own words count as known — except words of a deck this tool made
      if (r.kind !== 'custom' || r.deleted || !r.word.japanese || !r.word.kana || r.word.deck) continue
      words.push({ japanese: r.word.japanese, kana: r.word.kana })
      own++
    }
  }
  return { words, own }
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
  const { ja, en, eps } = readCues(o.subs)
  if (!ja.length) throw new Error('No Japanese subtitle files found (names need SxxEyy).')
  console.log(`  ${eps.length} episodes (${eps.join(' ')}), ${ja.length} lines${en.length ? `, ${en.length} English cues as hints` : ''}`)

  const tokenizer = await buildTokenizer()
  const tokenize = (text: string) => mergeCompounds(tokenizer.tokenize(text).map(fromKuromoji))
  const lines: Line[] = ja.map((c, id) => {
    const text = normalizeSlang(c.text)
    return { id, ep: c.ep, start: c.start, text, ref: refOf(c), toks: tokenize(text) }
  })

  // Known words: data/vocab + your own words, plus the dictionary forms of their tokens (一緒に → 一緒)
  const kw = knownWords(o.backup)
  const extraForms: string[] = []
  for (const w of kw.words)
    for (const t of tokenize(w.japanese.replace(/[～〜]/g, ''))) if (classify(t, names) === 'content') extraForms.push(t.base)
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

  // Deck: top N new words, one unique line each
  const top = ranked.slice(0, o.top)
  const rankOf = new Map(ranked.map((w, i) => [w.key, i]))
  const lineKeys = lines.map((l) => ({
    id: l.id,
    text: l.text,
    keys: new Set(l.toks.flatMap((t) => (lemma(t) ? [lemma(t)!.key] : []))),
  }))
  const assigned = assignExamples(
    top.map((w) => w.key),
    lineKeys.filter((l) => lineMarkup(lines[l.id]!.toks, () => false) !== undefined),
    // a word's rank among all new words; undefined = known
    (k) => rankOf.get(k),
  )

  const enHint = (l: Line) => {
    const c = ja[l.id]!
    return en
      .filter((e) => e.ep === c.ep && e.start < c.end + 0.5 && e.end > c.start - 0.5)
      .map((e) => e.text)
      .join(' ')
  }
  const draft = top.map((w, i) => {
    const a = assigned[i]!
    const line = a.lineId !== undefined ? lines[a.lineId]! : undefined
    const markup = line ? lineMarkup(line.toks, (t) => lemma(t)?.key === w.key) : undefined
    return {
      rank: i + 1,
      japanese: w.japanese,
      kana: w.kana,
      type: w.type,
      count: w.count,
      episodes: w.episodes.length,
      ...(line && markup ? { example: { ja: markup, plain: line.text, ref: line.ref, otherNew: a.otherNew, ...(enHint(line) ? { enHint: enHint(line) } : {}) } } : {}),
    }
  })
  const draftPath = join(o.subs, `${o.deck}-draft.json`)
  writeFileSync(draftPath, JSON.stringify({ deck: o.deck, episodes: eps, coverage: cov, words: draft }, null, 1))
  console.log(`\nDraft: ${draftPath} (${draft.length} words, ${draft.filter((d) => !d.example).length} without an example line)`)

  // Merge meanings → deck JSON
  if (!Object.keys(meanings).length) {
    console.log(`No ${meaningsPath} yet — write meanings for the draft, then run again.`)
    return
  }
  const deck: DeckWord[] = []
  const missing: string[] = []
  const problems: string[] = []
  for (const d of draft) {
    const m = meanings[d.japanese]
    if (!m?.en || !m.pl) {
      missing.push(d.japanese)
      continue
    }
    const band = Math.min(3, Math.ceil(d.rank / 100))
    const w: DeckWord = {
      japanese: d.japanese,
      kana: m.kana ?? d.kana,
      ...(m.furigana ? { furigana: m.furigana } : {}),
      en: m.en,
      pl: m.pl,
      type: m.type ?? d.type,
      genkiLesson: 0,
      deck: o.deck,
      frequency: d.rank,
      tags: [`${o.deck}-${band}`],
      ...(d.example && m.ex ? { example: { ja: m.ja ?? d.example.ja, en: m.ex.en, pl: m.ex.pl, ref: d.example.ref } } : {}),
    }
    const p = wordProblems(w)
    if (p.length) problems.push(`  #${d.rank} ${d.japanese}: ${p.join('; ')}`)
    deck.push(w)
  }
  if (missing.length) console.log(`Missing meanings for ${missing.length}: ${missing.slice(0, 40).join(' ')}${missing.length > 40 ? ' …' : ''}`)
  if (problems.length) {
    console.log(`Validation problems (${problems.length}):\n${problems.join('\n')}`)
    process.exitCode = 1
    return
  }
  const deckPath = join(o.subs, `${o.deck}-deck.json`)
  writeFileSync(deckPath, JSON.stringify({ deck: o.deck, words: deck }, null, 1))
  console.log(`Deck: ${deckPath} (${deck.length} words, all valid). Import it in Kotoba: Words → Import → Choose file.`)
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})

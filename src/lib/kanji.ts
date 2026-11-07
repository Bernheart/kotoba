// Genki I kanji (reading & writing section, lessons 3–12): data, quiz questions, stroke checking and stats.
// Kanji practice is a quiz, not SRS: it never creates cards or review logs.
import strokeFile from '../../data/kanji/strokes.json'
import { db, type KanjiProgressRow, type KotobaDB } from './db'
import { normalizeKana } from './jp/chars'
import { shuffle } from './srs/queue'
import type { Lang } from './types'

export interface KanjiWord {
  /** Written form; the book sometimes gives two spellings ("入り口／入口") */
  w: string
  /** Reading in kana; the book sometimes gives two ("しち／なな") */
  r: string
  en: string
  pl: string
  /** Highlighted in the book: the most important words */
  hl: boolean
  irregular?: boolean
}

export interface Kanji {
  /** Genki number 1–145 */
  n: number
  kanji: string
  lesson: number
  /** On readings, katakana */
  on: string[]
  /** Kun readings, hiragana */
  kun: string[]
  meaning: { en: string; pl: string }
  strokes: number
  words: KanjiWord[]
}

export interface KanjiLessonFile {
  lesson: number
  kanji: Omit<Kanji, 'lesson'>[]
}

export type Pt = [number, number]
export interface StrokeData {
  /** SVG path per stroke, in stroke order (KanjiVG, 109×109 box) */
  d: string[]
  /** Evenly spaced points along each stroke */
  pts: Pt[][]
}

const modules = import.meta.glob<KanjiLessonFile>('/data/kanji/lesson-*.json', { eager: true, import: 'default' })

export const KANJI: Kanji[] = Object.values(modules)
  .sort((a, b) => a.lesson - b.lesson)
  .flatMap((f) => f.kanji.map((k) => ({ ...k, lesson: f.lesson })))

export const KANJI_LESSONS: number[] = [...new Set(KANJI.map((k) => k.lesson))].sort((a, b) => a - b)
export const KANJI_BY_CHAR = new Map(KANJI.map((k) => [k.kanji, k]))
export const STROKE_BOX = (strokeFile as { viewBox: number }).viewBox
export const STROKES = (strokeFile as unknown as { strokes: Record<string, StrokeData> }).strokes

/** Alternatives the book lists with "／" */
export const variants = (s: string) => s.split('／').map((x) => x.trim()).filter(Boolean)
export const kanjiMeaning = (k: Kanji, lang: Lang) => k.meaning[lang]
export const wordMeaning = (w: KanjiWord, lang: Lang) => w[lang]
/** Short reading label: up to two on and two kun readings, e.g. "ゴ / あと". */
export const readingLabel = (k: Kanji) => [...k.on.slice(0, 2), ...k.kun.slice(0, 2)].join(' / ')

/** Lessons pre-selected in the quiz setup: every kanji lesson up to the current one (at least the first). */
export function defaultKanjiLessons(currentLesson: number): number[] {
  const upTo = KANJI_LESSONS.filter((l) => l <= currentLesson)
  return upTo.length ? upTo : KANJI_LESSONS.slice(0, 1)
}

/* ---------- answers ---------- */

/** Typed reading for a word: any of the book's readings, any kana script. */
export function checkWordReading(input: string, w: Pick<KanjiWord, 'r'>): boolean {
  const a = normalizeKana(input.trim().replace(/[\s〜～~]/g, ''))
  if (!a) return false
  return variants(w.r).some((r) => normalizeKana(r.replace(/[\s〜～~]/g, '')) === a)
}

/**
 * Typed reading for a quiz word. When the kanji lists the same spelling twice with different readings
 * (十 じゅう / とお, 家 いえ / うち), either reading is right.
 */
export function checkQuizReading(input: string, k: Pick<Kanji, 'words'>, word: Pick<KanjiWord, 'w' | 'r'>): boolean {
  return checkWordReading(input, word) || k.words.some((o) => o.w === word.w && checkWordReading(input, o))
}

/* ---------- stats ---------- */

export const kanjiKey = (k: string) => `k:${k}`
/** Stats id of an example word; the reading is part of it because a spelling can repeat (家 いえ / うち). */
export const wordKey = (k: string, w: Pick<KanjiWord, 'w' | 'r'>) => `w:${k}:${w.w}:${w.r}`
/** Identity of an example word across kanji (三時 is listed under both 三 and 時). */
export const wordId = (w: Pick<KanjiWord, 'w' | 'r'>) => `${w.w}|${w.r}`

export type StatKind = 'read' | 'write'

export async function recordKanji(id: string, ok: boolean, kind: StatKind = 'read', now = Date.now(), database: KotobaDB = db) {
  await database.transaction('rw', database.kanjiProgress, async () => {
    const cur = await database.kanjiProgress.get(id)
    const row: KanjiProgressRow = { id, right: 0, wrong: 0, ...cur, last: now, updatedAt: Math.max(now, (cur?.updatedAt ?? 0) + 1), dirty: 1, deleted: 0 }
    if (kind === 'read') {
      if (ok) row.right++
      else row.wrong++
    } else if (ok) row.writeRight = (row.writeRight ?? 0) + 1
    else row.writeWrong = (row.writeWrong ?? 0) + 1
    await database.kanjiProgress.put(row)
  })
}

/** 0 = never missed … higher = missed more often than answered right; -1 = never practised. */
export function weakness(row: KanjiProgressRow | undefined): number {
  if (!row) return -1
  const right = row.right + (row.writeRight ?? 0)
  const wrong = row.wrong + (row.writeWrong ?? 0)
  if (!right && !wrong) return -1
  return (wrong + 1) / (right + wrong + 2) // smoothed miss rate
}

/** Kanji (with their words) ordered weakest first; never-practised ones after the missed ones, ties random. */
export function weakFirst(pool: Kanji[], stats: Map<string, KanjiProgressRow>): Kanji[] {
  const score = (k: Kanji) => {
    const own = weakness(stats.get(kanjiKey(k.kanji)))
    const words = k.words.map((w) => weakness(stats.get(wordKey(k.kanji, w))))
    return Math.max(own, ...words)
  }
  const scored = shuffle(pool).map((k) => ({ k, s: score(k) }))
  // missed often first; untouched (-1) sorts as neutral 0.5 so well-known kanji go last
  const key = (s: number) => (s < 0 ? 0.5 : s)
  return scored.sort((a, b) => key(b.s) - key(a.s)).map((x) => x.k)
}

/* ---------- quiz ---------- */

export type KanjiQType = 'word-reading' | 'word-meaning' | 'kanji-meaning' | 'kanji-reading'
export const KANJI_QTYPES: KanjiQType[] = ['word-reading', 'word-meaning', 'kanji-meaning', 'kanji-reading']

export interface KanjiQuestion {
  id: string
  type: KanjiQType
  kanji: Kanji
  word?: KanjiWord
  /** Multiple-choice options (meanings or reading labels); `answer` is one of them */
  options?: string[]
  answer: string
}

let seq = 0

/** Words for reading questions: the highlighted ones when the kanji has any. */
export function quizWords(k: Kanji): KanjiWord[] {
  const hl = k.words.filter((w) => w.hl)
  return hl.length ? hl : k.words
}

function pickOptions(answer: string, others: string[], n = 3): string[] {
  const seen = new Set([answer.toLowerCase()])
  const out: string[] = []
  for (const o of shuffle(others)) {
    if (out.length >= n) break
    if (seen.has(o.toLowerCase())) continue
    seen.add(o.toLowerCase())
    out.push(o)
  }
  return shuffle([answer, ...out])
}

/**
 * `count` questions over the chosen kanji, cycling the selected types. Kanji come weakest first
 * when `stats` is given, otherwise in random order. Distractors are drawn from all kanji.
 */
export function makeKanjiQuiz(
  pool: Kanji[],
  types: KanjiQType[],
  count: number,
  lang: Lang,
  opts: { stats?: Map<string, KanjiProgressRow>; all?: Kanji[] } = {},
): KanjiQuestion[] {
  if (!pool.length || !types.length) return []
  const all = opts.all ?? KANJI
  const order = opts.stats ? weakFirst(pool, opts.stats) : shuffle(pool)
  const allWords = all.flatMap((k) => k.words)
  const qs: KanjiQuestion[] = []
  const usedWords = new Set<string>()
  const typeOrder = shuffle(types)
  // one question for this kanji and type, or null when it has none left (words already asked, 々 has no reading)
  const make = (k: Kanji, type: KanjiQType, allowRepeat: boolean): KanjiQuestion | null => {
    const base = { id: `kq${++seq}`, type, kanji: k }
    if (type === 'word-reading' || type === 'word-meaning') {
      const fresh = quizWords(k).filter((w) => !usedWords.has(wordId(w)))
      const words = fresh.length ? fresh : allowRepeat ? quizWords(k) : []
      if (!words.length) return null
      const word = words[Math.floor(Math.random() * words.length)]!
      usedWords.add(wordId(word))
      if (type === 'word-reading') return { ...base, word, answer: word.r }
      const answer = wordMeaning(word, lang)
      return { ...base, word, answer, options: pickOptions(answer, allWords.filter((w) => w.w !== word.w).map((w) => wordMeaning(w, lang))) }
    }
    if (type === 'kanji-meaning') {
      const answer = kanjiMeaning(k, lang)
      return { ...base, answer, options: pickOptions(answer, all.filter((o) => o !== k).map((o) => kanjiMeaning(o, lang))) }
    }
    if (!k.on.length && !k.kun.length) return null
    const answer = readingLabel(k)
    return { ...base, answer, options: pickOptions(answer, all.filter((o) => o !== k && (o.on.length || o.kun.length)).map(readingLabel)) }
  }
  // Each step takes the next kanji and tries the selected types in turn, so a kanji whose words were
  // already asked (shared words like 三時) still gets a question. After one full pass words may repeat.
  for (let i = 0; qs.length < count && i < count * 4; i++) {
    const k = order[i % order.length]!
    const allowRepeat = i >= order.length
    for (let j = 0; j < typeOrder.length; j++) {
      const q = make(k, typeOrder[(i + j) % typeOrder.length]!, allowRepeat)
      if (q) {
        qs.push(q)
        break
      }
    }
  }
  return qs
}

/* ---------- stroke checking (draw-and-check) ---------- */

export function resample(pts: Pt[], n = 16): Pt[] {
  if (pts.length === 0) return []
  const segs: number[] = []
  let total = 0
  for (let k = 1; k < pts.length; k++) {
    const l = Math.hypot(pts[k]![0] - pts[k - 1]![0], pts[k]![1] - pts[k - 1]![1])
    segs.push(l)
    total += l
  }
  if (!total) return Array.from({ length: n }, () => pts[0]!)
  const out: Pt[] = []
  let k = 0
  let acc = 0
  for (let s = 0; s < n; s++) {
    const target = (total * s) / (n - 1)
    while (k < segs.length - 1 && acc + segs[k]! < target) acc += segs[k++]!
    const f = segs[k] ? Math.min(1, (target - acc) / segs[k]!) : 0
    const a = pts[k]!
    const b = pts[k + 1] ?? a
    out.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f])
  }
  return out
}

const meanDist = (a: Pt[], b: Pt[]) => a.reduce((s, p, i) => s + Math.hypot(p[0] - b[i]![0], p[1] - b[i]![1]), 0) / a.length

/** Mean point distance (in the 109 box) under which a drawn stroke counts as the model stroke. */
export const STROKE_TOLERANCE = 15

export type StrokeVerdict = 'ok' | 'direction' | 'order' | 'shape'

/**
 * Compare a drawn stroke (109-box coordinates) with the expected next stroke.
 * 'direction' = right place but drawn backwards; 'order' = it matches a later stroke instead.
 */
export function checkStroke(drawn: Pt[], expected: number, model: Pt[][]): StrokeVerdict {
  const target = model[expected]
  if (!target || drawn.length < 2) return 'shape'
  const user = resample(drawn, target.length)
  const fwd = meanDist(user, target)
  const rev = meanDist([...user].reverse(), target)
  const len = (p: Pt[]) => p.slice(1).reduce((s, q, i) => s + Math.hypot(q[0] - p[i]![0], q[1] - p[i]![1]), 0)
  // a quick tap or a stroke far shorter/longer than the model doesn't count
  const ratio = len(user) / Math.max(1, len(target))
  const sizeOk = ratio > 0.4 && ratio < 2.2
  if (fwd <= STROKE_TOLERANCE && sizeOk && fwd <= rev) return 'ok'
  if (rev <= STROKE_TOLERANCE && sizeOk && rev < fwd) return 'direction'
  for (let j = expected + 1; j < model.length; j++) {
    if (meanDist(resample(drawn, model[j]!.length), model[j]!) <= STROKE_TOLERANCE) return 'order'
  }
  return 'shape'
}

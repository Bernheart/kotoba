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
    } else {
      if (ok) row.writeRight = (row.writeRight ?? 0) + 1
      else row.writeWrong = (row.writeWrong ?? 0) + 1
      row.writeLast = now
    }
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
const pathLen = (p: Pt[]) => p.slice(1).reduce((s, q, i) => s + Math.hypot(q[0] - p[i]![0], q[1] - p[i]![1]), 0)

/** Mean point distance (in the 109 box) under which a drawn stroke counts as the model stroke. */
export const STROKE_TOLERANCE = 17

/**
 * How the learner's writing sits in the box compared with the model: drawn point p maps to
 * `C + scale * (p - C) + [dx, dy]`, C = centre of the box. People write smaller, bigger or off-centre; once a stroke or two are accepted
 * that is learnt and taken out, so later strokes are judged on shape, direction and order.
 */
export interface Fit {
  scale: number
  dx: number
  dy: number
}
export const NO_FIT: Fit = { scale: 1, dx: 0, dy: 0 }

/** Fit from accepted strokes (drawn and model points, resampled to the same length). */
export function fitStrokes(pairs: { drawn: Pt[]; model: Pt[] }[]): Fit {
  const u = pairs.flatMap((p) => p.drawn)
  const m = pairs.flatMap((p) => p.model)
  if (!u.length) return NO_FIT
  const mean = (pts: Pt[]): Pt => [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length]
  const mu = mean(u)
  const mm = mean(m)
  let scale = 1
  // scale only once there is enough spread to measure it (two strokes, or one long one)
  if (pairs.length >= 2 || pathLen(pairs[0]!.model) > 40) {
    let num = 0
    let den = 0
    u.forEach((p, i) => {
      const a = [p[0] - mu[0], p[1] - mu[1]]
      const b = [m[i]![0] - mm[0], m[i]![1] - mm[1]]
      num += a[0]! * b[0]! + a[1]! * b[1]!
      den += a[0]! * a[0]! + a[1]! * a[1]!
    })
    if (den > 0) scale = Math.min(1.4, Math.max(0.7, num / den))
  }
  const c = STROKE_BOX / 2
  const clamp = (v: number) => Math.max(-25, Math.min(25, v))
  return { scale, dx: clamp(mm[0] - c - scale * (mu[0] - c)), dy: clamp(mm[1] - c - scale * (mu[1] - c)) }
}

/**
 * The fit to judge the next stroke with. Before any stroke is accepted there is nothing to compare the
 * position with, so the first stroke is lined up with its model and judged on shape and direction only.
 */
export function strokeFit(accepted: { drawn: Pt[]; model: Pt[] }[], drawn: Pt[], target: Pt[]): Fit {
  return fitStrokes(accepted.length ? accepted : [{ drawn: resample(drawn, target.length), model: target }])
}

export function applyFit(pts: Pt[], f: Fit): Pt[] {
  const c = STROKE_BOX / 2
  return pts.map((p) => [c + f.scale * (p[0] - c) + f.dx, c + f.scale * (p[1] - c) + f.dy])
}

export type StrokeVerdict = 'ok' | 'direction' | 'order' | 'shape'

/**
 * Compare a drawn stroke (109-box coordinates) with the expected next stroke, after taking out the
 * learner's size/position (`fit`, see `fitStrokes`).
 * 'direction' = right place but drawn backwards; 'order' = it is a later stroke drawn too early.
 */
export function checkStroke(drawn: Pt[], expected: number, model: Pt[][], fit: Fit = NO_FIT): StrokeVerdict {
  const target = model[expected]
  if (!target || drawn.length < 2) return 'shape'
  const user = resample(applyFit(drawn, fit), target.length)
  const fwd = meanDist(user, target)
  const rev = meanDist([...user].reverse(), target)
  // a stroke far shorter or longer than the model doesn't count
  const ratio = pathLen(user) / Math.max(1, pathLen(target))
  const sizeOk = ratio > 0.35 && ratio < 2.5
  // a later stroke that fits clearly better means the order is wrong (三: the bottom line drawn first)
  const later = model.slice(expected + 1).map((m) => meanDist(resample(user, m.length), m))
  const bestLater = Math.min(Infinity, ...later)
  if (bestLater <= STROKE_TOLERANCE && bestLater < fwd - 2) return 'order'
  if (fwd <= STROKE_TOLERANCE && sizeOk && fwd <= rev) return 'ok'
  if (rev <= STROKE_TOLERANCE && sizeOk && rev < fwd) return 'direction'
  return 'shape'
}

/* ---------- writing from meaning ---------- */

/** A word to give as the writing prompt, with the kanji blanked out: 午後 → 午□. */
export interface DrawPrompt {
  word: KanjiWord
  blanked: string
}

export function drawPrompt(k: Kanji): DrawPrompt {
  const words = quizWords(k)
  const word = words[Math.floor(Math.random() * words.length)]!
  return { word, blanked: variants(word.w)[0]!.split(k.kanji).join('□') }
}

/** How much a kanji needs writing practice: higher = drawn badly, never drawn, or not drawn for a while. */
export function writeWeight(row: KanjiProgressRow | undefined, now = Date.now()): number {
  const r = row?.writeRight ?? 0
  const w = row?.writeWrong ?? 0
  if (!r && !w) return 1.6
  const miss = (w + 1) / (r + w + 2)
  const days = row?.writeLast ? (now - row.writeLast) / 86_400_000 : 30
  return 0.3 + 2.5 * miss + 0.7 * Math.min(1, Math.max(0, days) / 10)
}

/**
 * `count` kanji to write. With `weakMore` the ones you draw badly (or haven't drawn) come up more often,
 * well-drawn ones still now and then; otherwise an even shuffle. No repeats until the pool is used up.
 */
export function pickForWriting(pool: Kanji[], stats: Map<string, KanjiProgressRow>, count: number, weakMore: boolean, now = Date.now(), rand = Math.random): Kanji[] {
  const out: Kanji[] = []
  while (pool.length && out.length < count) {
    // weighted sampling without replacement (Efraimidis–Spirakis)
    const round = pool
      .map((k) => ({ k, key: Math.pow(rand(), 1 / (weakMore ? writeWeight(stats.get(kanjiKey(k.kanji)), now) : 1)) }))
      .sort((a, b) => b.key - a.key)
      .map((x) => x.k)
    out.push(...round.slice(0, count - out.length))
  }
  return out
}

/** Writing record of one kanji (undefined = never drawn). */
export function writeScore(row: KanjiProgressRow | undefined): { right: number; wrong: number; rate: number } | undefined {
  const right = row?.writeRight ?? 0
  const wrong = row?.writeWrong ?? 0
  return right + wrong ? { right, wrong, rate: right / (right + wrong) } : undefined
}

/* ---------- free-draw auto-check ---------- */

export interface DrawingGrade {
  /** Model strokes matched by a drawn stroke */
  matched: number
  /** Strokes in the model / drawn */
  total: number
  drawn: number
  /** Drawn strokes that match no model stroke (indices into the drawing) */
  unmatched: number[]
  /** Matched strokes were drawn in the book's order / direction */
  order: boolean
  direction: boolean
  /** matched / max(drawn, total) */
  score: number
  /** Every stroke there, nothing extra: the suggested grade */
  ok: boolean
}

/** Mean distance under which a drawn stroke counts as a model stroke in free draw. */
export const FREE_TOLERANCE = 18

/**
 * Check a free drawing against the model, strokes in any order: line the drawing up with the model
 * (size and position), pair each drawn stroke with the model stroke it fits best, then refit on the
 * pairs and pair again. No handwriting recognition: it only says how well this drawing fits this kanji.
 */
export function gradeDrawing(strokes: Pt[][], model: Pt[][]): DrawingGrade {
  const drawn = strokes.filter((s) => s.length >= 2)
  const empty = { matched: 0, total: model.length, drawn: drawn.length, unmatched: drawn.map((_, i) => i), order: false, direction: false, score: 0, ok: false }
  if (!drawn.length) return empty
  // first fit: bounding boxes
  const box = (pts: Pt[]) => {
    const xs = pts.map((p) => p[0])
    const ys = pts.map((p) => p[1])
    return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) }
  }
  const bd = box(drawn.flat())
  const bm = box(model.flat())
  const size = (b: ReturnType<typeof box>) => Math.max(b.x1 - b.x0, b.y1 - b.y0, 1)
  const c = STROKE_BOX / 2
  const scale = Math.min(2, Math.max(0.5, size(bm) / size(bd)))
  const byBox: Fit = {
    scale,
    dx: (bm.x0 + bm.x1) / 2 - c - scale * ((bd.x0 + bd.x1) / 2 - c),
    dy: (bm.y0 + bm.y1) / 2 - c - scale * ((bd.y0 + bd.y1) / 2 - c),
  }
  type Pair = { i: number; j: number; fwd: number; rev: number }
  const cost = (p: Pair) => Math.min(p.fwd, p.rev)
  // pair drawn strokes with model strokes (best fits first), refit on the pairs, pair again
  const solve = (start: Fit): Pair[] => {
    let fit = start
    let pairs: Pair[] = []
    for (let pass = 0; pass < 3; pass++) {
      const fitted = drawn.map((s) => applyFit(s, fit))
      const cand: Pair[] = []
      fitted.forEach((s, i) =>
        model.forEach((m, j) => {
          const u = resample(s, m.length)
          const ratio = pathLen(u) / Math.max(1, pathLen(m))
          if (ratio < 0.35 || ratio > 2.5) return
          cand.push({ i, j, fwd: meanDist(u, m), rev: meanDist([...u].reverse(), m) })
        }),
      )
      cand.sort((a, b) => cost(a) - cost(b))
      const usedI = new Set<number>()
      const usedJ = new Set<number>()
      pairs = []
      for (const p of cand) {
        if (usedI.has(p.i) || usedJ.has(p.j) || cost(p) > FREE_TOLERANCE) continue
        usedI.add(p.i)
        usedJ.add(p.j)
        pairs.push(p)
      }
      if (pairs.length < 2) break
      const next = fitStrokes(
        pairs.map((p) => {
          const m = model[p.j]!
          const d = resample(drawn[p.i]!, m.length)
          return { drawn: p.fwd <= p.rev ? d : [...d].reverse(), model: m }
        }),
      )
      if (Math.abs(next.scale - fit.scale) < 0.01 && Math.abs(next.dx - fit.dx) < 0.5 && Math.abs(next.dy - fit.dy) < 0.5) break
      fit = next
    }
    return pairs
  }
  // Lining up the outlines fails when strokes are missing (one line of 二 would be stretched over the
  // whole kanji), so also try the drawing as it is, and keep whichever pairs more strokes, more closely.
  const quality = (ps: Pair[]) => ps.length * 1000 - ps.reduce((s, p) => s + cost(p), 0)
  const pairs = [solve(byBox), solve(NO_FIT)].sort((a, b) => quality(b) - quality(a))[0]!
  const matchedI = new Set(pairs.map((p) => p.i))
  const byDrawOrder = [...pairs].sort((a, b) => a.i - b.i).map((p) => p.j)
  const matched = pairs.length
  return {
    matched,
    total: model.length,
    drawn: drawn.length,
    unmatched: drawn.map((_, i) => i).filter((i) => !matchedI.has(i)),
    order: byDrawOrder.every((j, n) => n === 0 || j > byDrawOrder[n - 1]!),
    direction: pairs.every((p) => p.fwd <= p.rev),
    score: matched / Math.max(drawn.length, model.length),
    ok: matched === model.length && drawn.length === model.length,
  }
}

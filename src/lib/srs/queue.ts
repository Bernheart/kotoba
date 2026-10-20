import { Rating, type Grade } from 'ts-fsrs'
import { db, uuid, type CardRow, type ReviewLogRow, type StudyMode } from '../db'
import { byFrequency } from '../decks'
import { DEFAULT_SETTINGS, type Settings } from '../settings'
import { endOfStudyDay, studyDay } from '../time'
import type { Direction, Word } from '../types'
import { cardId, newCardRow, State } from './fsrs'
import { isLearningState, nextRow, previewMs, type ScheduleSettings } from './schedule'
import { LEARN_AHEAD_MS } from './session'

export { LEARN_AHEAD_MS }

export interface QueueItem {
  cardId: string
  wordId: string
  dir: Direction
  /** intro = show a new word before its first quiz */
  kind: 'intro' | 'card'
  isNew: boolean
  /** Card is in learning steps; `due` says when its step is up */
  learning?: boolean
  due?: number
}

export function isDue(c: CardRow, now = Date.now()): boolean {
  if (c.deleted || c.suspended) return false
  if (c.buriedUntil && c.buriedUntil > now) return false
  // A new recall card unlocks the day after recognition graduates; it needs no intro.
  if (c.state === State.New) return c.dir === 'recall' && c.due < endOfStudyDay(now)
  if (c.state === State.Learning || c.state === State.Relearning) return c.due <= now + LEARN_AHEAD_MS
  // Review cards are due for the whole study day they fall on (due at 04:00 of that day = due that day).
  return c.due < endOfStudyDay(now)
}

export interface QueueInput {
  words: Word[]
  cards: CardRow[]
  /** Logs of the current study day (for the new-cards-per-day budget) */
  todayLogs: Pick<ReviewLogRow, 'state' | 'scheduled' | 'cardId'>[]
  settings: Pick<Settings, 'newPerDay' | 'currentLesson' | 'recallCards'> & Partial<Pick<Settings, 'deckNewPerDay'>>
  now?: number
}

const wordOfCard = (id: string) => id.slice(0, id.lastIndexOf(':'))

/** New words introduced today (optionally only among `wordIds`, so each track has its own budget). */
export function newIntroducedToday(todayLogs: QueueInput['todayLogs'], wordIds?: Set<string>): number {
  return new Set(
    todayLogs
      .filter((l) => l.scheduled && l.state === State.New && l.cardId.endsWith(':recog') && (!wordIds || wordIds.has(wordOfCard(l.cardId))))
      .map((l) => l.cardId),
  ).size
}

/** Words of one study track: the main track (`deck` undefined) or one custom deck. */
export function trackWords<T extends Pick<Word, 'deck'>>(words: T[], deck?: string): T[] {
  return words.filter((w) => (w.deck || undefined) === (deck || undefined))
}

/** Daily new-word limit of a track. */
export function newPerDayOf(settings: QueueInput['settings'], deck?: string): number {
  return deck ? (settings.deckNewPerDay ?? DEFAULT_SETTINGS.deckNewPerDay) : settings.newPerDay
}

/** Next new words of a track: main = lesson order gated by the current lesson; deck = frequency order, no gating. */
export function trackCandidates(words: Word[], cards: Map<string, CardRow>, settings: Pick<Settings, 'currentLesson'>, deck?: string): Word[] {
  const scoped = trackWords(words, deck)
  return deck ? newCandidates(byFrequency(scoped), cards, Infinity) : newCandidates(scoped, cards, settings.currentLesson)
}

/** Words that may be introduced next, in lesson order (WaniKani-style gating by current lesson). */
export function newCandidates(words: Word[], cards: Map<string, CardRow>, currentLesson: number): Word[] {
  return words.filter((w) => {
    if (w.genkiLesson > currentLesson) return false
    const c = cards.get(cardId(w.id, 'recog'))
    return !c || (c.state === State.New && !c.suspended && !c.deleted)
  })
}

/**
 * Build today's review queue: due learning/review cards (one per word — siblings are buried), then new words.
 * Only one track is queued: the main words, or with `deck` the words of that custom deck.
 */
export function buildQueue(
  { words, cards, todayLogs, settings, now = Date.now() }: QueueInput,
  opts: { includeNew?: boolean; maxNew?: number; deck?: string } = {},
): QueueItem[] {
  const wordIds = new Set(trackWords(words, opts.deck).map((w) => w.id))
  const byId = new Map(cards.map((c) => [c.id, c]))
  const due = cards
    .filter((c) => wordIds.has(c.wordId) && isDue(c, now) && (settings.recallCards || c.dir === 'recog'))
    .sort((a, b) => a.due - b.due)
  const perWord = new Set<string>()
  const learning: QueueItem[] = []
  const reviews: QueueItem[] = []
  for (const c of due) {
    const isLearning = c.state === State.Learning || c.state === State.Relearning
    // learning cards are never buried; review siblings are (one card per word per day)
    if (!isLearning && perWord.has(c.wordId)) continue
    perWord.add(c.wordId)
    if (isLearning) learning.push({ cardId: c.id, wordId: c.wordId, dir: c.dir, kind: 'card', isNew: false, learning: true, due: c.due })
    else reviews.push({ cardId: c.id, wordId: c.wordId, dir: c.dir, kind: 'card', isNew: false })
  }
  shuffle(reviews)
  const queue = [...learning, ...reviews]
  if (opts.includeNew ?? true) {
    const budget = Math.max(0, Math.min(opts.maxNew ?? Infinity, newPerDayOf(settings, opts.deck) - newIntroducedToday(todayLogs, wordIds)))
    const fresh = trackCandidates(words, byId, settings, opts.deck)
      .filter((w) => !perWord.has(w.id))
      .slice(0, budget)
    // Intersperse new words: one every 4 reviews
    let pos = Math.min(queue.length, 2)
    for (const w of fresh) {
      queue.splice(pos, 0, { cardId: cardId(w.id, 'recog'), wordId: w.id, dir: 'recog', kind: 'intro', isNew: true })
      pos = Math.min(queue.length, pos + 4)
    }
  }
  return queue
}

export function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j]!, arr[i]!]
  }
  return arr
}

export { isLearningState }

export interface AnswerResult {
  card: CardRow
  log: ReviewLogRow
  becameLeech: boolean
  prev?: CardRow
}

/** What each rating button would schedule (for the labels) — the same computation the answer uses. */
export function previewIntervals(row: CardRow | undefined, wordId: string, dir: Direction, s: ScheduleSettings, now = Date.now()): Record<Grade, number> {
  return previewMs(row && !row.deleted ? row : newCardRow(wordId, dir, now), now, s)
}

/**
 * Apply a rating: FSRS next state, leech detection, sibling burying, recall-card unlock, and an append-only log.
 */
export async function answerCard(
  wordId: string,
  dir: Direction,
  rating: Grade,
  opts: {
    ms: number
    mode: StudyMode
    correct: boolean
    settings: Pick<Settings, 'retention' | 'leechThreshold' | 'recallCards'> & ScheduleSettings
    now?: number
  },
): Promise<AnswerResult> {
  const now = opts.now ?? Date.now()
  const id = cardId(wordId, dir)
  return db.transaction('rw', db.cards, db.reviewLogs, async () => {
    const prev = await db.cards.get(id)
    const base = prev && !prev.deleted ? prev : newCardRow(wordId, dir, now)
    const row: CardRow = { ...nextRow(base, rating, now, opts.settings), id, wordId, dir, leech: base.leech, suspended: base.suspended, deleted: 0 }
    // Leech: lapses crossed the threshold (and again every half-threshold after that, like Anki)
    let becameLeech = false
    const t = opts.settings.leechThreshold
    if (row.lapses > base.lapses && row.lapses >= t && (row.lapses - t) % Math.max(1, Math.ceil(t / 2)) === 0) {
      row.leech = 1
      becameLeech = true
    }
    // A leech is cured once it holds for three weeks
    if (row.leech && row.stability >= 21) row.leech = 0
    await db.cards.put(row)

    const log: ReviewLogRow = {
      id: uuid(),
      cardId: id,
      wordId,
      mode: opts.mode,
      rating,
      correct: opts.correct ? 1 : 0,
      ms: Math.round(opts.ms),
      at: now,
      day: studyDay(now),
      scheduled: 1,
      state: base.state,
      dirty: 1,
    }
    await db.reviewLogs.add(log)

    // Bury the sibling for the rest of the day (unless it is mid-learning).
    const sibId = cardId(wordId, dir === 'recog' ? 'recall' : 'recog')
    const sib = await db.cards.get(sibId)
    if (sib && !sib.deleted && sib.state === State.Review && sib.due < endOfStudyDay(now)) {
      await db.cards.put({ ...sib, buriedUntil: endOfStudyDay(now), updatedAt: now, dirty: 1 })
    }
    // Unlock the production card once recognition graduates — from tomorrow, never the same day.
    if (opts.settings.recallCards && dir === 'recog' && row.state === State.Review && !sib) {
      await db.cards.put({ ...newCardRow(wordId, 'recall', now), due: endOfStudyDay(now) })
    }
    return { card: row, log, becameLeech, prev }
  })
}

/** Practice answers (quizzes/games) are logged for stats but never move the schedule. */
export async function logPractice(wordId: string, mode: StudyMode, correct: boolean, ms: number, dir: Direction = 'recog', now = Date.now()) {
  await db.reviewLogs.add({
    id: uuid(),
    cardId: cardId(wordId, dir),
    wordId,
    mode,
    rating: correct ? Rating.Good : Rating.Again,
    correct: correct ? 1 : 0,
    ms: Math.round(ms),
    at: now,
    day: studyDay(now),
    scheduled: 0,
    dirty: 1,
  })
}

export async function undoAnswer(res: AnswerResult) {
  const now = Date.now()
  await db.transaction('rw', db.cards, db.reviewLogs, async () => {
    if (res.prev) await db.cards.put({ ...res.prev, updatedAt: now, dirty: 1 })
    else await db.cards.put({ ...res.card, ...newCardRow(res.card.wordId, res.card.dir, now) })
    // Logs are append-only for sync, so an undone answer is tombstoned rather than removed.
    await db.reviewLogs.put({ ...res.log, deleted: 1, dirty: 1, updatedAt: now })
  })
}

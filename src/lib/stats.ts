import { useLiveQuery } from 'dexie-react-hooks'
import { db, type CardRow, type ReviewLogRow } from './db'
import { getSettings } from './settings'
import { buildQueue, newIntroducedToday, newPerDayOf, trackCandidates, trackWords } from './srs/queue'
import { addDays, dayDiff, studyDay } from './time'
import type { Word } from './types'

/** Monday-based week key for a YYYY-MM-DD day. */
export function weekKey(day: string): string {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number]
  const date = new Date(y, m - 1, d, 12)
  const dow = (date.getDay() + 6) % 7
  date.setDate(date.getDate() - dow)
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`
}

export interface Streak {
  current: number
  longest: number
  /** Days bridged by a streak freeze in the current run */
  frozen: string[]
  freezeAvailable: boolean
  activeToday: boolean
}

/**
 * Consecutive study days ending today (or yesterday, if today isn't done yet).
 * One missed day per Monday–Sunday week is bridged automatically (streak freeze).
 */
export function computeStreak(activeDays: Iterable<string>, today = studyDay()): Streak {
  const days = new Set(activeDays)
  const activeToday = days.has(today)
  const usedWeeks = new Set<string>()
  const frozen: string[] = []
  let current = 0
  let d = activeToday ? today : addDays(today, -1)
  for (let guard = 0; guard < 4000; guard++) {
    if (days.has(d)) {
      current++
    } else {
      const wk = weekKey(d)
      // bridge only if the day before is active (single gap) and this week has a freeze left
      if (!usedWeeks.has(wk) && days.has(addDays(d, -1)) && current > 0) {
        usedWeeks.add(wk)
        frozen.push(d)
      } else break
    }
    d = addDays(d, -1)
  }
  // Longest run (with the same freeze rule)
  const sorted = [...days].sort()
  let longest = 0
  let run = 0
  let prev: string | null = null
  const weekUsed = new Set<string>()
  for (const day of sorted) {
    if (prev === null) run = 1
    else {
      const gap = dayDiff(prev, day)
      if (gap === 1) run++
      else if (gap === 2 && !weekUsed.has(weekKey(addDays(prev, 1)))) {
        weekUsed.add(weekKey(addDays(prev, 1)))
        run++
      } else run = 1
    }
    longest = Math.max(longest, run)
    prev = day
  }
  return { current, longest: Math.max(longest, current), frozen, freezeAvailable: !usedWeeks.has(weekKey(today)), activeToday }
}

export interface TodayStats {
  due: number
  newAvailable: number
  answeredToday: number
  correctToday: number
  streak: Streak
  leeches: number
  /** Due counts for the next 7 days (index 0 = tomorrow) */
  forecast: number[]
}

/** Due reviews and new words available today in one track (main words, or one custom deck). */
function trackToday(words: Word[], cards: CardRow[], live: ReviewLogRow[], now: number, deck?: string) {
  const s = getSettings()
  const ids = new Set(trackWords(words, deck).map((w) => w.id))
  const queue = buildQueue({ words, cards, todayLogs: live, settings: s, now }, { includeNew: false, deck })
  const byId = new Map(cards.map((c) => [c.id, c]))
  const budget = Math.max(0, newPerDayOf(s, deck) - newIntroducedToday(live, ids))
  const newAvailable = Math.min(budget, trackCandidates(words, byId, s, deck).length)
  return { ids, due: queue.length, newAvailable }
}

export function computeToday(words: Word[], cards: CardRow[], todayLogs: ReviewLogRow[], days: string[], now = Date.now()): TodayStats {
  const live = todayLogs.filter((l) => !l.deleted)
  const main = trackToday(words, cards, live, now)
  const mainCards = cards.filter((c) => main.ids.has(c.wordId))
  const forecast = Array.from({ length: 7 }, (_, i) => {
    const day = addDays(studyDay(now), i + 1)
    return mainCards.filter((c) => !c.deleted && !c.suspended && c.state !== 0 && studyDay(c.due) === day).length
  })
  return {
    due: main.due,
    newAvailable: main.newAvailable,
    answeredToday: live.length,
    correctToday: live.filter((l) => l.correct).length,
    streak: computeStreak(days, studyDay(now)),
    leeches: mainCards.filter((c) => c.leech && !c.deleted && !c.suspended).length,
    forecast,
  }
}

export interface DeckStats {
  deck: string
  total: number
  /** Words with at least one answered card */
  started: number
  due: number
  newAvailable: number
}

export function computeDecks(words: Word[], cards: CardRow[], todayLogs: ReviewLogRow[], now = Date.now()): DeckStats[] {
  const live = todayLogs.filter((l) => !l.deleted)
  const decks = [...new Set(words.flatMap((w) => (w.deck ? [w.deck] : [])))].sort()
  return decks.map((deck) => {
    const tr = trackToday(words, cards, live, now, deck)
    const started = new Set(cards.filter((c) => tr.ids.has(c.wordId) && !c.deleted && c.state !== 0).map((c) => c.wordId)).size
    return { deck, total: tr.ids.size, started, due: tr.due, newAvailable: tr.newAvailable }
  })
}

export function useDeckStats(words: Word[]): DeckStats[] | undefined {
  return useLiveQuery(async () => {
    if (!words.some((w) => w.deck)) return []
    const [cards, todayLogs] = await Promise.all([db.cards.toArray(), db.reviewLogs.where('day').equals(studyDay()).toArray()])
    return computeDecks(words, cards, todayLogs)
  }, [words])
}

export function useTodayStats(words: Word[]): TodayStats | undefined {
  return useLiveQuery(async () => {
    const today = studyDay()
    const [cards, todayLogs, days] = await Promise.all([
      db.cards.toArray(),
      db.reviewLogs.where('day').equals(today).toArray(),
      // Not uniqueKeys(): Safari 18 throws "Unable to open cursor" for a nextunique cursor on an empty index.
      db.reviewLogs.orderBy('day').keys(),
    ])
    return computeToday(words, cards, todayLogs, [...new Set(days as string[])])
  }, [words])
}

/* ---------- Dashboard ---------- */

export interface Bucket {
  key: string
  n: number
  correct: number
}

export interface DashboardStats {
  perDay: Map<string, number>
  streak: Streak
  learned: number
  mature: number
  answersToday: number
  retention30: number | null
  retentionN: number
  byType: Bucket[]
  byLesson: Bucket[]
  byMode: Bucket[]
  forecast: number[]
  total: number
}

export function computeDashboard(words: Word[], cards: CardRow[], logs: ReviewLogRow[], now = Date.now()): DashboardStats {
  const live = logs.filter((l) => !l.deleted)
  const byWord = new Map(words.map((w) => [w.id, w]))
  const perDay = new Map<string, number>()
  for (const l of live) perDay.set(l.day, (perDay.get(l.day) ?? 0) + 1)
  const today = studyDay(now)

  const recog = cards.filter((c) => c.dir === 'recog' && !c.deleted)
  const learned = new Set(recog.filter((c) => c.state !== 0).map((c) => c.wordId)).size
  const mature = recog.filter((c) => c.state === 2 && c.stability >= 21).length

  const since = now - 30 * 86_400_000
  const matureAnswers = live.filter((l) => l.scheduled && l.state === 2 && l.at >= since)
  const retention30 = matureAnswers.length ? matureAnswers.filter((l) => l.rating > 1).length / matureAnswers.length : null

  const bucket = (keyOf: (l: ReviewLogRow) => string | undefined) => {
    const m = new Map<string, Bucket>()
    for (const l of live) {
      const k = keyOf(l)
      if (k === undefined) continue
      const b = m.get(k) ?? { key: k, n: 0, correct: 0 }
      b.n++
      b.correct += l.correct
      m.set(k, b)
    }
    return [...m.values()]
  }
  const byType = bucket((l) => byWord.get(l.wordId)?.type)
  // Deck words get a `deck:<id>` bucket after the lessons.
  const byLesson = bucket((l) => {
    const w = byWord.get(l.wordId)
    return w ? (w.deck ? `deck:${w.deck}` : String(w.genkiLesson)) : undefined
  }).sort((a, b) => {
    const da = a.key.startsWith('deck:')
    const db_ = b.key.startsWith('deck:')
    return da !== db_ ? (da ? 1 : -1) : da ? a.key.localeCompare(b.key) : Number(a.key) - Number(b.key)
  })
  const byMode = bucket((l) => l.mode).sort((a, b) => b.n - a.n)
  const forecast = Array.from({ length: 7 }, (_, i) => {
    const day = addDays(today, i + 1)
    return cards.filter((c) => !c.deleted && !c.suspended && c.state !== 0 && studyDay(c.due) === day).length
  })
  return {
    perDay,
    streak: computeStreak(perDay.keys(), today),
    learned,
    mature,
    answersToday: perDay.get(today) ?? 0,
    retention30,
    retentionN: matureAnswers.length,
    byType,
    byLesson,
    byMode,
    forecast,
    total: live.length,
  }
}

export function useDashboard(words: Word[]): DashboardStats | undefined {
  return useLiveQuery(async () => {
    const [cards, logs] = await Promise.all([db.cards.toArray(), db.reviewLogs.toArray()])
    return computeDashboard(words, cards, logs)
  }, [words])
}

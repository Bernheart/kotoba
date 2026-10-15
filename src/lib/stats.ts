import { useLiveQuery } from 'dexie-react-hooks'
import { db, type CardRow, type ReviewLogRow } from './db'
import { getSettings } from './settings'
import { buildQueue, newCandidates, newIntroducedToday } from './srs/queue'
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

export function computeToday(words: Word[], cards: CardRow[], todayLogs: ReviewLogRow[], days: string[], now = Date.now()): TodayStats {
  const s = getSettings()
  const live = todayLogs.filter((l) => !l.deleted)
  const queue = buildQueue({ words, cards, todayLogs: live, settings: s, now }, { includeNew: false })
  const byId = new Map(cards.map((c) => [c.id, c]))
  const budget = Math.max(0, s.newPerDay - newIntroducedToday(live))
  const newAvailable = Math.min(budget, newCandidates(words, byId, s.currentLesson).length)
  const forecast = Array.from({ length: 7 }, (_, i) => {
    const day = addDays(studyDay(now), i + 1)
    return cards.filter((c) => !c.deleted && !c.suspended && c.state !== 0 && studyDay(c.due) === day).length
  })
  return {
    due: queue.length,
    newAvailable,
    answeredToday: live.length,
    correctToday: live.filter((l) => l.correct).length,
    streak: computeStreak(days, studyDay(now)),
    leeches: cards.filter((c) => c.leech && !c.deleted && !c.suspended).length,
    forecast,
  }
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

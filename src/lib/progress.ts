import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo } from 'react'
import { db, type CardRow, type ReviewLogRow } from './db'
import { retrievability, State } from './srs/fsrs'

export type WordStatus = 'new' | 'learning' | 'known'

export interface WordProgress {
  wordId: string
  attempts: number
  correct: number
  lapses: number
  status: WordStatus
  leech: boolean
  suspended: boolean
  due?: number
  stability?: number
  retrievability?: number
  /** 0–1.3, higher = weaker; -1 for words never answered */
  weakness: number
  cards: CardRow[]
}

export const MATURE_DAYS = 21

export function computeProgress(cards: CardRow[], logs: Pick<ReviewLogRow, 'wordId' | 'correct' | 'at'>[], now = Date.now()) {
  const map = new Map<string, WordProgress>()
  const get = (id: string) => {
    let p = map.get(id)
    if (!p) {
      p = { wordId: id, attempts: 0, correct: 0, lapses: 0, status: 'new', leech: false, suspended: false, weakness: -1, cards: [] }
      map.set(id, p)
    }
    return p
  }
  // Recent answers weigh more: only the last 20 per word count towards the error rate.
  const recent = new Map<string, { c: number; n: number }>()
  const sorted = [...logs].sort((a, b) => b.at - a.at)
  for (const l of sorted) {
    const p = get(l.wordId)
    p.attempts++
    p.correct += l.correct
    const r = recent.get(l.wordId) ?? { c: 0, n: 0 }
    if (r.n < 20) {
      r.n++
      r.c += l.correct
    }
    recent.set(l.wordId, r)
  }
  for (const c of cards) {
    if (c.deleted) continue
    const p = get(c.wordId)
    p.cards.push(c)
    p.lapses += c.lapses
    p.leech ||= c.leech === 1
    p.suspended ||= c.suspended === 1
    if (c.state !== State.New) {
      p.due = p.due === undefined ? c.due : Math.min(p.due, c.due)
      p.stability = p.stability === undefined ? c.stability : Math.min(p.stability, c.stability)
      const ret = retrievability(c, now)
      if (ret !== undefined) p.retrievability = p.retrievability === undefined ? ret : Math.min(p.retrievability, ret)
    }
  }
  for (const p of map.values()) {
    const studied = p.cards.some((c) => c.state !== State.New)
    p.status = !studied ? 'new' : (p.stability ?? 0) >= MATURE_DAYS ? 'known' : 'learning'
    if (p.attempts === 0 && !studied) {
      p.weakness = -1
      continue
    }
    const r = recent.get(p.wordId) ?? { c: 0, n: 0 }
    const errRate = (r.n - r.c + 1) / (r.n + 2) // Laplace-smoothed
    const forget = 1 - (p.retrievability ?? 0.6)
    p.weakness = 0.6 * errRate + 0.4 * forget + (p.leech ? 0.3 : 0)
  }
  return map
}

/** Per-word progress, live from IndexedDB. Reads all logs — use on pages, not inside hot loops. */
export function useProgress(): Map<string, WordProgress> | undefined {
  const data = useLiveQuery(async () => {
    const [cards, logs] = await Promise.all([db.cards.toArray(), db.reviewLogs.toArray()])
    return { cards, logs }
  }, [])
  return useMemo(() => (data ? computeProgress(data.cards, data.logs) : undefined), [data])
}

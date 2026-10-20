import { Rating, State, type Grade } from 'ts-fsrs'
import { db, getMeta, setMeta, type CardRow, type ReviewLogRow } from '../db'
import { getSettings, type Settings } from '../settings'
import { DAY_MS } from '../time'
import { cardToRow, newCardRow, rowToCard, scheduler } from './fsrs'
import { sm2Next } from './sm2'

export type ScheduleSettings = Partial<Pick<Settings, 'scheduler' | 'retention'>>

const GRADES: Grade[] = [Rating.Again, Rating.Hard, Rating.Good, Rating.Easy]
const kindOf = (s: ScheduleSettings) => s.scheduler ?? 'anki'

/** The card after a rating, with whichever scheduler is selected. Keeps the card's identity and flags. */
export function nextRow(base: CardRow, rating: Grade, now: number, s: ScheduleSettings): CardRow {
  if (kindOf(s) === 'anki') {
    return { ...base, ...sm2Next(base, rating, now).fields, buriedUntil: undefined, updatedAt: now, dirty: 1 }
  }
  const n = scheduler(s.retention ?? 0.9).next(rowToCard(base), new Date(now), rating)
  return { ...cardToRow(n.card, base, now), ease: base.ease }
}

/** What each button would schedule, as a duration to print on it. Same computation as `nextRow`. */
export function previewMs(base: CardRow, now: number, s: ScheduleSettings): Record<Grade, number> {
  const out = {} as Record<Grade, number>
  if (kindOf(s) === 'anki') {
    for (const g of GRADES) out[g] = sm2Next(base, g, now).displayMs
    return out
  }
  const p = scheduler(s.retention ?? 0.9).repeat(rowToCard(base), new Date(now))
  for (const g of GRADES) {
    const c = p[g].card
    out[g] = c.state === State.Review ? Math.max(1, c.scheduled_days) * DAY_MS : c.due.getTime() - now
  }
  return out
}

export const isLearningState = (state: number) => state === State.Learning || state === State.Relearning

/** Rebuild a card from its answer history (oldest first) with the selected scheduler. */
export function replay(wordId: string, dir: CardRow['dir'], logs: Pick<ReviewLogRow, 'rating' | 'at'>[], s: ScheduleSettings): CardRow {
  let row = newCardRow(wordId, dir, logs[0]?.at ?? Date.now())
  for (const l of logs) row = nextRow(row, l.rating as Grade, l.at, s)
  return row
}

let applying: Promise<void> | null = null

/**
 * When the scheduler changes (or the first time this version runs), replay every card's answers so its
 * interval, ease and due date are what the selected algorithm would have produced from the start.
 */
export function applyScheduler(force = false): Promise<void> {
  if (applying) return applying
  applying = (async () => {
    const s = getSettings()
    const kind = kindOf(s)
    // installs before this version scheduled everything with FSRS
    if (!force && (await getMeta<string>('schedulerApplied', 'fsrs')) === kind) return
    const [cards, logs] = await Promise.all([db.cards.toArray(), db.reviewLogs.toArray()])
    const byCard = new Map<string, ReviewLogRow[]>()
    for (const l of logs) {
      if (!l.scheduled || l.deleted) continue
      const list = byCard.get(l.cardId) ?? []
      list.push(l)
      byCard.set(l.cardId, list)
    }
    const now = Date.now()
    const out: CardRow[] = []
    for (const c of cards) {
      const history = byCard.get(c.id)
      if (c.deleted || !history?.length) continue
      history.sort((a, b) => a.at - b.at)
      const row = replay(c.wordId, c.dir, history, s)
      out.push({ ...row, id: c.id, leech: c.leech, suspended: c.suspended, buriedUntil: c.buriedUntil, updatedAt: now, dirty: 1 })
    }
    if (out.length) await db.cards.bulkPut(out)
    await setMeta('schedulerApplied', kind)
  })().finally(() => {
    applying = null
  })
  return applying
}

import { db, type CardRow } from '../db'
import type { Direction } from '../types'
import { cardId, newCardRow } from './fsrs'

const DIRS: Direction[] = ['recog', 'recall']

export async function suspendWord(wordId: string, on: boolean, now = Date.now()) {
  await db.transaction('rw', db.cards, async () => {
    const rows: CardRow[] = []
    for (const dir of DIRS) {
      const c = (await db.cards.get(cardId(wordId, dir))) ?? newCardRow(wordId, dir, now)
      rows.push({ ...c, suspended: on ? 1 : 0, deleted: 0, updatedAt: now, dirty: 1 })
    }
    await db.cards.bulkPut(rows)
  })
}

/** Forget the schedule (logs stay for stats). */
export async function resetWord(wordId: string, now = Date.now()) {
  const existing = await db.cards.where('wordId').equals(wordId).toArray()
  await db.cards.bulkPut(existing.map((c) => ({ ...newCardRow(wordId, c.dir, now), suspended: c.suspended })))
}

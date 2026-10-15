import Dexie, { type Table } from 'dexie'
import type { Direction, Word } from './types'

/** Rows that sync carry a logical timestamp (last-write-wins) and a dirty flag (0/1 — booleans aren't valid IDB keys). */
export interface Syncable {
  updatedAt: number
  dirty: 0 | 1
  deleted?: 0 | 1
}

export interface UserWordRow extends Syncable {
  id: string
  /** custom = a full word you added/imported; patch = edits/mnemonic layered over a built-in word */
  kind: 'custom' | 'patch'
  word: Partial<Word>
  mnemonic?: string
  createdAt: number
}

export interface CardRow extends Syncable {
  id: string // `${wordId}:${dir}`
  wordId: string
  dir: Direction
  // FSRS card (dates as epoch ms)
  due: number
  stability: number
  difficulty: number
  elapsed_days: number
  scheduled_days: number
  learning_steps: number
  reps: number
  lapses: number
  state: number
  last_review?: number
  leech: 0 | 1
  suspended: 0 | 1
  /** Hidden until this time (sibling burying) */
  buriedUntil?: number
}

export type StudyMode =
  | 'review'
  | 'intro'
  | 'mcq'
  | 'typing'
  | 'listening'
  | 'cloze'
  | 'builder'
  | 'matching'
  | 'shadowing'
  | 'conjugation'
  | 'kana'
  | 'session'

export interface ReviewLogRow {
  id: string
  cardId: string
  wordId: string
  mode: StudyMode
  /** 1 again · 2 hard · 3 good · 4 easy */
  rating: 1 | 2 | 3 | 4
  correct: 0 | 1
  ms: number
  at: number
  /** Study day (4 AM rollover), YYYY-MM-DD */
  day: string
  /** 1 when this answer rescheduled the card (SRS review); practice answers are 0 */
  scheduled: 0 | 1
  /** Card state before the answer (0 new, 1 learning, 2 review, 3 relearning) */
  state?: number
  dirty: 0 | 1
  /** Undone answers are tombstoned (logs are append-only for sync) */
  deleted?: 0 | 1
}

/** Live (non-undone) logs */
export const liveLog = (l: Pick<ReviewLogRow, 'deleted'>) => !l.deleted

export interface SettingRow extends Syncable {
  key: string
  value: unknown
}

export interface MetaRow {
  key: string
  value: unknown
}

export class KotobaDB extends Dexie {
  userWords!: Table<UserWordRow, string>
  cards!: Table<CardRow, string>
  reviewLogs!: Table<ReviewLogRow, string>
  settings!: Table<SettingRow, string>
  meta!: Table<MetaRow, string>

  constructor(name = 'kotoba') {
    super(name)
    this.version(1).stores({
      userWords: 'id, kind, dirty, updatedAt',
      cards: 'id, wordId, due, state, dirty, updatedAt',
      reviewLogs: 'id, cardId, wordId, at, day, mode, dirty',
      settings: 'key, dirty',
      meta: 'key',
    })
  }
}

export const db = new KotobaDB()

export async function getMeta<T>(key: string, fallback: T): Promise<T> {
  const row = await db.meta.get(key)
  return row ? (row.value as T) : fallback
}

export function setMeta(key: string, value: unknown) {
  return db.meta.put({ key, value })
}

export function uuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })
}

export async function deviceId(): Promise<string> {
  let id = await getMeta<string | null>('deviceId', null)
  if (!id) {
    id = uuid()
    await setMeta('deviceId', id)
  }
  return id
}

/** Ask the browser not to evict our storage (granted heuristically on iOS, mostly for Home Screen apps). */
export async function requestPersistence(): Promise<boolean | null> {
  try {
    if (!navigator.storage?.persist) return null
    if (await navigator.storage.persisted()) return true
    return await navigator.storage.persist()
  } catch {
    return null
  }
}

/** IndexedDB can be unavailable (e.g. some file:// contexts, private modes). */
export async function storageWorks(): Promise<boolean> {
  try {
    await db.meta.put({ key: '__probe', value: Date.now() })
    await db.meta.delete('__probe')
    return true
  } catch {
    return false
  }
}

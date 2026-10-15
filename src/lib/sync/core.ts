// Transport-agnostic sync: push dirty local rows, pull remote changes after a cursor, merge last-write-wins.
// The Supabase transport lives in ./supabase.ts; tests use an in-memory Remote.
import type { KotobaDB } from '../db'
import { LOCAL_ONLY } from '../settings'

export type Collection = 'cards' | 'logs' | 'words' | 'settings'

export interface RemoteRecord {
  collection: Collection
  id: string
  data: Record<string, unknown>
  updated_at: number
  deleted: boolean
  seq?: number
}

export interface Remote {
  push(records: RemoteRecord[]): Promise<void>
  pull(since: number, limit: number): Promise<RemoteRecord[]>
}

type AnyRow = Record<string, unknown> & { dirty?: number; deleted?: number; updatedAt?: number; at?: number }

const tableOf = (db: KotobaDB, c: Collection) =>
  ({ cards: db.cards, logs: db.reviewLogs, words: db.userWords, settings: db.settings })[c] as unknown as {
    get(id: string): Promise<AnyRow | undefined>
    put(row: AnyRow): Promise<unknown>
    where(i: string): { equals(v: number): { toArray(): Promise<AnyRow[]> } }
  }

const keyOf = (c: Collection, row: AnyRow) => String(c === 'settings' ? row.key : row.id)
const stamp = (row: AnyRow) => Number(row.updatedAt ?? row.at ?? 0)

export function toRecord(c: Collection, row: AnyRow): RemoteRecord {
  const { dirty: _d, ...data } = row
  return { collection: c, id: keyOf(c, row), data, updated_at: stamp(row), deleted: !!row.deleted }
}

const COLLECTIONS: Collection[] = ['words', 'cards', 'logs', 'settings']

export async function collectDirty(db: KotobaDB): Promise<RemoteRecord[]> {
  const out: RemoteRecord[] = []
  for (const c of COLLECTIONS) {
    const rows = await tableOf(db, c).where('dirty').equals(1).toArray()
    for (const r of rows) {
      if (c === 'settings' && LOCAL_ONLY.includes(r.key as never)) continue
      out.push(toRecord(c, r))
    }
  }
  return out
}

/** After a successful push, clear the dirty flag unless the row changed meanwhile. */
export async function markClean(db: KotobaDB, pushed: RemoteRecord[]) {
  await db.transaction('rw', [db.cards, db.reviewLogs, db.userWords, db.settings], async () => {
    for (const r of pushed) {
      const t = tableOf(db, r.collection)
      const cur = await t.get(r.id)
      if (cur && cur.dirty && stamp(cur) === r.updated_at) await t.put({ ...cur, dirty: 0 })
    }
  })
}

/** Apply remote records: a remote row wins only if it is strictly newer than the local one. */
export async function applyRemote(db: KotobaDB, records: RemoteRecord[]): Promise<number> {
  let applied = 0
  await db.transaction('rw', [db.cards, db.reviewLogs, db.userWords, db.settings], async () => {
    for (const r of records) {
      if (r.collection === 'settings' && LOCAL_ONLY.includes(r.id as never)) continue
      const t = tableOf(db, r.collection)
      if (!t) continue
      const cur = await t.get(r.id)
      if (cur && stamp(cur) >= r.updated_at) continue
      await t.put({ ...r.data, dirty: 0, deleted: r.deleted ? 1 : 0 } as AnyRow)
      applied++
    }
  })
  return applied
}

export interface SyncResult {
  pushed: number
  pulled: number
  cursor: number
}

export async function syncOnce(db: KotobaDB, remote: Remote, opts: { cursor: number; batch?: number } = { cursor: 0 }): Promise<SyncResult> {
  const batch = opts.batch ?? 500
  const dirty = await collectDirty(db)
  for (let i = 0; i < dirty.length; i += batch) {
    const part = dirty.slice(i, i + batch)
    await remote.push(part)
    await markClean(db, part)
  }
  let cursor = opts.cursor
  let pulled = 0
  for (;;) {
    const rows = await remote.pull(cursor, 1000)
    if (!rows.length) break
    pulled += await applyRemote(db, rows)
    cursor = Math.max(cursor, ...rows.map((r) => r.seq ?? 0))
    if (rows.length < 1000) break
  }
  return { pushed: dirty.length, pulled, cursor }
}

/** In-memory server with the same semantics as supabase/schema.sql (used by tests). */
export class MemoryRemote implements Remote {
  rows = new Map<string, RemoteRecord & { seq: number }>()
  seq = 0
  async push(records: RemoteRecord[]) {
    for (const r of records) {
      const k = `${r.collection}/${r.id}`
      const cur = this.rows.get(k)
      if (cur && cur.updated_at >= r.updated_at) continue
      this.rows.set(k, { ...structuredClone(r), seq: ++this.seq })
    }
  }
  async pull(since: number, limit: number) {
    return [...this.rows.values()]
      .filter((r) => r.seq > since)
      .sort((a, b) => a.seq - b.seq)
      .slice(0, limit)
      .map((r) => structuredClone(r))
  }
}

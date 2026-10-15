import { toRomaji } from 'wanakana'
import { db, uuid, type UserWordRow } from './db'
import type { Word } from './types'

export function slugId(kana: string): string {
  const base = toRomaji(kana.replace(/[～〜]/g, ''))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 24)
  return `u-${base || 'word'}-${uuid().slice(0, 6)}`
}

/** Add or update one of your own words. */
export async function saveCustomWord(word: Omit<Word, 'id'> & { id?: string }, now = Date.now()): Promise<string> {
  const id = word.id ?? slugId(word.kana)
  const prev = await db.userWords.get(id)
  const { source: _s, ...clean } = word as Word
  await db.userWords.put({
    id,
    kind: 'custom',
    word: { ...clean, id },
    mnemonic: prev?.mnemonic,
    createdAt: prev?.createdAt ?? now,
    updatedAt: now,
    dirty: 1,
  })
  return id
}

/** Layer edits over a built-in word (only the changed fields are stored). */
export async function patchBuiltinWord(id: string, patch: Partial<Word>, now = Date.now()) {
  const prev = await db.userWords.get(id)
  const row: UserWordRow = {
    id,
    kind: 'patch',
    word: { ...(prev?.word ?? {}), ...patch },
    mnemonic: prev?.mnemonic,
    createdAt: prev?.createdAt ?? now,
    updatedAt: now,
    dirty: 1,
  }
  await db.userWords.put(row)
}

export async function saveWordEdit(original: Word, next: Word) {
  if (original.source === 'user') return saveCustomWord({ ...next, id: original.id })
  const patch: Partial<Word> = {}
  for (const k of Object.keys(next) as (keyof Word)[]) {
    if (k === 'source' || k === 'id') continue
    if (JSON.stringify(next[k]) !== JSON.stringify(original[k])) (patch as Record<string, unknown>)[k] = next[k]
  }
  return patchBuiltinWord(original.id, patch)
}

export async function setMnemonic(word: Word, mnemonic: string, now = Date.now()) {
  const prev = await db.userWords.get(word.id)
  if (prev) {
    await db.userWords.put({ ...prev, mnemonic, updatedAt: now, dirty: 1 })
  } else {
    await db.userWords.put({ id: word.id, kind: 'patch', word: {}, mnemonic, createdAt: now, updatedAt: now, dirty: 1 })
  }
}

/** Your words are removed (tombstoned for sync); built-in words are hidden. Progress is tombstoned too. */
export async function deleteWord(word: Word, now = Date.now()) {
  await db.transaction('rw', db.userWords, db.cards, async () => {
    const prev = await db.userWords.get(word.id)
    await db.userWords.put({
      id: word.id,
      kind: word.source === 'user' ? 'custom' : 'patch',
      word: prev?.word ?? {},
      mnemonic: prev?.mnemonic,
      createdAt: prev?.createdAt ?? now,
      updatedAt: now,
      dirty: 1,
      deleted: 1,
    })
    const cards = await db.cards.where('wordId').equals(word.id).toArray()
    await db.cards.bulkPut(cards.map((c) => ({ ...c, deleted: 1 as const, updatedAt: now, dirty: 1 as const })))
  })
}

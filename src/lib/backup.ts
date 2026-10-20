import { db, getMeta, setMeta, type CardRow, type ReviewLogRow, type SettingRow, type UserWordRow } from './db'
import { LOCAL_ONLY } from './settings'
import { applyRemote, toRecord, type Collection } from './sync/core'

export interface Backup {
  kotobaBackup: 1
  app: string
  exportedAt: string
  userWords: UserWordRow[]
  cards: CardRow[]
  reviewLogs: ReviewLogRow[]
  settings: SettingRow[]
}

export async function createBackup(): Promise<Backup> {
  const [userWords, cards, reviewLogs, settings] = await Promise.all([
    db.userWords.toArray(),
    db.cards.toArray(),
    db.reviewLogs.toArray(),
    db.settings.toArray(),
  ])
  return {
    kotobaBackup: 1,
    app: `Kotoba ${__APP_VERSION__}`,
    exportedAt: new Date().toISOString(),
    userWords,
    cards,
    reviewLogs,
    settings: settings.filter((s) => !LOCAL_ONLY.includes(s.key as never)),
  }
}

export function backupFile(b: Backup): File {
  const date = b.exportedAt.slice(0, 10)
  return new File([JSON.stringify(b)], `kotoba-backup-${date}.json`, { type: 'application/json' })
}

/**
 * iPhone: opens the share sheet ("Save to Files" → iCloud Drive). Must run inside the tap handler,
 * so the file is prepared beforehand. Mac/desktop: downloads the file.
 */
export async function shareOrDownload(file: File, opts: { isBackup?: boolean } = {}): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const isBackup = opts.isBackup ?? true
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean }
  if (nav.canShare?.({ files: [file] }) && /iPhone|iPad|iPod/.test(navigator.userAgent)) {
    try {
      await navigator.share({ files: [file], title: file.name })
      if (isBackup) await setMeta('lastBackupAt', Date.now())
      return 'shared'
    } catch (e) {
      if ((e as Error).name === 'AbortError') return 'cancelled'
    }
  }
  const url = URL.createObjectURL(file)
  const a = document.createElement('a')
  a.href = url
  a.download = file.name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
  if (isBackup) await setMeta('lastBackupAt', Date.now())
  return 'downloaded'
}

export function parseBackup(text: string): Backup {
  const b = JSON.parse(text) as Backup
  if (b?.kotobaBackup !== 1 || !Array.isArray(b.cards)) throw new Error('Not a Kotoba backup file')
  return b
}

/** Merge = last-write-wins per record (like sync); replace = wipe this device first. Restored rows are marked dirty so they sync. */
export async function restoreBackup(b: Backup, mode: 'merge' | 'replace') {
  if (mode === 'replace') {
    await db.transaction('rw', [db.userWords, db.cards, db.reviewLogs, db.settings], async () => {
      await Promise.all([db.userWords.clear(), db.cards.clear(), db.reviewLogs.clear(), db.settings.clear()])
    })
  }
  const recs = [
    ...b.userWords.map((r) => toRecord('words' as Collection, r as never)),
    ...b.cards.map((r) => toRecord('cards', r as never)),
    ...b.reviewLogs.map((r) => toRecord('logs', r as never)),
    ...b.settings.map((r) => toRecord('settings', r as never)),
  ]
  await applyRemote(db, recs)
  // mark as dirty so a signed-in device uploads the restored data
  await db.transaction('rw', [db.userWords, db.cards, db.reviewLogs, db.settings], async () => {
    await db.userWords.toCollection().modify({ dirty: 1 })
    await db.cards.toCollection().modify({ dirty: 1 })
    await db.reviewLogs.toCollection().modify({ dirty: 1 })
    await db.settings.toCollection().modify((s) => {
      if (!LOCAL_ONLY.includes(s.key as never)) s.dirty = 1
    })
  })
}

export async function daysSinceBackup(): Promise<number> {
  const last = await getMeta<number>('lastBackupAt', 0)
  return last ? Math.floor((Date.now() - last) / 86_400_000) : 9999
}

export async function eraseAll() {
  await db.transaction('rw', [db.userWords, db.cards, db.reviewLogs, db.settings, db.meta], async () => {
    await Promise.all([db.userWords.clear(), db.cards.clear(), db.reviewLogs.clear(), db.settings.clear(), db.meta.clear()])
  })
}

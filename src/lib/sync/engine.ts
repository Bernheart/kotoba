// Browser side of sync: Supabase client (lazy-loaded), email-code login, triggers and a status store.
import type { SupabaseClient } from '@supabase/supabase-js'
import { useSyncExternalStore } from 'react'
import { db, getMeta, setMeta } from '../db'
import { getSettings } from '../settings'
import { syncOnce, type Remote, type RemoteRecord } from './core'

export type SyncState = 'off' | 'signed-out' | 'idle' | 'syncing' | 'error'

export interface SyncStatus {
  state: SyncState
  email?: string
  lastSync?: number
  error?: string
  /** Likely the free Supabase project paused after a week without traffic */
  maybePaused?: boolean
}

let status: SyncStatus = { state: 'off' }
const listeners = new Set<() => void>()
function set(s: Partial<SyncStatus>) {
  status = { ...status, ...s }
  listeners.forEach((f) => f())
}
export const useSyncStatus = () =>
  useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => status,
    () => status,
  )

export function syncConfig(): { url: string; key: string } | null {
  const s = getSettings()
  const url = (s.supabaseUrl || import.meta.env.VITE_SUPABASE_URL || '').trim()
  const key = (s.supabaseKey || import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim()
  return url && key ? { url, key } : null
}

/** True when sync uses the server baked into this deployment (the owner's), not one set in Settings. */
export function usingBuiltInServer(): boolean {
  const s = getSettings()
  return !s.supabaseUrl && !!import.meta.env.VITE_SUPABASE_URL
}

let client: SupabaseClient | null = null
let clientKey = ''

async function getClient(): Promise<SupabaseClient | null> {
  const cfg = syncConfig()
  if (!cfg) return null
  const k = `${cfg.url}|${cfg.key}`
  if (client && clientKey === k) return client
  const { createClient } = await import('@supabase/supabase-js')
  client = createClient(cfg.url, cfg.key, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: 'kotoba-auth' },
  })
  clientKey = k
  return client
}

class SupabaseRemote implements Remote {
  constructor(private c: SupabaseClient) {}
  async push(records: RemoteRecord[]) {
    const { error } = await this.c.rpc('kotoba_push', { rows: records })
    if (error) throw error
  }
  async pull(since: number, limit: number) {
    const { data, error } = await this.c
      .from('kotoba_records')
      .select('collection,id,data,updated_at,deleted,seq')
      .gt('seq', since)
      .order('seq', { ascending: true })
      .limit(limit)
    if (error) throw error
    return (data ?? []) as RemoteRecord[]
  }
}

export async function refreshAuth() {
  const c = await getClient()
  if (!c) return set({ state: 'off', email: undefined })
  const { data } = await c.auth.getSession()
  const email = data.session?.user.email
  set({ state: email ? (status.state === 'syncing' ? 'syncing' : 'idle') : 'signed-out', email, lastSync: await getMeta<number | undefined>('lastSync', undefined) })
}

export async function sendCode(email: string) {
  const c = await getClient()
  if (!c) throw new Error('Sync is not configured')
  const { error } = await c.auth.signInWithOtp({ email, options: { shouldCreateUser: true } })
  if (error) throw error
}

export async function verifyCode(email: string, token: string) {
  const c = await getClient()
  if (!c) throw new Error('Sync is not configured')
  const { error } = await c.auth.verifyOtp({ email, token: token.trim(), type: 'email' })
  if (error) throw error
  await afterSignIn()
}

/**
 * Email + password: needs no emails at all (Supabase's built-in mailer can't send codes without custom SMTP),
 * and works inside the iOS Home Screen app.
 */
export async function signInWithPassword(email: string, password: string) {
  const c = await getClient()
  if (!c) throw new Error('Sync is not configured')
  const { error } = await c.auth.signInWithPassword({ email, password })
  if (error) throw error
  await afterSignIn()
}

/** Returns 'confirm-email' when the project still requires email confirmation. */
export async function signUpWithPassword(email: string, password: string): Promise<'signed-in' | 'confirm-email'> {
  const c = await getClient()
  if (!c) throw new Error('Sync is not configured')
  const { data, error } = await c.auth.signUp({ email, password })
  if (error) throw error
  if (!data.session) return 'confirm-email'
  await afterSignIn()
  return 'signed-in'
}

// First sign-in on this device: merge everything from the server.
async function afterSignIn() {
  await setMeta('syncCursor', 0)
  await refreshAuth()
  await syncNow()
}

export async function signOut() {
  const c = await getClient()
  await c?.auth.signOut()
  await setMeta('syncCursor', 0)
  set({ state: 'signed-out', email: undefined })
}

let running: Promise<void> | null = null
const FULL_RESYNC_MS = 24 * 3_600_000

export function syncNow(): Promise<void> {
  if (running) return running
  running = (async () => {
    try {
      const c = await getClient()
      if (!c) return set({ state: 'off' })
      const { data } = await c.auth.getSession()
      if (!data.session) return set({ state: 'signed-out', email: undefined })
      if (!navigator.onLine) return
      set({ state: 'syncing', email: data.session.user.email, error: undefined, maybePaused: false })
      // A periodic full pull guards against sequence numbers committed out of order.
      const lastFull = await getMeta<number>('lastFullSync', 0)
      const full = Date.now() - lastFull > FULL_RESYNC_MS
      const cursor = full ? 0 : await getMeta<number>('syncCursor', 0)
      const res = await syncOnce(db, new SupabaseRemote(c), { cursor })
      await setMeta('syncCursor', res.cursor)
      if (full) await setMeta('lastFullSync', Date.now())
      const now = Date.now()
      await setMeta('lastSync', now)
      set({ state: 'idle', lastSync: now })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e)
      const maybePaused = navigator.onLine && /fetch|network|5\d\d|paused|unavailable/i.test(msg)
      set({ state: 'error', error: msg, maybePaused })
    } finally {
      running = null
    }
  })()
  return running
}

let timer: ReturnType<typeof setTimeout> | undefined
/** Debounced sync after local writes. */
export function scheduleSync(ms = 5000) {
  if (status.state === 'off' || status.state === 'signed-out') return
  clearTimeout(timer)
  timer = setTimeout(() => void syncNow(), ms)
}

let started = false
/** Wire up triggers: launch, back online, back to foreground, and after local writes. */
export function startSync() {
  if (started) return
  started = true
  for (const t of [db.cards, db.reviewLogs, db.userWords, db.settings]) {
    t.hook('creating', (_k, obj) => {
      if ((obj as { dirty?: number }).dirty) scheduleSync()
    })
    t.hook('updating', (mods, _k, obj) => {
      const d = (mods as { dirty?: number }).dirty ?? (obj as { dirty?: number }).dirty
      if (d) scheduleSync()
    })
  }
  window.addEventListener('online', () => void syncNow())
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) void syncNow()
  })
  void refreshAuth().then(() => setTimeout(() => void syncNow(), 1500))
}

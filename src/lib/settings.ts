import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo } from 'react'
import { db } from './db'
import type { Lang } from './types'

export interface Settings {
  lang: Lang
  furigana: boolean
  theme: 'dark' | 'light' | 'system'
  /** Highest Genki lesson whose words may be introduced as new cards */
  currentLesson: number
  newPerDay: number
  /** New words per day in each custom deck (separate from the main limit) */
  deckNewPerDay: number
  /** Daily goal in answered cards */
  dailyGoal: number
  reviewStyle: 'flip' | 'type'
  /** Spaced-repetition algorithm: Anki's classic SM-2 (default) or FSRS */
  scheduler: 'anki' | 'fsrs'
  /** Which directions get cards: recognition (JP→meaning) and recall (meaning→JP) */
  recallCards: boolean
  retention: number
  leechThreshold: number
  ttsRate: number
  voiceURI: string
  autoplayAudio: boolean
  /** Sync config overrides (empty = use build-time defaults) */
  supabaseUrl: string
  supabaseKey: string
}

export const DEFAULT_SETTINGS: Settings = {
  lang: 'en',
  furigana: true,
  theme: 'dark',
  currentLesson: 10,
  newPerDay: 10,
  deckNewPerDay: 10,
  dailyGoal: 30,
  reviewStyle: 'flip',
  scheduler: 'anki',
  recallCards: true,
  retention: 0.9,
  leechThreshold: 8,
  ttsRate: 0.9,
  voiceURI: '',
  autoplayAudio: false,
  supabaseUrl: '',
  supabaseKey: '',
}

/** Settings that stay on this device (never synced). */
export const LOCAL_ONLY: (keyof Settings)[] = ['voiceURI', 'supabaseUrl', 'supabaseKey']

const SNAPSHOT_KEY = 'kotoba.settings'

function readSnapshot(): Settings {
  try {
    const raw = localStorage.getItem(SNAPSHOT_KEY)
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) }
  } catch {
    /* storage may be blocked */
  }
  return DEFAULT_SETTINGS
}

function writeSnapshot(s: Settings) {
  try {
    localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(s))
  } catch {
    /* ignore */
  }
}

let current: Settings = readSnapshot()
export const getSettings = () => current

/** Settings live in IndexedDB (so they sync); a localStorage snapshot makes the first paint correct. */
export function useSettings(): Settings {
  const rows = useLiveQuery(() => db.settings.toArray(), [])
  return useMemo(() => {
    if (!rows) return current
    const s: Settings = { ...DEFAULT_SETTINGS }
    for (const r of rows) if (r.key in s && !r.deleted) (s as unknown as Record<string, unknown>)[r.key] = r.value
    current = s
    writeSnapshot(s)
    return s
  }, [rows])
}

export async function setSetting<K extends keyof Settings>(key: K, value: Settings[K]) {
  current = { ...current, [key]: value }
  writeSnapshot(current)
  await db.settings.put({ key, value, updatedAt: Date.now(), dirty: LOCAL_ONLY.includes(key) ? 0 : 1 })
}

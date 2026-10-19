// A review session ordered the way Anki orders it: learning cards come back when their step is due
// (1 min, 10 min …), meanwhile the next review/new cards are shown. Pure functions on an immutable state,
// so every action can be undone by restoring the previous state.

import type { QueueItem } from './queue'

export const LEARN_AHEAD_MS = 20 * 60_000

export interface SessionCard extends QueueItem {
  /** Unique per appearance (the same card can appear several times in a session) */
  key: string
}

export interface Session {
  /** Reviews and new words still to show, in order */
  main: SessionCard[]
  /** Cards in learning steps, waiting until they are due */
  learning: { card: SessionCard; due: number }[]
  current: SessionCard | null
  answered: number
}

let seq = 0
const withKey = (it: QueueItem): SessionCard => ({ ...it, key: `k${++seq}` })

export function createSession(items: QueueItem[], now = Date.now()): Session {
  const main: SessionCard[] = []
  const learning: Session['learning'] = []
  for (const it of items) {
    if (it.learning && it.due !== undefined) learning.push({ card: withKey(it), due: it.due })
    else main.push(withKey(it))
  }
  return pickNext({ main, learning, current: null, answered: 0 }, now)
}

/** Due learning card first, then the next main card, then (with nothing else left) a learning card due soon. */
export function pickNext(s: Session, now = Date.now(), learnAhead = LEARN_AHEAD_MS): Session {
  const learning = [...s.learning].sort((a, b) => a.due - b.due)
  const first = learning[0]
  if (first && first.due <= now) return { ...s, current: first.card, learning: learning.slice(1) }
  if (s.main.length) return { ...s, current: s.main[0]!, main: s.main.slice(1), learning }
  if (first && first.due <= now + learnAhead) return { ...s, current: first.card, learning: learning.slice(1) }
  return { ...s, current: null, learning }
}

/** After answering the current card: a card still in learning steps comes back when its step is due. */
export function afterAnswer(s: Session, next: { due: number; learning: boolean }, now = Date.now()): Session {
  const learning = s.current && next.learning ? [...s.learning, { card: withKey({ ...s.current, kind: 'card', isNew: false }), due: next.due }] : s.learning
  return pickNext({ ...s, learning, current: null, answered: s.answered + 1 }, now)
}

/** After a new word's introduction: its first quiz comes right after the next card. */
export function afterIntro(s: Session, now = Date.now()): Session {
  if (!s.current) return s
  const main = [...s.main]
  main.splice(Math.min(1, main.length), 0, withKey({ ...s.current, kind: 'card' }))
  return pickNext({ ...s, main, current: null }, now)
}

/** Show waiting learning cards now, even if their step hasn't passed (when nothing else is left). */
export function learnAheadNow(s: Session, now = Date.now()): Session {
  return pickNext(s, now, Infinity)
}

export const remaining = (s: Session) => s.main.length + s.learning.length + (s.current ? 1 : 0)
export const nextLearningDue = (s: Session) => (s.learning.length ? Math.min(...s.learning.map((l) => l.due)) : undefined)

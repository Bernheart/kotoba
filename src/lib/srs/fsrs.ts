import { createEmptyCard, fsrs, generatorParameters, State, type Card, type FSRS } from 'ts-fsrs'
import type { CardRow } from '../db'
import type { Direction } from '../types'

let cache: { key: string; f: FSRS } | null = null

/** FSRS-6 scheduler (ts-fsrs) with short-term learning steps. No fuzz: the interval on a button must be the one you get. */
export function scheduler(retention = 0.9): FSRS {
  const key = String(retention)
  if (cache?.key === key) return cache.f
  const f = fsrs(
    generatorParameters({
      request_retention: retention,
      maximum_interval: 3650,
      enable_fuzz: false,
      enable_short_term: true,
      learning_steps: ['1m', '10m'],
      relearning_steps: ['10m'],
    }),
  )
  cache = { key, f }
  return f
}

export const cardId = (wordId: string, dir: Direction) => `${wordId}:${dir}`

export function rowToCard(r: CardRow): Card {
  return {
    due: new Date(r.due),
    stability: r.stability,
    difficulty: r.difficulty,
    elapsed_days: r.elapsed_days,
    scheduled_days: r.scheduled_days,
    learning_steps: r.learning_steps,
    reps: r.reps,
    lapses: r.lapses,
    state: r.state as State,
    last_review: r.last_review ? new Date(r.last_review) : undefined,
  }
}

export function cardToRow(c: Card, base: Pick<CardRow, 'id' | 'wordId' | 'dir' | 'leech' | 'suspended'>, now = Date.now()): CardRow {
  return {
    ...base,
    due: c.due.getTime(),
    stability: c.stability,
    difficulty: c.difficulty,
    elapsed_days: c.elapsed_days,
    scheduled_days: c.scheduled_days,
    learning_steps: c.learning_steps,
    reps: c.reps,
    lapses: c.lapses,
    state: c.state,
    last_review: c.last_review?.getTime(),
    updatedAt: now,
    dirty: 1,
  }
}

export function newCardRow(wordId: string, dir: Direction, now = Date.now()): CardRow {
  return cardToRow(createEmptyCard(new Date(now)), { id: cardId(wordId, dir), wordId, dir, leech: 0, suspended: 0 }, now)
}

/** Probability of recall right now (0–1); new cards → undefined. */
export function retrievability(r: CardRow, now = Date.now(), retention = 0.9): number | undefined {
  if (r.state === State.New || !r.last_review) return undefined
  return scheduler(retention).get_retrievability(rowToCard(r), new Date(now), false) as number
}

export { State }

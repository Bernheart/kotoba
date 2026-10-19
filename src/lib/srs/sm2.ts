// Anki's classic scheduler (SM-2 as implemented by Anki's v3 scheduler) with Anki's default deck options:
// learning steps 1m 10m · graduating interval 1d · easy interval 4d · starting ease 250% · easy bonus 130% ·
// hard interval 120% · relearning step 10m · new interval after a lapse 0% (→ 1 day) · minimum interval 1d.
// Intervals depend on the card's current interval, its ease (shaped by your past answers) and how many days
// actually passed since the last review — the same inputs Anki uses.

import { Rating, State, type Grade } from 'ts-fsrs'
import type { CardRow } from '../db'
import { dayDiff, DAY_MS, startOfStudyDayIn, studyDay } from '../time'

export const ANKI = {
  learnSteps: [1, 10], // minutes
  relearnSteps: [10],
  graduatingIvl: 1, // days
  easyIvl: 4,
  startEase: 2.5,
  minEase: 1.3,
  easyBonus: 1.3,
  hardMult: 1.2,
  newIvlPct: 0,
  minIvl: 1,
  maxIvl: 36500,
} as const

const MIN = 60_000

export type Sm2Fields = Pick<CardRow, 'state' | 'due' | 'scheduled_days' | 'learning_steps' | 'reps' | 'lapses' | 'last_review' | 'stability' | 'elapsed_days'> & {
  ease: number
}

export interface Sm2Outcome {
  fields: Sm2Fields
  /** Interval to show on the rating button (ms): the step delay, or the new interval in days */
  displayMs: number
}

/** Deterministic 0..1 from a string (so the interval shown on a button is the one you get). */
function seeded(key: string): number {
  let h = 2166136261
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619)
  h ^= h >>> 13
  h = Math.imul(h, 0x5bd1e995)
  h ^= h >>> 15
  return (h >>> 0) / 4294967296
}

/** Anki's interval fuzz: none below 2.5 days, then ±15% (2.5–7d), ±10% (7–20d), ±5% (20d+), at least ±1 day. */
export function fuzzBounds(ivl: number): [number, number] {
  if (ivl < 2.5) return [Math.round(ivl), Math.round(ivl)]
  let delta = 1
  for (const [start, end, factor] of [
    [2.5, 7, 0.15],
    [7, 20, 0.1],
    [20, Infinity, 0.05],
  ] as const) {
    delta += factor * Math.max(0, Math.min(ivl, end) - start)
  }
  return [Math.max(2, Math.round(ivl - delta)), Math.round(ivl + delta)]
}

function reviewIvl(raw: number, minimum: number, seed: string): number {
  const [lo, hi] = fuzzBounds(raw)
  const lower = Math.max(lo, minimum)
  const upper = Math.max(hi, lower)
  const v = lower + Math.floor(seeded(seed) * (1 + upper - lower))
  return Math.min(ANKI.maxIvl, Math.max(minimum, ANKI.minIvl, v))
}

/** Delay of the Hard button in (re)learning: first step → average of the first two steps (or 1.5× a single step). */
function hardDelay(steps: readonly number[], step: number): number {
  if (step > 0) return steps[step]!
  if (steps.length > 1) return (steps[0]! + steps[1]!) / 2
  return Math.min(steps[0]! * 1.5, steps[0]! + 1440)
}

function learnFields(card: CardRow, ease: number, state: State, step: number, delayMin: number, now: number, extra: Partial<Sm2Fields> = {}): Sm2Outcome {
  return {
    fields: {
      state,
      due: now + delayMin * MIN,
      scheduled_days: card.scheduled_days,
      learning_steps: step,
      reps: card.reps + 1,
      lapses: card.lapses,
      last_review: now,
      stability: card.stability,
      elapsed_days: 0,
      ease,
      ...extra,
    },
    displayMs: delayMin * MIN,
  }
}

function reviewFields(card: CardRow, ease: number, ivl: number, now: number, elapsed: number, extra: Partial<Sm2Fields> = {}): Sm2Outcome {
  return {
    fields: {
      state: State.Review,
      due: startOfStudyDayIn(now, ivl),
      scheduled_days: ivl,
      learning_steps: 0,
      reps: card.reps + 1,
      lapses: card.lapses,
      last_review: now,
      // interval doubles as "stability" so maturity (21d+), stats and leech cure work for both schedulers
      stability: ivl,
      elapsed_days: elapsed,
      ease,
      ...extra,
    },
    displayMs: ivl * DAY_MS,
  }
}

/** Next state of a card after a rating, following Anki's v3 SM-2 rules. */
export function sm2Next(card: CardRow, rating: Grade, now: number): Sm2Outcome {
  const ease = card.ease ?? ANKI.startEase
  const seed = `${card.id}|${card.reps}`

  // New and learning cards walk the learning steps.
  if (card.state === State.New || card.state === State.Learning) {
    const steps = ANKI.learnSteps
    const step = card.state === State.New ? 0 : Math.min(card.learning_steps, steps.length - 1)
    switch (rating) {
      case Rating.Again:
        return learnFields(card, ease, State.Learning, 0, steps[0], now)
      case Rating.Hard:
        return learnFields(card, ease, State.Learning, step, hardDelay(steps, step), now)
      case Rating.Good:
        if (step + 1 < steps.length) return learnFields(card, ease, State.Learning, step + 1, steps[step + 1]!, now)
        return reviewFields(card, ease, ANKI.graduatingIvl, now, 0)
      default:
        return reviewFields(card, ease, ANKI.easyIvl, now, 0)
    }
  }

  // Relearning after a lapse: steps, then back to review with the post-lapse interval.
  if (card.state === State.Relearning) {
    const steps = ANKI.relearnSteps
    const step = Math.min(card.learning_steps, steps.length - 1)
    const lapseIvl = Math.max(ANKI.minIvl, card.scheduled_days)
    switch (rating) {
      case Rating.Again:
        return learnFields(card, ease, State.Relearning, 0, steps[0], now)
      case Rating.Hard:
        return learnFields(card, ease, State.Relearning, step, hardDelay(steps, step), now)
      case Rating.Good:
        if (step + 1 < steps.length) return learnFields(card, ease, State.Relearning, step + 1, steps[step + 1]!, now)
        return reviewFields(card, ease, lapseIvl, now, 0)
      default:
        return reviewFields(card, ease, lapseIvl + 1, now, 0)
    }
  }

  // Review card.
  const ivl = Math.max(ANKI.minIvl, card.scheduled_days)
  const elapsed = card.last_review ? Math.max(0, dayDiff(studyDay(card.last_review), studyDay(now))) : ivl
  const daysLate = elapsed - ivl

  if (rating === Rating.Again) {
    const newEase = Math.max(ANKI.minEase, ease - 0.2)
    const lapseIvl = Math.max(ANKI.minIvl, Math.round(ivl * ANKI.newIvlPct))
    return learnFields(card, newEase, State.Relearning, 0, ANKI.relearnSteps[0], now, {
      lapses: card.lapses + 1,
      scheduled_days: lapseIvl,
      stability: lapseIvl,
    })
  }

  let hard: number
  let good: number
  let easy: number
  if (daysLate >= 0) {
    // On time or late: late days count fully for Easy and half for Good (Anki v3).
    hard = reviewIvl(ivl * ANKI.hardMult, ivl + 1, `${seed}|h`)
    good = reviewIvl((ivl + daysLate / 2) * ease, hard + 1, `${seed}|g`)
    easy = reviewIvl((ivl + daysLate) * ease * ANKI.easyBonus, good + 1, `${seed}|e`)
  } else {
    // Reviewed early: base the new interval on the time that actually passed, never shrinking on success.
    const reducedBonus = ANKI.easyBonus - (ANKI.easyBonus - 1) / 2
    hard = reviewIvl(Math.max(elapsed * ANKI.hardMult, (ivl * ANKI.hardMult) / 2), 1, `${seed}|h`)
    good = reviewIvl(Math.max(elapsed * ease, ivl), hard + 1, `${seed}|g`)
    easy = reviewIvl(Math.max(elapsed * ease, ivl) * reducedBonus, good + 1, `${seed}|e`)
  }
  if (rating === Rating.Hard) return reviewFields(card, Math.max(ANKI.minEase, ease - 0.15), hard, now, elapsed)
  if (rating === Rating.Good) return reviewFields(card, ease, good, now, elapsed)
  return reviewFields(card, ease + 0.15, easy, now, elapsed)
}

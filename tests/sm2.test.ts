import { describe, expect, it } from 'vitest'
import { Rating, type Grade } from 'ts-fsrs'
import { newCardRow, State } from '../src/lib/srs/fsrs'
import { nextRow, previewMs, replay } from '../src/lib/srs/schedule'
import { fuzzBounds } from '../src/lib/srs/sm2'
import { shortInterval } from '../src/lib/i18n'
import { DAY_MS, startOfStudyDayIn, studyDay } from '../src/lib/time'
import type { CardRow } from '../src/lib/db'

const anki = { scheduler: 'anki' as const }
const labels = (row: CardRow, now: number) => {
  const p = previewMs(row, now, anki)
  return [Rating.Again, Rating.Hard, Rating.Good, Rating.Easy].map((g) => shortInterval(p[g as Grade])).join(' / ')
}
const T0 = new Date(2026, 9, 1, 10).getTime()
/** answer on the day the card is due (10:00 that day) */
const onDueDay = (row: CardRow) => row.due + 6 * 3600_000

describe('Anki SM-2 (default deck options)', () => {
  it('new card: Again 1m, Hard 6m, Good 10m, Easy 4d', () => {
    expect(labels(newCardRow('w', 'recog', T0), T0)).toBe('1m / 6m / 10m / 4d')
  })

  it('second learning step: Again 1m, Hard 10m, Good 1d, Easy 4d', () => {
    const r = nextRow(newCardRow('w', 'recog', T0), Rating.Good, T0, anki)
    expect(r.state).toBe(State.Learning)
    expect(labels(r, T0 + 10 * 60000)).toBe('1m / 10m / 1d / 4d')
  })

  it('grows gently with Good like Anki: 1d → 3d → ~8d → ~20d', () => {
    let r = nextRow(newCardRow('w', 'recog', T0), Rating.Good, T0, anki)
    r = nextRow(r, Rating.Good, T0 + 10 * 60000, anki) // graduates
    expect(r.scheduled_days).toBe(1)
    expect(r.due).toBe(startOfStudyDayIn(T0, 1))
    expect(labels(r, onDueDay(r))).toBe('10m / 2d / 3d / 4d')
    const ivls = [1]
    for (let i = 0; i < 3; i++) {
      r = nextRow(r, Rating.Good, onDueDay(r), anki)
      ivls.push(r.scheduled_days)
    }
    expect(ivls[1]).toBe(3)
    expect(ivls[2]).toBeGreaterThanOrEqual(7)
    expect(ivls[2]).toBeLessThanOrEqual(9)
    expect(ivls[3]).toBeGreaterThanOrEqual(16)
    expect(ivls[3]).toBeLessThanOrEqual(23)
  })

  it('your answers shape the ease: Hard lowers it, Easy raises it, Again lowers it more', () => {
    let r = nextRow(newCardRow('w', 'recog', T0), Rating.Easy, T0, anki) // 4d, ease 2.5
    expect(r.ease).toBe(2.5)
    r = nextRow(r, Rating.Hard, onDueDay(r), anki)
    expect(r.ease).toBeCloseTo(2.35)
    r = nextRow(r, Rating.Easy, onDueDay(r), anki)
    expect(r.ease).toBeCloseTo(2.5)
    r = nextRow(r, Rating.Again, onDueDay(r), anki)
    expect(r.ease).toBeCloseTo(2.3)
    expect(r.state).toBe(State.Relearning)
    expect(r.lapses).toBe(1)
  })

  it('a lapse relearns for 10 minutes, then comes back after 1 day', () => {
    let r = nextRow(newCardRow('w', 'recog', T0), Rating.Easy, T0, anki)
    r = nextRow(r, Rating.Good, onDueDay(r), anki)
    const lapseAt = onDueDay(r)
    expect(labels(r, lapseAt).startsWith('10m / ')).toBe(true)
    r = nextRow(r, Rating.Again, lapseAt, anki)
    expect(r.due - lapseAt).toBe(10 * 60000)
    expect(labels(r, lapseAt + 10 * 60000)).toBe('10m / 15m / 1d / 2d')
    r = nextRow(r, Rating.Good, lapseAt + 10 * 60000, anki)
    expect(r.state).toBe(State.Review)
    expect(r.scheduled_days).toBe(1)
  })

  it('a late review earns a bigger interval (the time that actually passed counts)', () => {
    let r = nextRow(newCardRow('w', 'recog', T0), Rating.Easy, T0, anki) // due in 4d
    const onTime = nextRow(r, Rating.Good, onDueDay(r), anki).scheduled_days
    const late = nextRow(r, Rating.Good, onDueDay(r) + 6 * DAY_MS, anki).scheduled_days
    expect(late).toBeGreaterThan(onTime)
  })

  it('the interval on the button is exactly the interval you get', () => {
    let r = nextRow(newCardRow('w', 'recog', T0), Rating.Easy, T0, anki)
    for (let i = 0; i < 6; i++) r = nextRow(r, Rating.Good, onDueDay(r), anki)
    const at = onDueDay(r)
    const shown = previewMs(r, at, anki)
    for (const g of [Rating.Hard, Rating.Good, Rating.Easy] as Grade[]) {
      expect(nextRow(r, g, at, anki).scheduled_days * DAY_MS).toBe(shown[g])
      // and asking again a second later shows the same thing
      expect(previewMs(r, at + 1000, anki)[g]).toBe(shown[g])
    }
  })

  it('fuzz stays within Anki’s ranges and keeps Hard < Good < Easy', () => {
    expect(fuzzBounds(2)).toEqual([2, 2])
    expect(fuzzBounds(10)[0]).toBeGreaterThanOrEqual(8)
    expect(fuzzBounds(10)[1]).toBeLessThanOrEqual(12)
    let r = nextRow(newCardRow('x', 'recog', T0), Rating.Easy, T0, anki)
    for (let i = 0; i < 5; i++) {
      const p = previewMs(r, onDueDay(r), anki)
      expect(p[Rating.Hard]).toBeLessThan(p[Rating.Good])
      expect(p[Rating.Good]).toBeLessThan(p[Rating.Easy])
      r = nextRow(r, Rating.Good, onDueDay(r), anki)
    }
  })

  it('review cards are due for the whole day they fall on', () => {
    const r = nextRow(newCardRow('w', 'recog', T0), Rating.Easy, T0, anki)
    expect(new Date(r.due).getHours()).toBe(4)
    expect(studyDay(r.due)).toBe(studyDay(T0 + 4 * DAY_MS))
  })

  it('replaying an answer history gives the same card as answering live', () => {
    const answers: [Grade, number][] = [
      [Rating.Good, T0],
      [Rating.Good, T0 + 10 * 60000],
    ]
    let live = newCardRow('w', 'recog', T0)
    for (const [g, at] of answers) live = nextRow(live, g, at, anki)
    answers.push([Rating.Hard, onDueDay(live)])
    live = nextRow(live, Rating.Hard, onDueDay(live), anki)
    const replayed = replay('w', 'recog', answers.map(([rating, at]) => ({ rating, at })), anki)
    expect(replayed.scheduled_days).toBe(live.scheduled_days)
    expect(replayed.ease).toBe(live.ease)
    expect(replayed.due).toBe(live.due)
  })
})

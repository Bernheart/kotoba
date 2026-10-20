import { describe, expect, it } from 'vitest'
import { afterAnswer, afterIntro, createSession, learnAheadNow, nextLearningDue, pickNext, remaining } from '../src/lib/srs/session'
import type { QueueItem } from '../src/lib/srs/queue'

const card = (id: string, extra: Partial<QueueItem> = {}): QueueItem => ({ cardId: `${id}:recog`, wordId: id, dir: 'recog', kind: 'card', isNew: false, ...extra })
const T = 1_000_000_000_000
const MIN = 60_000

describe('review session order (like Anki)', () => {
  it('a card answered Good (10m) waits 10 minutes while other cards are shown', () => {
    let s = createSession([card('a'), card('b'), card('c'), card('d')], T)
    expect(s.current?.wordId).toBe('a')
    s = afterAnswer(s, { due: T + 10 * MIN, learning: true }, T) // a: 10m
    const seen: string[] = []
    for (let i = 0; i < 3; i++) {
      seen.push(s.current!.wordId)
      s = afterAnswer(s, { due: T + 5 * 86400000, learning: false }, T + (i + 1) * MIN)
    }
    expect(seen).toEqual(['b', 'c', 'd'])
    // nothing else left: learn ahead (within 20 min) brings "a" back
    expect(s.current?.wordId).toBe('a')
  })

  it('a due learning card comes before the next new/review card', () => {
    let s = createSession([card('a'), card('b'), card('c')], T)
    s = afterAnswer(s, { due: T + 1 * MIN, learning: true }, T) // a: Again (1m)
    expect(s.current?.wordId).toBe('b')
    s = afterAnswer(s, { due: T + 3 * 86400000, learning: false }, T + 2 * MIN) // 2 minutes later
    expect(s.current?.wordId).toBe('a')
  })

  it('learning cards from earlier wait for their due time', () => {
    const s = createSession([card('l', { learning: true, due: T + 8 * MIN }), card('r')], T)
    expect(s.current?.wordId).toBe('r')
    expect(remaining(s)).toBe(2)
  })

  it('a new word’s first quiz comes right after the next card', () => {
    let s = createSession([card('n', { kind: 'intro', isNew: true }), card('x'), card('y')], T)
    expect(s.current?.kind).toBe('intro')
    s = afterIntro(s, T)
    expect(s.current?.wordId).toBe('x')
    s = afterAnswer(s, { due: T + 86400000, learning: false }, T)
    expect(s.current).toMatchObject({ wordId: 'n', kind: 'card' })
  })

  it('when only far-away learning cards remain, the session pauses and can learn ahead', () => {
    let s = createSession([card('a')], T)
    s = afterAnswer(s, { due: T + 25 * MIN, learning: true }, T)
    expect(s.current).toBeNull()
    expect(nextLearningDue(s)).toBe(T + 25 * MIN)
    expect(pickNext(s, T + 26 * MIN).current?.wordId).toBe('a')
    expect(learnAheadNow(s, T).current?.wordId).toBe('a')
  })

  it('undo is just the previous state (states are never mutated)', () => {
    const s0 = createSession([card('a'), card('b')], T)
    const before = JSON.stringify(s0)
    afterAnswer(s0, { due: T + MIN, learning: true }, T)
    afterIntro(s0, T)
    expect(JSON.stringify(s0)).toBe(before)
  })
})

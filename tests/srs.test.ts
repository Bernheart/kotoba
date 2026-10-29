import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { Rating } from 'ts-fsrs'
import { db } from '../src/lib/db'
import { answerCard, buildQueue, isDue } from '../src/lib/srs/queue'
import { newCardRow, State } from '../src/lib/srs/fsrs'
import { computeStreak } from '../src/lib/stats'
import { endOfStudyDay, studyDay } from '../src/lib/time'
import { checkJapanese, checkMeaning } from '../src/lib/answer'
import type { Word } from '../src/lib/types'

const settings = { retention: 0.9, leechThreshold: 4, recallCards: true }
const word = (id: string, lesson = 1): Word => ({ id, japanese: id, kana: 'あ', en: 'x', pl: 'x', type: 'noun', genkiLesson: lesson, tags: [] })

beforeEach(async () => {
  await db.cards.clear()
  await db.reviewLogs.clear()
})

describe('study day', () => {
  it('rolls over at 4 AM', () => {
    expect(studyDay(new Date(2026, 9, 16, 3, 30))).toBe('2026-10-15')
    expect(studyDay(new Date(2026, 9, 16, 4, 0))).toBe('2026-10-16')
    expect(new Date(endOfStudyDay(new Date(2026, 9, 16, 23, 0).getTime())).getHours()).toBe(4)
  })
})

describe('queue', () => {
  it('introduces new words only up to the current lesson, within the daily budget', () => {
    const words = [word('a', 1), word('b', 2), word('c', 3)]
    const q = buildQueue({ words, cards: [], todayLogs: [], settings: { newPerDay: 10, currentLesson: 2, recallCards: true, lessonOrder: 'up' } })
    expect(q.map((i) => i.wordId)).toEqual(['a', 'b'])
    expect(q.every((i) => i.kind === 'intro')).toBe(true)
    const q2 = buildQueue({ words, cards: [], todayLogs: [], settings: { newPerDay: 1, currentLesson: 3, recallCards: true } })
    expect(q2).toHaveLength(1)
  })

  it('by default starts from the current lesson and works down', () => {
    const words = [word('a1', 1), word('b9', 9), word('c10', 10), word('d10', 10), word('e11', 11)]
    const ids = (currentLesson: number) =>
      buildQueue({ words, cards: [], todayLogs: [], settings: { newPerDay: 10, currentLesson, recallCards: true } }).map((i) => i.wordId)
    expect(ids(10)).toEqual(['c10', 'd10', 'b9', 'a1'])
    // moving the lesson up switches to the newer lesson right away
    expect(ids(11)[0]).toBe('e11')
  })

  it('shows only one card per word per day (sibling burying)', () => {
    const now = Date.now()
    const due = (dir: 'recog' | 'recall') => ({ ...newCardRow('a', dir, now - 86400000 * 5), state: State.Review, due: now - 1000, stability: 5, last_review: now - 86400000 * 5 })
    const q = buildQueue({ words: [word('a')], cards: [due('recog'), due('recall')], todayLogs: [], settings: { newPerDay: 0, currentLesson: 10, recallCards: true } })
    expect(q).toHaveLength(1)
  })
})

describe('answering', () => {
  it('schedules, logs, unlocks the recall card and buries it for today', async () => {
    const now = Date.now()
    let r = await answerCard('a', 'recog', Rating.Good, { ms: 1000, mode: 'review', correct: true, settings, now })
    expect(r.card.state).toBe(State.Learning)
    r = await answerCard('a', 'recog', Rating.Easy, { ms: 1000, mode: 'review', correct: true, settings, now: now + 11 * 60000 })
    expect(r.card.state).toBe(State.Review)
    const recall = await db.cards.get('a:recall')
    expect(recall?.state).toBe(State.New)
    // unlocked for tomorrow — never the same day it graduated
    expect(isDue(recall!, now + 12 * 60000)).toBe(false)
    expect(isDue(recall!, endOfStudyDay(now + 12 * 60000) + 3600000)).toBe(true)
    expect(await db.reviewLogs.count()).toBe(2)
  })

  it('flags a leech after the lapse threshold', async () => {
    let t = Date.now()
    let res = await answerCard('b', 'recog', Rating.Easy, { ms: 1, mode: 'review', correct: true, settings, now: t })
    let leeched = false
    for (let i = 0; i < 6 && !leeched; i++) {
      t = res.card.due + 1000
      res = await answerCard('b', 'recog', Rating.Again, { ms: 1, mode: 'review', correct: false, settings, now: t })
      leeched = res.becameLeech
      // graduate again so the next Again is a lapse
      t = res.card.due + 1000
      if (!leeched) res = await answerCard('b', 'recog', Rating.Easy, { ms: 1, mode: 'review', correct: true, settings, now: t })
    }
    expect(leeched).toBe(true)
    expect(res.card.lapses).toBe(settings.leechThreshold)
  })
})

describe('streak', () => {
  it('counts consecutive days and bridges one gap per week', () => {
    expect(computeStreak(['2026-10-14', '2026-10-15', '2026-10-16'], '2026-10-16').current).toBe(3)
    // yesterday counts while today is not done yet
    expect(computeStreak(['2026-10-14', '2026-10-15'], '2026-10-16').current).toBe(2)
    // a single missed day (Wed 14th) is frozen
    const s = computeStreak(['2026-10-12', '2026-10-13', '2026-10-15', '2026-10-16'], '2026-10-16')
    expect(s.current).toBe(4)
    expect(s.frozen).toEqual(['2026-10-14'])
    expect(s.freezeAvailable).toBe(false)
    // two missed days break it
    expect(computeStreak(['2026-10-12', '2026-10-15', '2026-10-16'], '2026-10-16').current).toBe(2)
  })
})

describe('answer checking', () => {
  const w = { japanese: '食べる', kana: 'たべる', en: 'to eat', pl: 'jeść', alt: [] }
  it('accepts kana, kanji, romaji-converted kana', () => {
    expect(checkJapanese('たべる', w)).toBe('correct')
    expect(checkJapanese('食べる', w)).toBe('correct')
    expect(checkJapanese('タベル', w)).toBe('correct')
    expect(checkJapanese('たべた', w)).toBe('wrong')
  })
  it('accepts either language, articles and small typos', () => {
    expect(checkMeaning('eat', w)).toBe('correct')
    expect(checkMeaning('to eat', w)).toBe('correct')
    expect(checkMeaning('jesc', w)).toBe('correct')
    expect(checkMeaning('university', { en: 'university; college', pl: 'uczelnia' })).toBe('correct')
    expect(checkMeaning('univercity', { en: 'university; college', pl: 'uczelnia' })).toBe('almost')
    expect(checkMeaning('drink', w)).toBe('wrong')
    expect(checkMeaning('to get married', { en: 'to get married ((結婚している) to be married)', pl: '' })).toBe('correct')
  })
  it('handles long vowels in katakana answers', () => {
    expect(checkJapanese('こーひー', { japanese: 'コーヒー', kana: 'コーヒー' })).toBe('correct')
    expect(checkJapanese('koohii'.length ? 'こおひい' : '', { japanese: 'コーヒー', kana: 'コーヒー' })).toBe('correct')
  })
})

describe('meaning → Japanese cards start once recognition holds', () => {
  const day = 86400000
  const base = Date.now()
  const recog = (ivl: number, reviewedAt: number) => ({ ...newCardRow('w', 'recog', base - 30 * day), state: State.Review, scheduled_days: ivl, stability: ivl, last_review: reviewedAt, due: reviewedAt + ivl * day })
  const recall = { ...newCardRow('w', 'recall', base - 30 * day), due: base - 20 * day } // unlocked long ago, never studied
  const q = (r: ReturnType<typeof recog>, after: number) =>
    buildQueue({ words: [word('w')], cards: [r, recall], todayLogs: [], settings: { newPerDay: 0, currentLesson: 10, recallCards: true, recallAfterDays: after }, now: base })

  it('waits while recognition is shorter than the threshold', () => {
    expect(q(recog(3, base - 2 * day), 7).some((i) => i.dir === 'recall')).toBe(false)
  })
  it('starts once recognition reaches the threshold', () => {
    expect(q(recog(8, base - 2 * day), 7).some((i) => i.dir === 'recall')).toBe(true)
  })
  it('never starts on the day its sibling was reviewed', () => {
    expect(q(recog(8, base - 60_000), 7).some((i) => i.dir === 'recall')).toBe(false)
  })
  it('"Next day" setting starts it right after graduating, like Anki', () => {
    expect(q(recog(1, base - 2 * day), 0).some((i) => i.dir === 'recall')).toBe(true)
  })
})

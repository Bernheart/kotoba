import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { asbplayerWords } from '../src/lib/asbplayer'
import { db, type ReviewLogRow } from '../src/lib/db'
import { deckLabel, inScope } from '../src/lib/decks'
import { applyImport, planImport } from '../src/lib/import/apply'
import { buildRows, parseText } from '../src/lib/import/parse'
import { EMPTY_FILTER, filterWords, groupWords, sortWords } from '../src/lib/library'
import type { WordProgress } from '../src/lib/progress'
import { newCardRow, State } from '../src/lib/srs/fsrs'
import { buildQueue } from '../src/lib/srs/queue'
import { computeDecks, computeToday } from '../src/lib/stats'
import { studyDay } from '../src/lib/time'
import type { Word } from '../src/lib/types'
import { buildVocab } from '../src/lib/vocab'

// Made-up fixture words (no real deck content).
const word = (id: string, extra: Partial<Word> = {}): Word => ({ id, japanese: id, kana: 'あ', en: id, pl: id, type: 'noun', genkiLesson: 1, tags: [], ...extra })
const deckWord = (id: string, frequency: number) => word(id, { deck: 'demo', frequency, genkiLesson: 0 })
const settings = { newPerDay: 10, deckNewPerDay: 2, currentLesson: 10, recallCards: true }

const dueCard = (wordId: string, now: number) => ({
  ...newCardRow(wordId, 'recog', now - 5 * 86_400_000),
  state: State.Review,
  due: now - 1000,
  stability: 5,
  last_review: now - 5 * 86_400_000,
})

const introLog = (wordId: string, now: number): ReviewLogRow => ({
  id: `log-${wordId}`,
  cardId: `${wordId}:recog`,
  wordId,
  mode: 'review',
  rating: 3,
  correct: 1,
  ms: 1000,
  at: now,
  day: studyDay(now),
  scheduled: 1,
  state: State.New,
  dirty: 0,
})

describe('custom decks: queues', () => {
  const now = Date.now()
  const words = [word('main-a'), word('main-b'), deckWord('d-third', 3), deckWord('d-first', 1), deckWord('d-second', 2)]

  it('keeps deck words out of the main queue (new and due)', () => {
    const cards = [dueCard('d-first', now), dueCard('main-a', now)]
    const q = buildQueue({ words, cards, todayLogs: [], settings, now })
    expect(q.map((i) => i.wordId).sort()).toEqual(['main-a', 'main-b'])
  })

  it('deck queue: only deck words, new words in frequency order, own daily limit', () => {
    const q = buildQueue({ words, cards: [], todayLogs: [], settings, now }, { deck: 'demo' })
    expect(q.map((i) => i.wordId)).toEqual(['d-first', 'd-second'])
    expect(q.every((i) => i.isNew)).toBe(true)
  })

  it('deck words are not gated by the current Genki lesson', () => {
    const q = buildQueue({ words, cards: [], todayLogs: [], settings: { ...settings, currentLesson: 0 }, now }, { deck: 'demo' })
    expect(q).toHaveLength(2)
  })

  it('main and deck new-word budgets are separate', () => {
    const many = [...Array.from({ length: 12 }, (_, i) => word(`m${i}`)), deckWord('d1', 1), deckWord('d2', 2), deckWord('d3', 3)]
    // 10 main words introduced today: the main budget is used up, the deck's is not
    const logs = Array.from({ length: 10 }, (_, i) => introLog(`m${i}`, now))
    const cards = Array.from({ length: 10 }, (_, i) => ({ ...newCardRow(`m${i}`, 'recog', now), state: State.Learning, due: now + 86_400_000 }))
    expect(buildQueue({ words: many, cards, todayLogs: logs, settings, now }).filter((i) => i.isNew)).toHaveLength(0)
    expect(buildQueue({ words: many, cards, todayLogs: logs, settings, now }, { deck: 'demo' }).filter((i) => i.isNew)).toHaveLength(2)
    // one deck word introduced today leaves one more for the deck
    const deckLogs = [...logs, introLog('d1', now)]
    const deckCards = [...cards, { ...newCardRow('d1', 'recog', now), state: State.Learning, due: now + 86_400_000 }]
    expect(buildQueue({ words: many, cards: deckCards, todayLogs: deckLogs, settings, now }, { deck: 'demo' }).map((i) => i.wordId)).toEqual(['d2'])
  })

  it('Today counts exclude deck words; deck stats count them', () => {
    const cards = [dueCard('d-first', now), { ...dueCard('d-second', now), leech: 1 as const }]
    const today = computeToday(words, cards, [], [], now)
    expect(today.due).toBe(0)
    expect(today.leeches).toBe(0)
    const [demo] = computeDecks(words, cards, [], now)
    expect(demo).toMatchObject({ deck: 'demo', total: 3, started: 2, due: 2 })
    expect(demo!.newAvailable).toBe(1) // limit 2, one candidate left (d-third)
  })
})

describe('custom decks: import', () => {
  const DECK_JSON = JSON.stringify({
    words: [
      {
        japanese: '試作',
        kana: 'しさく',
        en: 'prototype',
        pl: 'prototyp',
        type: 'noun',
        genkiLesson: 0,
        deck: 'demo',
        frequency: 2,
        tags: ['demo-1'],
        example: { ja: 'これは *{試作|しさく}* だ。', en: 'This is a prototype.', pl: 'To prototyp.', ref: 'S1E1 · 01:23' },
      },
      { japanese: 'ためし', kana: 'ためし', en: 'trial', pl: 'próba', type: 'noun', deck: 'demo', frequency: 1, tags: ['demo-1'] },
    ],
  })

  beforeEach(async () => {
    await db.userWords.clear()
  })

  it('keeps deck, frequency and the example ref; deck words get no lesson', () => {
    const rows = buildRows(parseText(DECK_JSON), [], { lesson: 7 })
    expect(rows[0]).toMatchObject({ deck: 'demo', frequency: 2, lesson: 0, typeGuessed: false })
    expect(rows[0]!.example).toMatchObject({ ref: 'S1E1 · 01:23', en: 'This is a prototype.' })
    expect(rows[1]).toMatchObject({ deck: 'demo', frequency: 1, lesson: 0 })
  })

  it('stores deck words as your own words, and re-importing updates them in place', async () => {
    const rows = buildRows(parseText(DECK_JSON), [], {})
    const res = await applyImport(planImport(rows, buildVocab([]).words), { updateLessons: true, defaultLesson: 5 })
    expect(res.added).toBe(2)
    let vocab = buildVocab(await db.userWords.toArray())
    const w = vocab.words.find((x) => x.japanese === '試作')!
    expect(w).toMatchObject({ source: 'user', deck: 'demo', frequency: 2, genkiLesson: 0 })
    expect(w.example?.ref).toBe('S1E1 · 01:23')
    expect(vocab.decks).toEqual(['demo'])
    expect(vocab.lessons).not.toContain(0)

    const updated = JSON.parse(DECK_JSON)
    updated.words[0].frequency = 5
    updated.words[0].tags = ['demo-2']
    updated.words[0].en = 'prototype; trial piece'
    const rows2 = buildRows(parseText(JSON.stringify(updated)), [], {})
    const plan = planImport(rows2, vocab.words)
    expect(plan.map((p) => p.action)).toEqual(['merge', 'merge'])
    await applyImport(plan, { updateLessons: true, defaultLesson: 0 })
    vocab = buildVocab(await db.userWords.toArray())
    const w2 = vocab.byId.get(w.id)!
    expect(w2).toMatchObject({ frequency: 5, en: 'prototype; trial piece', tags: ['demo-2'] })
    expect(vocab.words.filter((x) => x.deck === 'demo')).toHaveLength(2)
  })
})

describe('custom decks: words you also have elsewhere', () => {
  beforeEach(async () => {
    await db.userWords.clear()
  })

  it('a deck word with the same spelling as a lesson word becomes its own card', async () => {
    const lessonWord = buildVocab([]).words.find((w) => w.japanese === '食べる')!
    const json = JSON.stringify({
      words: [
        { japanese: '食べる', kana: 'たべる', en: 'to eat', pl: 'jeść', type: 'verb-ru', deck: 'demo-known', frequency: 1, tags: [], alt: ['たべる'] },
        { japanese: '今日', kana: 'きょう', furigana: '{今日|きょう}', en: 'today', pl: 'dziś', type: 'noun', deck: 'demo-known', frequency: 2, tags: [] },
      ],
    })
    const plan = planImport(buildRows(parseText(json), [], {}), buildVocab([]).words)
    expect(plan.map((p) => p.action)).toEqual(['new', 'new'])
    await applyImport(plan, { updateLessons: false, defaultLesson: 0 })
    const vocab = buildVocab(await db.userWords.toArray())
    const copies = vocab.words.filter((w) => w.japanese === '食べる')
    expect(copies.map((w) => w.deck ?? 'main').sort()).toEqual(['demo-known', 'main'])
    expect(vocab.byId.get(lessonWord.id)!.deck).toBeUndefined()
    expect(vocab.words.find((w) => w.japanese === '今日' && w.deck)!.furigana).toBe('{今日|きょう}')
    // a plain list import still merges into the lesson word, not the deck copy
    const plain = planImport(buildRows(parseText('食べる\tたべる\tto eat'), ['japanese', 'kana', 'en'], {}), vocab.words)
    expect(plain[0]!.target?.id).toBe(lessonWord.id)
  })
})

describe('custom decks: library and practice scope', () => {
  const vocab = buildVocab([
    { id: 'u-1', kind: 'custom', word: deckWord('u-1', 2), createdAt: 0, updatedAt: 0, dirty: 0 },
    { id: 'u-2', kind: 'custom', word: deckWord('u-2', 1), createdAt: 0, updatedAt: 0, dirty: 0 },
  ])

  it('scope: deck words count only when their deck is chosen', () => {
    expect(inScope({ deck: 'demo', genkiLesson: 0 }, [0, 1], [])).toBe(false)
    expect(inScope({ deck: 'demo', genkiLesson: 0 }, [], ['demo'])).toBe(true)
    expect(inScope({ genkiLesson: 3 }, [3], ['demo'])).toBe(true)
    const onlyDeck = filterWords(vocab.words, { ...EMPTY_FILTER, decks: ['demo'] })
    expect(onlyDeck.map((w) => w.id).sort()).toEqual(['u-1', 'u-2'])
    const lesson1 = filterWords(vocab.words, { ...EMPTY_FILTER, lessons: [1] })
    expect(lesson1.length).toBeGreaterThan(0)
    expect(lesson1.some((w) => w.deck)).toBe(false)
  })

  it('groups and sorts deck words after the lessons, in frequency order', () => {
    const sorted = sortWords(vocab.words, 'lesson')
    expect(sorted.slice(-2).map((w) => w.id)).toEqual(['u-2', 'u-1'])
    const groups = groupWords(sorted, 'lesson')
    expect(groups.at(-1)!.key).toBe('deck:demo')
    expect(groupWords(sorted, 'deck').map((g) => g.key)).toEqual(['', 'deck:demo'])
    expect(deckLabel('demo')).toBe('Demo')
    expect(deckLabel('my-show')).toBe('My show')
  })
})

describe('asbplayer export', () => {
  it('lists studied words once, one written form per line', () => {
    const p = (status: WordProgress['status']) => ({ status }) as WordProgress
    const progress = new Map([
      ['a', p('known')],
      ['b', p('learning')],
      ['c', p('new')],
      ['d', p('known')],
    ])
    const words = [
      { id: 'a', japanese: '食べる' },
      { id: 'b', japanese: '～年生' },
      { id: 'c', japanese: '飲む' },
      { id: 'd', japanese: '食べる' },
    ]
    expect(asbplayerWords(words, progress)).toEqual(['食べる', '年生'])
  })

  it('leaves out names, which Yomitan would split into pieces', () => {
    const progress = new Map([['n', { status: 'learning' } as WordProgress]])
    expect(asbplayerWords([{ id: 'n', japanese: 'ジンクス', deck: 'demo-names' }], progress)).toEqual([])
  })
})

import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { KotobaDB } from '../src/lib/db'
import {
  checkQuizReading,
  checkStroke,
  strokeFit,
  resample,
  checkWordReading,
  KANJI,
  KANJI_BY_CHAR,
  KANJI_LESSONS,
  makeKanjiQuiz,
  recordKanji,
  STROKES,
  weakFirst,
  type Pt,
} from '../src/lib/kanji'
import { MemoryRemote, syncOnce, type RemoteRecord } from '../src/lib/sync/core'

const KATAKANA = /^[ァ-ヺー]+$/
const HIRAGANA = /^[ぁ-ゖー()（）]+$/
/** 々 (Genki 133) is a repetition mark: the book gives it no reading. */
const NO_READING = new Set(['々'])

describe('kanji data', () => {
  it('has the 145 Genki I kanji over lessons 3–12, numbered as in the book', () => {
    expect(KANJI).toHaveLength(145)
    expect(KANJI_LESSONS).toEqual([3, 4, 5, 6, 7, 8, 9, 10, 11, 12])
    expect(KANJI.map((k) => k.n)).toEqual(Array.from({ length: 145 }, (_, i) => i + 1))
    expect(new Set(KANJI.map((k) => k.kanji)).size).toBe(145)
  })

  it('every kanji has a reading, EN + PL meaning, stroke data and an example word', () => {
    for (const k of KANJI) {
      if (!NO_READING.has(k.kanji)) expect(k.on.length + k.kun.length, k.kanji).toBeGreaterThan(0)
      expect(k.meaning.en.trim(), k.kanji).not.toBe('')
      expect(k.meaning.pl.trim(), k.kanji).not.toBe('')
      expect(STROKES[k.kanji]?.d.length, k.kanji).toBe(k.strokes)
      expect(k.words.length, k.kanji).toBeGreaterThan(0)
    }
  })

  it('stores on readings in katakana and kun readings in hiragana', () => {
    for (const k of KANJI) {
      for (const r of k.on) expect(r, `${k.kanji} on`).toMatch(KATAKANA)
      for (const r of k.kun) expect(r, `${k.kanji} kun`).toMatch(HIRAGANA)
    }
  })

  it('every example word has a reading, EN and PL meaning and a highlight flag', () => {
    for (const k of KANJI)
      for (const w of k.words) {
        expect(w.w, k.kanji).toContain(k.kanji)
        expect(w.r.trim(), w.w).not.toBe('')
        expect(w.en.trim(), w.w).not.toBe('')
        expect(w.pl.trim(), w.w).not.toBe('')
        expect(typeof w.hl, w.w).toBe('boolean')
      }
  })
})

describe('kanji quiz', () => {
  it('word → reading accepts the right kana and rejects wrong answers', () => {
    const w = KANJI_BY_CHAR.get('三')!.words.find((x) => x.w === '三時')!
    expect(checkWordReading('さんじ', w)).toBe(true)
    expect(checkWordReading('サンジ', w)).toBe(true)
    expect(checkWordReading('さんにち', w)).toBe(false)
    expect(checkWordReading('', w)).toBe(false)
    // the book's alternative readings both count
    expect(checkWordReading('なな', { r: 'しち／なな' })).toBe(true)
    expect(checkWordReading('しち', { r: 'しち／なな' })).toBe(true)
  })

  it('accepts either reading when a kanji lists the same spelling twice (家 いえ / うち)', () => {
    const ie = KANJI_BY_CHAR.get('家')!
    const uchi = ie.words.find((w) => w.w === '家' && w.r === 'うち')!
    expect(checkQuizReading('いえ', ie, uchi)).toBe(true)
    expect(checkQuizReading('うち', ie, uchi)).toBe(true)
    expect(checkQuizReading('へや', ie, uchi)).toBe(false)
  })

  it('fills the requested count even when words are shared between kanji', () => {
    for (const l of KANJI_LESSONS) {
      const pool = KANJI.filter((k) => k.lesson === l)
      expect(makeKanjiQuiz(pool, ['word-reading'], 30, 'en'), `L${l}`).toHaveLength(30)
      expect(makeKanjiQuiz(pool, ['word-reading', 'kanji-reading'], 10, 'en'), `L${l}`).toHaveLength(10)
    }
    // 々 alone has no reading question but still gets the other types
    expect(makeKanjiQuiz([KANJI_BY_CHAR.get('々')!], ['kanji-reading', 'kanji-meaning'], 3, 'en').every((q) => q.type === 'kanji-meaning')).toBe(true)
  })

  it('builds the four question types from the chosen lessons only', () => {
    const pool = KANJI.filter((k) => k.lesson === 3)
    const qs = makeKanjiQuiz(pool, ['word-reading', 'word-meaning', 'kanji-meaning', 'kanji-reading'], 12, 'en')
    expect(qs).toHaveLength(12)
    expect(new Set(qs.map((q) => q.type)).size).toBe(4)
    for (const q of qs) {
      expect(q.kanji.lesson).toBe(3)
      if (q.options) {
        expect(q.options).toHaveLength(4)
        expect(q.options).toContain(q.answer)
        expect(new Set(q.options).size).toBe(4)
      }
      if (q.type.startsWith('word')) expect(q.word?.w).toContain(q.kanji.kanji)
    }
  })

  it('uses the app language for meanings', () => {
    const pool = [KANJI_BY_CHAR.get('後')!]
    const [q] = makeKanjiQuiz(pool, ['kanji-meaning'], 1, 'pl')
    expect(q!.answer).toBe(KANJI_BY_CHAR.get('後')!.meaning.pl)
  })

  it('puts often-missed kanji first', () => {
    const pool = KANJI.filter((k) => k.lesson === 4)
    const weak = pool[5]!
    const stats = new Map([[`k:${weak.kanji}`, { id: `k:${weak.kanji}`, right: 0, wrong: 4, last: 1, updatedAt: 1, dirty: 0 as const }]])
    expect(weakFirst(pool, stats)[0]).toBe(weak)
  })
})

describe('draw-and-check', () => {
  const one = STROKES['一']!.pts
  const line = (from: Pt, to: Pt, n = 20): Pt[] => Array.from({ length: n }, (_, i) => [from[0] + ((to[0] - from[0]) * i) / (n - 1), from[1] + ((to[1] - from[1]) * i) / (n - 1)])

  it('accepts 一 drawn left → right and rejects right → left', () => {
    expect(checkStroke(line([12, 54], [96, 50]), 0, one)).toBe('ok')
    expect(checkStroke(line([96, 50], [12, 54]), 0, one)).toBe('direction')
    expect(checkStroke(line([50, 10], [50, 100]), 0, one)).toBe('shape')
  })

  it('accepts every model stroke of a kanji in order and spots strokes drawn out of order', () => {
    const model = STROKES['三']!.pts
    model.forEach((s, i) => expect(checkStroke(s, i, model)).toBe('ok'))
    expect(checkStroke(model[2]!, 0, model)).toBe('order')
  })
})

describe('draw-and-check leniency (simulated handwriting)', () => {
  // Deterministic "sloppy phone writing": the whole kanji smaller/bigger, shifted and slightly rotated,
  // each stroke a little off, wobbly, with ends too short or too long.
  let seed = 7
  const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32
  const between = (a: number, b: number) => a + (b - a) * rnd()
  const hand = (model: Pt[], g: { s: number; dx: number; dy: number; rot: number }): Pt[] => {
    let p = resample(model, 60)
    const a = between(-0.18, 0.18)
    const b = between(-0.18, 0.18)
    if (a > 0) p = p.slice(Math.floor(p.length * a))
    if (b > 0) p = p.slice(0, p.length - Math.floor(p.length * b))
    const lx = between(-4.5, 4.5)
    const ly = between(-4.5, 4.5)
    const ph = between(0, 6)
    const amp = between(0.75, 3)
    const [c, si] = [Math.cos(g.rot), Math.sin(g.rot)]
    return p.map(([x, y], i) => {
      const w = Math.sin(i / 6 + ph) * amp
      return [54.5 + g.s * ((x - 54.5) * c - (y - 54.5) * si) + g.dx + lx + w, 54.5 + g.s * ((x - 54.5) * si + (y - 54.5) * c) + g.dy + ly + w * 0.7]
    })
  }

  it('accepts sloppy but correct strokes and still rejects backwards and out-of-order ones', () => {
    let ok = 0
    let n = 0
    let backOk = 0
    let backN = 0
    let earlyOk = 0
    let earlyN = 0
    for (let rep = 0; rep < 2; rep++)
      for (const k of KANJI) {
        const model = STROKES[k.kanji]!.pts
        const g = { s: between(0.73, 1.12), dx: between(-12, 12), dy: between(-12, 12), rot: between(-0.09, 0.09) }
        const accepted: { drawn: Pt[]; model: Pt[] }[] = []
        model.forEach((m, i) => {
          const drawn = hand(m, g)
          const fit = strokeFit(accepted, drawn, m)
          n++
          if (checkStroke(drawn, i, model, fit) === 'ok') ok++
          const len = m.slice(1).reduce((s, q, j) => s + Math.hypot(q[0] - m[j]![0], q[1] - m[j]![1]), 0)
          if (len > 15) {
            backN++
            if (checkStroke([...drawn].reverse(), i, model, fit) === 'ok') backOk++
          }
          if (i + 1 < model.length) {
            earlyN++
            if (checkStroke(hand(model[i + 1]!, g), i, model, fit) === 'ok') earlyOk++
          }
          accepted.push({ drawn: resample(drawn, m.length), model: m })
        })
      }
    expect(ok / n).toBeGreaterThan(0.95)
    expect(backOk / backN).toBeLessThan(0.01)
    expect(earlyOk / earlyN).toBeLessThan(0.03)
  })

  it('learns a small, off-centre kanji from the first stroke', () => {
    const model = STROKES['三']!.pts
    const small = (pts: Pt[]) => pts.map(([x, y]) => [x * 0.6 + 30, y * 0.6 + 35] as Pt)
    const accepted: { drawn: Pt[]; model: Pt[] }[] = []
    for (let i = 0; i < model.length; i++) {
      const drawn = small(model[i]!)
      expect(checkStroke(drawn, i, model, strokeFit(accepted, drawn, model[i]!)), `stroke ${i + 1}`).toBe('ok')
      accepted.push({ drawn: resample(drawn, model[i]!.length), model: model[i]! })
    }
  })
})

describe('kanji stats', () => {
  it('records right/wrong per kanji and word, syncs to another device and never creates cards or logs', async () => {
    const mac = new KotobaDB(`mac-${Math.random()}`)
    const phone = new KotobaDB(`phone-${Math.random()}`)
    await mac.open()
    await phone.open()
    await recordKanji('k:後', true, 'read', 1000, mac)
    await recordKanji('k:後', false, 'read', 2000, mac)
    await recordKanji('k:後', true, 'write', 3000, mac)
    await recordKanji('w:後:午後', true, 'read', 3000, mac)
    expect(await mac.kanjiProgress.get('k:後')).toMatchObject({ right: 1, wrong: 1, writeRight: 1, dirty: 1 })
    expect(await mac.cards.count()).toBe(0)
    expect(await mac.reviewLogs.count()).toBe(0)

    const server = new MemoryRemote()
    await syncOnce(mac, server, { cursor: 0 })
    await syncOnce(phone, server, { cursor: 0 })
    expect(await phone.kanjiProgress.get('k:後')).toMatchObject({ right: 1, wrong: 1, writeRight: 1, dirty: 0 })
    expect(await phone.kanjiProgress.get('w:後:午後')).toMatchObject({ right: 1 })
  })

  it('keeps syncing everything else when the server rejects kanji stats (schema not migrated)', async () => {
    const mac = new KotobaDB(`mac-${Math.random()}`)
    await mac.open()
    const server = new MemoryRemote()
    const strict = {
      push: async (rs: RemoteRecord[]) => {
        if (rs.some((r) => r.collection === 'kanji')) throw new Error('violates check constraint')
        return server.push(rs)
      },
      pull: server.pull.bind(server),
    }
    await mac.settings.put({ key: 'lang', value: 'pl', updatedAt: 1, dirty: 1 })
    await recordKanji('k:一', true, 'read', 1000, mac)
    const res = await syncOnce(mac, strict, { cursor: 0 })
    expect(res.optionalError).toMatch(/check constraint/)
    expect(await mac.settings.where('dirty').equals(1).count()).toBe(0)
    expect((await mac.kanjiProgress.get('k:一'))?.dirty).toBe(1)
  })
})

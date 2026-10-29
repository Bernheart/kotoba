import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildRows, detectRoles, lessonFromFilename, parseText, splitJapanese } from '../src/lib/import/parse'
import { missingBuiltin, planImport } from '../src/lib/import/apply'
import { buildVocab } from '../src/lib/vocab'
import { guessType } from '../src/lib/jp/guess'

// Fixtures mirror the three formats of the user's own lists (not their content).
const TSV = 'だいがく\tcollege; university\nせんせい\tteacher; Professor . . .\n～ねんせい\t. . . year student\n'
const QUOTED = '"おかね","money"\n"でんしゃ","train"\n"シャワー","shower"\n'
const KANJI = '"午前","(ごぜん)\nA. M."\n"後ろ","(うしろ)\nback； behind"\n"一日（ついたち）","first day of a month"\n'

describe('import parsing', () => {
  it('reads TSV kana lists', () => {
    const t = parseText(TSV)
    expect(t.format).toBe('tsv')
    const roles = detectRoles(t)
    expect(roles).toEqual(['japanese', 'en'])
    const rows = buildRows(t, roles, { lesson: 1 })
    expect(rows[0]).toMatchObject({ japanese: 'だいがく', kana: 'だいがく', en: 'college; university', lesson: 1 })
    expect(rows[1]!.en).toBe('teacher; Professor…')
    expect(rows[2]).toMatchObject({ japanese: '～ねんせい', en: '… year student' })
  })

  it('reads quoted CSV', () => {
    const t = parseText(QUOTED)
    expect(t.format).toBe('csv')
    const rows = buildRows(t, detectRoles(t))
    expect(rows.map((r) => r.japanese)).toEqual(['おかね', 'でんしゃ', 'シャワー'])
    expect(rows[2]!.type).toBe('noun')
  })

  it('reads kanji lists with the reading inside the meaning cell', () => {
    const t = parseText(KANJI)
    const roles = detectRoles(t)
    expect(roles).toEqual(['japanese', 'en'])
    const rows = buildRows(t, roles)
    expect(rows[0]).toMatchObject({ japanese: '午前', kana: 'ごぜん', en: 'A. M.' })
    expect(rows[1]).toMatchObject({ japanese: '後ろ', kana: 'うしろ', en: 'back; behind' })
    expect(rows[2]).toMatchObject({ japanese: '一日', kana: 'ついたち', en: 'first day of a month' })
    expect(rows.every((r) => !r.problem)).toBe(true)
  })

  it('splits inline readings and Anki furigana', () => {
    expect(splitJapanese('一日（ついたち）')).toEqual({ japanese: '一日', kana: 'ついたち' })
    expect(splitJapanese('日本語[にほんご]')).toEqual({ japanese: '日本語', kana: 'にほんご' })
  })

  it('detects headers and JSON', () => {
    const t = parseText('Japanese,Reading,English,Polish\n食べる,たべる,to eat,jeść\n')
    expect(t.hasHeader).toBe(true)
    const rows = buildRows(t, detectRoles(t))
    expect(rows[0]).toMatchObject({ japanese: '食べる', kana: 'たべる', en: 'to eat', pl: 'jeść', type: 'verb-ru' })
    const j = parseText('[{"kanji":"猫","reading":"ねこ","meaning":"cat"}]')
    expect(buildRows(j, [])[0]).toMatchObject({ japanese: '猫', kana: 'ねこ', en: 'cat' })
  })

  it('takes the lesson from the file name', () => {
    expect(lessonFromFilename('genki9.csv')).toBe(9)
    expect(lessonFromFilename('genki6_kanji.csv')).toBe(6)
    expect(lessonFromFilename('import_lesson3.csv')).toBe(3)
    expect(lessonFromFilename('genki_calendar.csv')).toBeUndefined()
  })

  it('merges with existing words instead of duplicating', () => {
    const vocab = buildVocab([])
    const rows = buildRows(parseText(TSV), ['japanese', 'en'])
    const plan = planImport(rows, vocab.words)
    expect(plan[0]!.action).toBe('merge') // だいがく matches built-in 大学
    expect(plan[0]!.target!.japanese).toBe('大学')
  })
})

describe('type guessing', () => {
  it.each([
    ['たべる', 'to eat', 'verb-ru'],
    ['のむ', 'to drink', 'verb-u'],
    ['かえる', 'to go back', 'verb-u'],
    ['べんきょうする', 'to study', 'verb-irr'],
    ['たかい', 'expensive', 'i-adj'],
    ['きれい', 'beautiful', 'na-adj'],
    ['とけい', 'watch', 'noun'],
  ])('%s (%s) → %s', (kana, en, type) => expect(guessType(kana, en).type).toBe(type))
})

// Runs only on the developer's machine, against the real lists (never committed).
const USER_CSV = join(__dirname, '..', '..', 'csv')
describe.skipIf(!existsSync(USER_CSV))("user's own CSV files", () => {
  const files = existsSync(USER_CSV) ? readdirSync(USER_CSV).filter((f) => f.endsWith('.csv')) : []
  it.each(files)('%s parses with few problems', (f) => {
    const t = parseText(readFileSync(join(USER_CSV, f), 'utf8'))
    const rows = buildRows(t, detectRoles(t), { lesson: lessonFromFilename(f) })
    const bad = rows.filter((r) => r.problem)
    expect(rows.length).toBeGreaterThan(5)
    expect(bad.length / rows.length, JSON.stringify(bad.slice(0, 3))).toBeLessThan(0.1)
  })
})

describe('replacing the word list', () => {
  it('lists the built-in words a full word list leaves out (never your own or deck words)', () => {
    const { words } = buildVocab([
      { id: 'u-mine', kind: 'custom', word: { japanese: 'ねこ', kana: 'ねこ', en: 'cat' }, createdAt: 0, updatedAt: 0, dirty: 0 },
    ])
    const builtin = words.filter((w) => w.source === 'builtin')
    const kept = builtin.slice(0, 5)
    const t = parseText(JSON.stringify(kept.map((w) => ({ japanese: w.japanese, kana: w.kana, en: w.en }))))
    const plan = planImport(buildRows(t, detectRoles(t)), words)
    const missing = missingBuiltin(plan, words)
    expect(missing).toHaveLength(builtin.length - 5)
    expect(missing.some((w) => w.id === 'u-mine' || kept.includes(w))).toBe(false)
  })
})

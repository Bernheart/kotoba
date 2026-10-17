import Papa from 'papaparse'
import { hasKanji, isKanaOnly, normalizeKana } from '../jp/chars'
import { guessType } from '../jp/guess'
import { fromAnkiFurigana, parseMarkup } from '../jp/markup'
import { WORD_TYPES, type ExampleSentence, type Lang, type Word, type WordType } from '../types'

export type ColRole = 'ignore' | 'japanese' | 'kana' | 'en' | 'pl' | 'type' | 'lesson' | 'tags' | 'example'
export const COL_ROLES: ColRole[] = ['ignore', 'japanese', 'kana', 'en', 'pl', 'type', 'lesson', 'tags', 'example']

export interface ParsedTable {
  format: 'csv' | 'tsv' | 'semicolon' | 'lines' | 'json'
  rows: string[][]
  hasHeader: boolean
  /** Raw JSON records (format = json) */
  records?: Record<string, unknown>[]
  backup?: boolean
}

export interface ImportRow {
  japanese: string
  kana: string
  alt?: string[]
  en: string
  pl: string
  type: WordType
  typeGuessed: boolean
  lesson?: number
  tags: string[]
  example?: ExampleSentence
  /** Custom deck (JSON imports only); deck words keep their frequency rank for the study order */
  deck?: string
  frequency?: number
  /** Furigana override / speech text (JSON imports only) */
  furigana?: string
  tts?: string
  problem?: 'missing-japanese' | 'missing-reading'
}

const HEADER_WORDS: [RegExp, ColRole][] = [
  [/^(japanese|kanji|word|expression|front|vocab|日本語|単語|言葉|japoński)$/i, 'japanese'],
  [/^(kana|reading|readings|hiragana|furigana|yomi|読み|よみ|czytanie)$/i, 'kana'],
  [/^(english|en|meaning|meanings|back|definition|gloss|angielski)$/i, 'en'],
  [/^(polish|pl|polski|znaczenie)$/i, 'pl'],
  [/^(type|pos|part of speech|typ)$/i, 'type'],
  [/^(lesson|genkilesson|chapter|lekcja)$/i, 'lesson'],
  [/^(tags?|tagi)$/i, 'tags'],
  [/^(example|sentence|zdanie|przykład)$/i, 'example'],
]

const stripHtml = (s: string) =>
  s
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')

export function cleanMeaning(s: string): string {
  return stripHtml(s)
    .replace(/\s?\.(?:\s?\.){2}/g, '…')
    .replace(/；/g, '; ')
    .replace(/\s*\n\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\s+([;,])/g, '$1')
    .trim()
}

const KANA_LIST = '[\\p{Script=Hiragana}\\p{Script=Katakana}ー～〜・\\s；;／/、,]+?'
/** "(ごぜん)\nA. M." · "higashi (ひがし)\neast" · "juppun, jippun (じゅっぷん；じっぷん)\n10 minutes" */
const READING_IN_PARENS_AT_START = new RegExp(`^\\s*[a-z ,'’-]*\\s*[（(]\\s*(${KANA_LIST})\\s*[）)]\\s*([\\s\\S]*)$`, 'iu')
/** "とうきょう\nTokyo" */
const KANA_LINE_AT_START = /^\s*([\p{Script=Hiragana}\p{Script=Katakana}ー～〜；;／/、]+)\s*\n([\s\S]*)$/u
const JP_WITH_READING = /^\s*([^（(]+?)\s*[（(]\s*([\p{Script=Hiragana}\p{Script=Katakana}ー～〜]+)\s*[）)]\s*$/u

/** "しち／なな" → { kana: 'しち', alt: ['なな'] } */
export function splitReadings(s: string): { kana: string; alt: string[] } {
  const parts = s
    .split(/[；;／/、,]/)
    .map((x) => x.replace(/\s+/g, ''))
    .filter(Boolean)
  return { kana: parts[0] ?? '', alt: parts.slice(1) }
}

export function splitJapanese(cell: string): { japanese: string; kana?: string } {
  const c = stripHtml(cell).trim()
  if (!c) return { japanese: '' }
  if (/\[[^\]]+\]/.test(c)) {
    const s = parseMarkup(fromAnkiFurigana(c.replace(/\s+/g, '')))
    return { japanese: s.plain, kana: s.kana }
  }
  const m = JP_WITH_READING.exec(c)
  if (m) return { japanese: m[1]!.trim(), kana: m[2]!.trim() }
  if (isKanaOnly(c)) return { japanese: c.replace(/\s+/g, ''), kana: c.replace(/\s+/g, '') }
  return { japanese: c }
}

/** Pull a reading off the start of a meaning cell (several list formats put it there). */
export function splitLeadingReading(cell: string): { kana?: string; rest: string } {
  const c = stripHtml(cell)
  const m = READING_IN_PARENS_AT_START.exec(c) ?? KANA_LINE_AT_START.exec(c)
  return m ? { kana: m[1]!, rest: m[2]! } : { rest: cell }
}

/**
 * "ありがとう ほんとうに ありがとう" + "thank you Thank you, really." → word + example sentence
 * (lists that append an example after the word, separated by a space). When the word has kanji and the
 * example is in kana, the word's reading is recovered from the example ("勝った やった、かった！" → かった).
 */
export function splitWordAndExample(
  jp: string,
  meaning: string,
): { jp: string; meaning: string; reading?: string; example?: ExampleSentence } {
  const c = stripHtml(jp).trim()
  const sp = c.search(/[\s　]/)
  if (sp < 0) return { jp: c, meaning }
  const word = c.slice(0, sp).replace(/[？！。?!…]+$/, '')
  const sentence = c.slice(sp).trim()
  const m = /^(.+?)\s+([A-Z][\s\S]*)$/.exec(meaning.trim())
  const enWord = m ? m[1]! : meaning
  const enSentence = m ? m[2]! : ''
  let reading: string | undefined
  let marked = sentence.includes(word) ? sentence.replace(word, `*${word}*`) : sentence
  if (hasKanji(word)) {
    const runs = alignPattern(word)
    const tokens = sentence.split(/[\s　、。！？!?…,.]+/).filter((t) => t && isKanaOnly(t))
    const hits = tokens.filter((t) => runs.test(t))
    const allKanji = [...word].every((ch) => hasKanji(ch))
    reading = allKanji ? hits[0] : hits.at(-1)
    if (!reading) {
      const joined = sentence.replace(/[\s　、。！？!?…,.]+/g, '')
      if (isKanaOnly(joined) && runs.test(joined)) reading = joined
    }
    if (reading && !sentence.includes(word) && sentence.includes(reading)) {
      const idx = sentence.lastIndexOf(reading)
      marked = allKanji ? sentence.replace(reading, `*${reading}*`) : `${sentence.slice(0, idx)}*${reading}*${sentence.slice(idx + reading.length)}`
    }
  }
  const bare = sentence.replace(/[\s　、。！？!?…,.]+/g, '')
  const isJustReading = reading !== undefined && bare === reading
  return {
    jp: word,
    meaning: enWord,
    reading,
    example: isJustReading || bare === word ? undefined : { ja: marked, en: enSentence, pl: '' },
  }
}

/** Regex matching a kana token that could be the reading of `word` (kanji runs = wildcards). */
function alignPattern(word: string): RegExp {
  let src = ''
  let inKanji = false
  for (const ch of word) {
    if (hasKanji(ch)) {
      if (!inKanji) src += '(.+?)'
      inKanji = true
    } else {
      src += ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      inKanji = false
    }
  }
  return new RegExp(`^${src}$`, 'u')
}

export function lessonFromFilename(name: string): number | undefined {
  const m = /(?:genki|lesson|lekcja|chapter|^g|_g|l)[ _-]?(\d{1,2})(?!\d)/i.exec(name)
  return m ? Number(m[1]) : undefined
}

export function parseText(text: string): ParsedTable {
  const t = text.replace(/^﻿/, '').trim()
  if (t.startsWith('{') || t.startsWith('[')) {
    try {
      const json = JSON.parse(t)
      if (json && typeof json === 'object' && 'kotobaBackup' in json) return { format: 'json', rows: [], hasHeader: false, records: [], backup: true }
      const arr: unknown = Array.isArray(json) ? json : (json.words ?? json.items ?? json.data ?? [])
      const records = (Array.isArray(arr) ? arr : []).filter((r): r is Record<string, unknown> => !!r && typeof r === 'object')
      return { format: 'json', rows: [], hasHeader: false, records }
    } catch {
      /* fall through to CSV */
    }
  }
  const res = Papa.parse<string[]>(t, { delimiter: '', skipEmptyLines: 'greedy' })
  const rows = res.data.map((r) => r.map((c) => (c ?? '').trim())).filter((r) => r.some((c) => c))
  const d = res.meta.delimiter
  const format: ParsedTable['format'] = d === '\t' ? 'tsv' : d === ';' ? 'semicolon' : rows.every((r) => r.length === 1) ? 'lines' : 'csv'
  const first = rows[0] ?? []
  const hasHeader = first.length > 0 && first.filter((c) => HEADER_WORDS.some(([re]) => re.test(c.trim()))).length >= Math.min(2, first.length)
  return { format, rows, hasHeader }
}

const PL_CHARS = /[ąćęłńóśźż]/i
const JP_CHARS = /[぀-ヿ㐀-鿿々]/

export function detectRoles(table: ParsedTable, meaningLang: Lang = 'en'): ColRole[] {
  const width = Math.max(0, ...table.rows.map((r) => r.length))
  const roles: ColRole[] = Array(width).fill('ignore')
  if (table.hasHeader) {
    table.rows[0]!.forEach((h, i) => {
      const hit = HEADER_WORDS.find(([re]) => re.test(h.trim()))
      if (hit) roles[i] = hit[1]
    })
    if (roles.some((r) => r !== 'ignore')) return roles
  }
  const body = table.rows.slice(table.hasHeader ? 1 : 0, 200)
  const stats = Array.from({ length: width }, (_, i) => {
    const cells = body.map((r) => r[i] ?? '').filter(Boolean)
    const n = cells.length || 1
    const frac = (f: (c: string) => boolean) => cells.filter(f).length / n
    return {
      i,
      jp: frac((c) => JP_CHARS.test(c)),
      kanji: frac((c) => hasKanji(c)),
      kanaOnly: frac((c) => isKanaOnly(c)),
      latin: frac((c) => /[a-z]/i.test(c)),
      pl: frac((c) => PL_CHARS.test(c)),
      num: frac((c) => /^\d{1,2}$/.test(c)),
    }
  })
  const jpCols = stats.filter((s) => s.jp > 0.6 && s.latin < 0.4)
  if (jpCols.length) {
    const withKanji = [...jpCols].sort((a, b) => b.kanji - a.kanji)[0]!
    const kanaCol = jpCols.find((s) => s !== withKanji && s.kanaOnly > 0.8)
    if (kanaCol && withKanji.kanji > 0.2) {
      roles[withKanji.i] = 'japanese'
      roles[kanaCol.i] = 'kana'
    } else {
      roles[jpCols[0]!.i] = 'japanese'
    }
  }
  const latinCols = stats.filter((s) => roles[s.i] === 'ignore' && s.latin > 0.5)
  let usedMeaning = false
  for (const s of latinCols) {
    if (s.pl > 0.1 && !roles.includes('pl')) roles[s.i] = 'pl'
    else if (!usedMeaning) {
      roles[s.i] = meaningLang
      usedMeaning = true
    }
  }
  const numCol = stats.find((s) => roles[s.i] === 'ignore' && s.num > 0.8)
  if (numCol) roles[numCol.i] = 'lesson'
  return roles
}

const TYPE_ALIASES: [RegExp, WordType][] = [
  [/^(u-?verb|godan|v5|verb-u|czasownik u)/i, 'verb-u'],
  [/^(ru-?verb|ichidan|v1|verb-ru|czasownik ru)/i, 'verb-ru'],
  [/^(irr|irregular|vs|suru|verb-irr)/i, 'verb-irr'],
  [/^(i-?adj|adj-i|い)/i, 'i-adj'],
  [/^(na-?adj|adj-na|な)/i, 'na-adj'],
  [/^(adv)/i, 'adverb'],
  [/^(prt|particle)/i, 'particle'],
  [/^(exp|expression|phrase)/i, 'expression'],
  [/^(ctr|counter)/i, 'counter'],
  [/^(num|number)/i, 'number'],
  [/^(pron|pronoun)/i, 'pronoun'],
  [/^(n|noun)$/i, 'noun'],
]

function mapType(s: string): WordType | undefined {
  const t = s.trim()
  if ((WORD_TYPES as readonly string[]).includes(t)) return t as WordType
  return TYPE_ALIASES.find(([re]) => re.test(t))?.[1]
}

function finishRow(r: Omit<ImportRow, 'type' | 'typeGuessed' | 'problem'> & { type?: WordType }): ImportRow {
  let { japanese, kana } = r
  if (!japanese && kana) japanese = kana
  if (japanese && !kana && isKanaOnly(japanese)) kana = japanese
  const guess = guessType(kana, r.en, japanese)
  const out: ImportRow = { ...r, japanese, kana, type: r.type ?? guess.type, typeGuessed: !r.type }
  if (!japanese) out.problem = 'missing-japanese'
  else if (!kana || !isKanaOnly(kana)) out.problem = 'missing-reading'
  return out
}

export function buildRows(
  table: ParsedTable,
  roles: ColRole[],
  opts: { lesson?: number; tags?: string[] } = {},
): ImportRow[] {
  if (table.format === 'json') return (table.records ?? []).map((r) => fromRecord(r, opts))
  const body = table.rows.slice(table.hasHeader ? 1 : 0)
  return body.map((cells) => {
    const get = (role: ColRole) => {
      const i = roles.indexOf(role)
      return i >= 0 ? (cells[i] ?? '') : ''
    }
    const meaningCells = { en: get('en'), pl: get('pl') }
    let jpCell = get('japanese')
    let inlineExample: ExampleSentence | undefined
    // "word example-sentence" in one cell (no kanji reading inside parentheses)
    if (/[\s　]/.test(jpCell.trim()) && !/[（(]/.test(jpCell)) {
      const lang = meaningCells.en ? 'en' : 'pl'
      const split = splitWordAndExample(jpCell, meaningCells[lang])
      jpCell = split.reading ? `${split.jp}（${split.reading}）` : split.jp
      meaningCells[lang] = split.meaning
      inlineExample = split.example && (lang === 'pl' ? { ...split.example, pl: split.example.en, en: '' } : split.example)
    }
    const jp = splitJapanese(jpCell)
    let readings = splitReadings(get('kana') ? stripHtml(get('kana')) : (jp.kana ?? ''))
    for (const k of ['en', 'pl'] as const) {
      const lead = splitLeadingReading(meaningCells[k])
      if (lead.kana) {
        if (!readings.kana || readings.kana === jp.japanese) readings = splitReadings(lead.kana)
        meaningCells[k] = lead.rest
      }
    }
    const lessonCell = Number(get('lesson'))
    const tagCell = get('tags')
    const ex = get('example')
    return finishRow({
      japanese: jp.japanese,
      kana: readings.kana,
      ...(readings.alt.length ? { alt: readings.alt } : {}),
      en: cleanMeaning(meaningCells.en),
      pl: cleanMeaning(meaningCells.pl),
      type: mapType(get('type')),
      lesson: Number.isFinite(lessonCell) && lessonCell > 0 ? lessonCell : opts.lesson,
      tags: [...new Set([...(opts.tags ?? []), ...tagCell.split(/[,\s]+/).filter(Boolean)])],
      example: ex ? { ja: fromAnkiFurigana(ex), en: '', pl: '' } : inlineExample,
    })
  })
}

function pick(r: Record<string, unknown>, keys: string[]): string {
  for (const k of Object.keys(r)) if (keys.includes(k.toLowerCase())) return String(r[k] ?? '')
  return ''
}

function fromRecord(r: Record<string, unknown>, opts: { lesson?: number; tags?: string[] }): ImportRow {
  const jp = splitJapanese(pick(r, ['japanese', 'kanji', 'word', 'expression', 'front', 'jp']))
  const kana = pick(r, ['kana', 'reading', 'hiragana', 'yomi', 'furigana']) || jp.kana || ''
  const lesson = Number(pick(r, ['genkilesson', 'lesson', 'chapter']))
  const ex = r.example ?? r.exampleSentence
  const tags = Array.isArray(r.tags) ? (r.tags as string[]) : String(r.tags ?? '').split(/[,\s]+/).filter(Boolean)
  const deck = pick(r, ['deck']).trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  const frequency = Number(pick(r, ['frequency', 'rank']))
  const ref = ex && typeof ex === 'object' ? String((ex as ExampleSentence).ref ?? '').trim() : ''
  return finishRow({
    japanese: jp.japanese,
    kana,
    en: cleanMeaning(pick(r, ['en', 'english', 'meaning', 'back', 'definition'])),
    pl: cleanMeaning(pick(r, ['pl', 'polish', 'polski'])),
    type: mapType(pick(r, ['type', 'pos'])),
    // deck words aren't part of a lesson
    lesson: deck ? 0 : lesson > 0 ? lesson : opts.lesson,
    tags: [...new Set([...(opts.tags ?? []), ...tags])],
    example:
      ex && typeof ex === 'object'
        ? {
            ja: String((ex as ExampleSentence).ja ?? ''),
            en: String((ex as ExampleSentence).en ?? ''),
            pl: String((ex as ExampleSentence).pl ?? ''),
            ...(ref ? { ref } : {}),
          }
        : typeof ex === 'string' && ex
          ? { ja: fromAnkiFurigana(ex), en: '', pl: '' }
          : undefined,
    ...(deck ? { deck } : {}),
    ...(frequency > 0 ? { frequency } : {}),
    ...(Array.isArray(r.alt) && r.alt.length ? { alt: r.alt.map(String) } : {}),
    ...(typeof r.furigana === 'string' && r.furigana ? { furigana: r.furigana } : {}),
    ...(typeof r.tts === 'string' && r.tts ? { tts: r.tts } : {}),
  })
}

/* ---------- Matching against the existing library ---------- */

const STOP = new Set(['to', 'a', 'an', 'the', 'of', 'be', 'is', 'and', 'or', 'mr', 'ms', 'się', 'na', 'w', 'z', 'do'])
function tokens(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter((w) => w.length > 1 && !STOP.has(w)),
  )
}

export function meaningsOverlap(a: string, b: string): boolean {
  const ta = tokens(a)
  const tb = tokens(b)
  if (!ta.size || !tb.size) return true
  for (const w of ta) if (tb.has(w)) return true
  return false
}

export function findMatch<T extends Pick<Word, 'japanese' | 'kana' | 'en' | 'pl'>>(row: ImportRow, existing: T[]): T | undefined {
  const k = normalizeKana(row.kana)
  const same = existing.filter((w) => normalizeKana(w.kana) === k)
  if (!same.length) return undefined
  const exact = same.find((w) => w.japanese === row.japanese)
  if (exact) return exact
  return same.find(
    (w) =>
      (!hasKanji(w.japanese) || !hasKanji(row.japanese)) &&
      (meaningsOverlap(w.en, row.en) || meaningsOverlap(w.pl, row.pl) || (!row.en && !row.pl)),
  )
}

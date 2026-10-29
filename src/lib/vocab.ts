import { toRomaji } from 'wanakana'
import type { UserWordRow } from './db'
import type { LessonFile, Word } from './types'
import { normalizeKana } from './jp/chars'
import { stripMarkup } from './jp/markup'

const modules = import.meta.glob<LessonFile>('/data/vocab/lesson-*.json', { eager: true, import: 'default' })

export const LESSONS: LessonFile[] = Object.values(modules).sort((a, b) => a.lesson - b.lesson)

export const BUILTIN_WORDS: Word[] = LESSONS.flatMap((l) =>
  l.words.map((w) => ({ ...w, source: 'builtin' as const })),
)

export interface VocabEntry extends Word {
  romaji: string
  mnemonic?: string
  /** Lower-cased, diacritic-free haystack for search */
  haystack: string
}

export interface Vocab {
  words: VocabEntry[]
  byId: Map<string, VocabEntry>
  /** Lessons of the main track (deck words don't add lesson 0) */
  lessons: number[]
  /** Custom deck ids, sorted */
  decks: string[]
  tags: string[]
}

export function foldDiacritics(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ł/g, 'l')
    .replace(/Ł/g, 'L')
    .toLowerCase()
}

export function romajiOf(w: Pick<Word, 'kana' | 'romaji'>): string {
  return w.romaji ?? toRomaji(w.kana.replace(/[～〜]/g, '')).replace(/\s+/g, ' ')
}

function entry(w: Word, mnemonic?: string): VocabEntry {
  const romaji = romajiOf(w)
  const haystack = [
    w.japanese,
    w.kana,
    normalizeKana(w.kana),
    romaji.replace(/[^a-z]/g, ''),
    foldDiacritics(w.en),
    foldDiacritics(w.pl),
    w.example ? stripMarkup(w.example.ja) : '',
    w.tags.join(' '),
  ].join('\u0001')
  return { ...w, romaji, mnemonic, haystack }
}

/** Built-in words + your words/edits from IndexedDB (patches override fields of built-in words by id). */
export function buildVocab(rows: UserWordRow[]): Vocab {
  const patches = new Map<string, UserWordRow>()
  const custom: UserWordRow[] = []
  for (const r of rows) {
    if (r.kind === 'patch') patches.set(r.id, r)
    else custom.push(r)
  }

  // One of your own lesson words that is also built in replaces the built-in one (it carries your progress).
  const yours = new Set(
    custom.flatMap((r) => {
      const w = r.word as Partial<Word>
      return !r.deleted && !w.deck && w.japanese && w.kana ? [`${w.japanese}|${normalizeKana(w.kana)}`] : []
    }),
  )
  const words: VocabEntry[] = []
  for (const w of BUILTIN_WORDS) {
    const p = patches.get(w.id)
    if (p?.deleted) continue
    if (yours.has(`${w.japanese}|${normalizeKana(w.kana)}`)) continue
    words.push(entry(p ? { ...w, ...p.word, id: w.id, source: 'builtin' } : w, p?.mnemonic))
  }
  for (const r of custom) {
    if (r.deleted) continue
    const w = r.word as Partial<Word>
    if (!w.japanese || !w.kana) continue
    const full: Word = { tags: [], genkiLesson: 0, type: 'noun', en: '', pl: '', ...w, japanese: w.japanese, kana: w.kana, id: r.id, source: 'user' }
    words.push(entry(full, r.mnemonic))
  }
  const byId = new Map(words.map((w) => [w.id, w]))
  const lessons = [...new Set(words.filter((w) => !w.deck).map((w) => w.genkiLesson))].sort((a, b) => a - b)
  const decks = [...new Set(words.flatMap((w) => (w.deck ? [w.deck] : [])))].sort()
  const tags = [...new Set(words.flatMap((w) => w.tags))].sort()
  return { words, byId, lessons, decks, tags }
}

export function lessonTitle(n: number): LessonFile['title'] | undefined {
  return LESSONS.find((l) => l.lesson === n)?.title
}

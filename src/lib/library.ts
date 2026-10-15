import { toHiragana } from 'wanakana'
import { hasKanji, kataToHira, normalizeKana } from './jp/chars'
import type { WordProgress } from './progress'
import { WORD_TYPES, type WordType } from './types'
import { foldDiacritics, type VocabEntry } from './vocab'

export type SortKey = 'lesson' | 'kana' | 'type' | 'difficulty' | 'weakest'
export type GroupKey = 'none' | 'lesson' | 'type' | 'tag'
export type StatusFilter = 'all' | 'new' | 'learning' | 'known' | 'leech' | 'verify' | 'mine'

export interface LibraryFilter {
  q: string
  lessons: number[]
  types: WordType[]
  tags: string[]
  status: StatusFilter
}

export const EMPTY_FILTER: LibraryFilter = { q: '', lessons: [], types: [], tags: [], status: 'all' }

export function difficultyOf(w: VocabEntry): 1 | 2 | 3 {
  if (w.difficulty) return w.difficulty
  const kanji = [...w.japanese].filter((c) => hasKanji(c)).length
  const s = kanji + (w.kana.length > 5 ? 1 : 0) + (/verb|adj/.test(w.type) ? 0.5 : 0)
  return s < 1.5 ? 1 : s < 3 ? 2 : 3
}

/** 0 = no match; higher = better (exact > prefix > contains). */
export function searchScore(w: VocabEntry, query: string): number {
  const q = query.trim().toLowerCase()
  if (!q) return 1
  const variants = new Set<string>([foldDiacritics(q)])
  if (/^[a-z' -]+$/.test(q)) variants.add(normalizeKana(toHiragana(q.replace(/\s+/g, ''))))
  if (/[぀-ヿ]/.test(q)) variants.add(normalizeKana(q))
  let best = 0
  const fields = [w.japanese, normalizeKana(w.kana), w.romaji.replace(/[^a-z]/g, '')]
  for (const v of variants) {
    if (!v) continue
    for (const f of fields) {
      if (f === v) best = Math.max(best, 100)
      else if (f.startsWith(v)) best = Math.max(best, 60)
    }
    for (const m of [foldDiacritics(w.en), foldDiacritics(w.pl)]) {
      const parts = m.split(/;\s*/).map((p) => p.replace(/^to /, '').replace(/\s*\(.*?\)\s*/g, '').trim())
      if (parts.includes(v.replace(/^to /, ''))) best = Math.max(best, 90)
      else if (parts.some((p) => p.startsWith(v))) best = Math.max(best, 50)
    }
    if (w.haystack.includes(v)) best = Math.max(best, 20)
  }
  return best
}

export function filterWords(words: VocabEntry[], f: LibraryFilter, progress?: Map<string, WordProgress>): VocabEntry[] {
  return words.filter((w) => {
    if (f.lessons.length && !f.lessons.includes(w.genkiLesson)) return false
    if (f.types.length && !f.types.includes(w.type)) return false
    if (f.tags.length && !f.tags.some((t) => w.tags.includes(t))) return false
    if (f.status !== 'all') {
      const p = progress?.get(w.id)
      if (f.status === 'verify' && !w.verify) return false
      if (f.status === 'mine' && w.source !== 'user') return false
      if (f.status === 'leech' && !p?.leech) return false
      if (f.status === 'new' && p && p.status !== 'new') return false
      if (f.status === 'learning' && p?.status !== 'learning') return false
      if (f.status === 'known' && p?.status !== 'known') return false
    }
    return searchScore(w, f.q) > 0
  })
}

const collator = new Intl.Collator('ja')
const kanaKey = (w: VocabEntry) => kataToHira(w.kana.replace(/^[～〜]/, ''))

export function sortWords(words: VocabEntry[], key: SortKey, progress?: Map<string, WordProgress>, q = ''): VocabEntry[] {
  const arr = [...words]
  const byLesson = (a: VocabEntry, b: VocabEntry) => a.genkiLesson - b.genkiLesson
  const byKana = (a: VocabEntry, b: VocabEntry) => collator.compare(kanaKey(a), kanaKey(b))
  const typeIdx = (w: VocabEntry) => WORD_TYPES.indexOf(w.type)
  const cmp: Record<SortKey, (a: VocabEntry, b: VocabEntry) => number> = {
    lesson: (a, b) => byLesson(a, b),
    kana: byKana,
    type: (a, b) => typeIdx(a) - typeIdx(b) || byKana(a, b),
    difficulty: (a, b) => difficultyOf(a) - difficultyOf(b) || byLesson(a, b),
    weakest: (a, b) => (progress?.get(b.id)?.weakness ?? -1) - (progress?.get(a.id)?.weakness ?? -1) || byLesson(a, b),
  }
  // Stable sort keeps the data order (lesson order) inside equal keys.
  arr.sort(cmp[key])
  if (q.trim()) arr.sort((a, b) => searchScore(b, q) - searchScore(a, q))
  return arr
}

export interface Group {
  key: string
  words: VocabEntry[]
}

export function groupWords(words: VocabEntry[], key: GroupKey): Group[] {
  if (key === 'none') return [{ key: 'all', words }]
  const map = new Map<string, VocabEntry[]>()
  const add = (k: string, w: VocabEntry) => {
    const list = map.get(k) ?? []
    list.push(w)
    map.set(k, list)
  }
  for (const w of words) {
    if (key === 'lesson') add(String(w.genkiLesson), w)
    else if (key === 'type') add(w.type, w)
    else for (const t of w.tags.length ? w.tags : ['—']) add(t, w)
  }
  const keys = [...map.keys()]
  if (key === 'lesson') keys.sort((a, b) => Number(a) - Number(b))
  else if (key === 'type') keys.sort((a, b) => WORD_TYPES.indexOf(a as WordType) - WORD_TYPES.indexOf(b as WordType))
  else keys.sort()
  return keys.map((k) => ({ key: k, words: map.get(k)! }))
}

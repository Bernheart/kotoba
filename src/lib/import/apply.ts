import { hasKanji, normalizeKana } from '../jp/chars'
import { db, type UserWordRow } from '../db'
import type { Word } from '../types'
import type { VocabEntry } from '../vocab'
import { slugId } from '../words'
import { findMatch, type ImportRow } from './parse'

export interface PlanItem {
  row: ImportRow
  action: 'new' | 'merge' | 'skip'
  target?: VocabEntry
}

export function planImport(rows: ImportRow[], existing: VocabEntry[]): PlanItem[] {
  const seen = new Set<string>()
  return rows.map((row) => {
    if (row.problem) return { row, action: 'skip' }
    const key = `${row.japanese}|${normalizeKana(row.kana)}`
    if (seen.has(key)) return { row, action: 'skip' }
    seen.add(key)
    const target = findMatch(row, existing)
    return target ? { row, action: 'merge', target } : { row, action: 'new' }
  })
}

/** Writes the plan in one transaction. Returns counts. */
export async function applyImport(
  plan: PlanItem[],
  opts: { updateLessons: boolean; defaultLesson: number },
  now = Date.now(),
): Promise<{ added: number; merged: number }> {
  let added = 0
  let merged = 0
  await db.transaction('rw', db.userWords, async () => {
    const puts: UserWordRow[] = []
    for (const { row, action, target } of plan) {
      if (action === 'new') {
        const id = slugId(row.kana)
        const word: Word = {
          id,
          japanese: row.japanese,
          kana: row.kana,
          en: row.en,
          pl: row.pl,
          type: row.type,
          genkiLesson: row.deck ? 0 : (row.lesson ?? opts.defaultLesson),
          tags: row.tags,
          ...(row.example ? { example: row.example } : {}),
          ...(row.deck ? { deck: row.deck } : {}),
          ...(row.frequency ? { frequency: row.frequency } : {}),
          ...(row.typeGuessed ? { verify: 'Word type was guessed during import.' } : {}),
        }
        puts.push({ id, kind: 'custom', word, createdAt: now, updatedAt: now, dirty: 1 })
        added++
      } else if (action === 'merge' && target) {
        const prev = await db.userWords.get(target.id)
        // Re-importing a deck refreshes its words in place (same id, so progress is kept).
        if (row.deck && target.source === 'user' && target.deck === row.deck) {
          const base = (prev?.word ?? target) as Word
          const word: Word = {
            ...base,
            japanese: row.japanese,
            kana: row.kana,
            en: row.en || base.en,
            pl: row.pl || base.pl,
            ...(row.typeGuessed ? {} : { type: row.type, verify: undefined }),
            // the deck's own rank tags (`arcane-1` …) are replaced, your other tags stay
            tags: [...new Set([...base.tags.filter((t) => !t.startsWith(`${row.deck}-`)), ...row.tags])],
            ...(row.example ? { example: row.example } : {}),
            ...(row.frequency ? { frequency: row.frequency } : {}),
          }
          puts.push({ id: target.id, kind: 'custom', word, mnemonic: prev?.mnemonic, createdAt: prev?.createdAt ?? now, updatedAt: now, dirty: 1 })
          merged++
          continue
        }
        const tags = [...new Set([...target.tags, ...row.tags])]
        const lesson = opts.updateLessons && row.lesson ? row.lesson : target.genkiLesson
        if (target.source === 'user') {
          const base = (prev?.word ?? target) as Word
          const word: Word = {
            ...base,
            japanese: hasKanji(row.japanese) && !hasKanji(base.japanese) ? row.japanese : base.japanese,
            en: base.en || row.en,
            pl: base.pl || row.pl,
            tags,
            genkiLesson: lesson,
          }
          puts.push({ id: target.id, kind: 'custom', word, mnemonic: prev?.mnemonic, createdAt: prev?.createdAt ?? now, updatedAt: now, dirty: 1 })
        } else {
          const patch: Partial<Word> = { ...(prev?.word ?? {}) }
          if (lesson !== target.genkiLesson) patch.genkiLesson = lesson
          if (tags.length !== target.tags.length) patch.tags = tags
          if (!target.pl && row.pl) patch.pl = row.pl
          if (Object.keys(patch).length)
            puts.push({ id: target.id, kind: 'patch', word: patch, mnemonic: prev?.mnemonic, createdAt: prev?.createdAt ?? now, updatedAt: now, dirty: 1 })
        }
        merged++
      }
    }
    await db.userWords.bulkPut(puts)
  })
  return { added, merged }
}

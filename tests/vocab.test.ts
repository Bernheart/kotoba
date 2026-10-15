import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { lessonFileSchema } from '../src/lib/schema'
import { alignsCleanly } from '../src/lib/jp/furigana'
import { parseMarkup } from '../src/lib/jp/markup'
import { hasKanji, isKanaOnly, normalizeKana } from '../src/lib/jp/chars'

const dir = join(__dirname, '..', 'data', 'vocab')
const files = readdirSync(dir).filter((f) => /^lesson-\d\d\.json$/.test(f)).sort()
const lessons = files.map((f) => ({ file: f, data: JSON.parse(readFileSync(join(dir, f), 'utf8')) }))

describe('vocabulary data', () => {
  it('has lesson files', () => expect(files.length).toBeGreaterThan(0))

  const seen = new Map<string, string>()
  for (const { file, data } of lessons) {
    describe(file, () => {
      it('matches the schema', () => {
        const r = lessonFileSchema.safeParse(data)
        if (!r.success) throw new Error(JSON.stringify(r.error.issues.slice(0, 5), null, 2))
      })

      it('file name matches lesson number and words are tagged with it', () => {
        expect(Number(file.slice(7, 9))).toBe(data.lesson)
        for (const w of data.words) expect(w.genkiLesson, w.id).toBe(data.lesson)
      })

      it('has unique ids across all lessons', () => {
        for (const w of data.words) {
          expect(seen.has(w.id), `${w.id} duplicated (also in ${seen.get(w.id)})`).toBe(false)
          seen.set(w.id, file)
        }
      })

      it('kana fields contain only kana', () => {
        for (const w of data.words) {
          expect(isKanaOnly(w.kana), `${w.id}: kana "${w.kana}"`).toBe(true)
          for (const a of w.alt ?? []) if (!hasKanji(a)) expect(isKanaOnly(a), `${w.id}: alt "${a}"`).toBe(true)
        }
      })

      it('furigana aligns (or an override is given)', () => {
        for (const w of data.words) {
          if (w.furigana) {
            const s = parseMarkup(w.furigana)
            expect(s.plain, `${w.id}: furigana override plain text`).toBe(w.japanese)
            expect(normalizeKana(s.kana), `${w.id}: furigana override reading`).toBe(normalizeKana(w.kana))
          } else {
            expect(alignsCleanly(w.japanese, w.kana), `${w.id}: ${w.japanese} / ${w.kana} does not align`).toBe(true)
          }
        }
      })

      it('example sentences parse and mark the target word', () => {
        for (const w of data.words) {
          if (!w.example) continue
          const s = parseMarkup(w.example.ja)
          expect(s.hasTarget, `${w.id}: example has no *target*`).toBe(true)
          expect(s.plain.includes('{') || s.plain.includes('|') || s.plain.includes('*'), `${w.id}: broken markup`).toBe(false)
          for (const seg of s.segs) {
            if (seg.reading) expect(isKanaOnly(seg.reading), `${w.id}: reading "${seg.reading}"`).toBe(true)
            // every kanji in the sentence must carry furigana
            if (!seg.reading) expect(hasKanji(seg.text), `${w.id}: kanji without furigana in "${seg.text}"`).toBe(false)
          }
        }
      })
    })
  }
})

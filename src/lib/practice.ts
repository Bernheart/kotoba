import { conjugate, FORM_LESSON, formsFor, isAdj, isVerb, type Form } from './jp/conjugate'
import { parseMarkup } from './jp/markup'
import type { WordProgress } from './progress'
import { shuffle } from './srs/queue'
import type { Direction } from './types'
import type { VocabEntry } from './vocab'

export type QuestionKind = 'mcq' | 'typing' | 'listen-mcq' | 'listen-type' | 'cloze' | 'builder' | 'conj' | 'intro'

export interface Question {
  id: string
  kind: QuestionKind
  word: VocabEntry
  dir: Direction
  options?: VocabEntry[]
  form?: Form
  /** Reschedules the SRS card on the first attempt (5-minute session reviews) */
  srs?: boolean
  /** Ghost re-test of a missed item */
  ghost?: boolean
}

let seq = 0
const qid = () => `q${++seq}`

/** Same-type distractors, preferring nearby lessons and distinct meanings. */
export function distractors(word: VocabEntry, pool: VocabEntry[], n = 3): VocabEntry[] {
  const meaningKey = (w: VocabEntry) => w.en.split(';')[0]!.trim().toLowerCase()
  const used = new Set([meaningKey(word), word.japanese])
  const candidates = shuffle(pool.filter((w) => w.id !== word.id))
  const score = (w: VocabEntry) =>
    (w.type === word.type ? 0 : 10) + Math.min(5, Math.abs(w.genkiLesson - word.genkiLesson)) + (w.tags.some((t) => word.tags.includes(t)) ? -1 : 0)
  candidates.sort((a, b) => score(a) - score(b))
  const out: VocabEntry[] = []
  for (const c of candidates) {
    if (out.length >= n) break
    if (used.has(meaningKey(c)) || used.has(c.japanese)) continue
    used.add(meaningKey(c))
    used.add(c.japanese)
    out.push(c)
  }
  return out
}

export function hasCloze(w: VocabEntry): boolean {
  return !!w.example && parseMarkup(w.example.ja).hasTarget
}

export function canBuild(w: VocabEntry): boolean {
  if (!w.example) return false
  const n = parseMarkup(w.example.ja).chunks.length
  return n >= 3 && n <= 8
}

export function makeQuestions(kind: QuestionKind, pool: VocabEntry[], count: number, opts: { dir?: Direction | 'mixed'; distractorPool?: VocabEntry[]; forms?: Form[] } = {}): Question[] {
  const dPool = opts.distractorPool ?? pool
  let eligible = pool
  if (kind === 'cloze') eligible = pool.filter(hasCloze)
  if (kind === 'builder') eligible = pool.filter(canBuild)
  if (kind === 'conj') eligible = pool.filter((w) => isVerb(w.type) || isAdj(w.type))
  const picked = shuffle([...eligible]).slice(0, count)
  const dir = (): Direction => (opts.dir === 'mixed' ? (Math.random() < 0.5 ? 'recog' : 'recall') : (opts.dir ?? 'recog'))
  return picked.flatMap((word): Question[] => {
    const base = { id: qid(), word, dir: dir() }
    switch (kind) {
      case 'mcq':
      case 'listen-mcq':
        return [{ ...base, kind, options: shuffle([word, ...distractors(word, dPool)]) }]
      case 'conj': {
        const forms = formsFor(word.type).filter((f) => (opts.forms ?? []).includes(f) && conjugate(word, f))
        if (!forms.length) return []
        return [{ ...base, kind, form: forms[Math.floor(Math.random() * forms.length)]! }]
      }
      default:
        return [{ ...base, kind }]
    }
  })
}

export function unlockedForms(currentLesson: number): Form[] {
  return (Object.keys(FORM_LESSON) as Form[]).filter((f) => f !== 'adjPresent' && f !== 'plain' && FORM_LESSON[f] <= currentLesson)
}

/** Words you miss most (by weakness score), excluding ones never studied. */
export function weakWords(words: VocabEntry[], progress: Map<string, WordProgress> | undefined, n = 20): VocabEntry[] {
  if (!progress) return []
  return words
    .filter((w) => (progress.get(w.id)?.weakness ?? -1) >= 0)
    .sort((a, b) => progress.get(b.id)!.weakness - progress.get(a.id)!.weakness)
    .slice(0, n)
}

/** Ghost re-tests: a missed question comes back twice, a few items later (Bunpro-style). */
export function insertGhosts(queue: Question[], pos: number, q: Question): Question[] {
  const next = [...queue]
  const g = { ...q, id: qid(), ghost: true, srs: false }
  next.splice(Math.min(next.length, pos + 3), 0, g)
  next.splice(Math.min(next.length, pos + 8), 0, { ...g, id: qid() })
  return next
}

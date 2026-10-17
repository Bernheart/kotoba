import { useEffect, useMemo, useState } from 'react'
import { useLocation } from 'wouter'
import { FocusLayout } from '../../components/Page'
import { Button } from '../../components/ui'
import { db } from '../../lib/db'
import { isMainWord } from '../../lib/decks'
import { useT } from '../../lib/i18n'
import { canBuild, distractors, hasCloze, weakWords, type Question } from '../../lib/practice'
import { computeProgress } from '../../lib/progress'
import { getSettings } from '../../lib/settings'
import { buildQueue, shuffle } from '../../lib/srs/queue'
import { unlockSpeech } from '../../lib/tts'
import { studyDay } from '../../lib/time'
import { useVocab } from '../../lib/vocab-context'
import { QuizRunner } from './QuizRunner'

const LIMIT_MS = 5 * 60_000
let n = 0

/**
 * Duolingo-style 5-minute session: due reviews (these do reschedule), then weak words, then 3 new
 * words with an intro — in varied formats, with ghost re-tests of misses.
 */
export function SessionPage() {
  const t = useT()
  const [, navigate] = useLocation()
  const vocab = useVocab()
  const { byId } = vocab
  // The 5-minute session is the main track only; custom decks have their own queue.
  const words = useMemo(() => vocab.words.filter(isMainWord), [vocab.words])
  const [qs, setQs] = useState<Question[] | null>(null)
  const [ready, setReady] = useState(false)

  const build = async () => {
    const s = getSettings()
    const [cards, todayLogs, logs] = await Promise.all([
      db.cards.toArray(),
      db.reviewLogs.where('day').equals(studyDay()).toArray(),
      db.reviewLogs.toArray(),
    ])
    const queue = buildQueue({ words, cards, todayLogs: todayLogs.filter((l) => !l.deleted), settings: s }, { includeNew: true, maxNew: 3 })
    const out: Question[] = []
    const used = new Set<string>()
    for (const item of queue.filter((i) => !i.isNew).slice(0, 10)) {
      const w = byId.get(item.wordId)
      if (!w) continue
      used.add(w.id)
      out.push(
        item.dir === 'recall'
          ? { id: `s${++n}`, kind: 'typing', word: w, dir: 'recall', srs: true }
          : { id: `s${++n}`, kind: 'mcq', word: w, dir: 'recog', srs: true, options: shuffle([w, ...distractors(w, words)]) },
      )
    }
    const progress = computeProgress(cards, logs)
    for (const w of weakWords(words, progress, 6).filter((x) => !used.has(x.id)).slice(0, 4)) {
      used.add(w.id)
      const kinds: Question['kind'][] = ['listen-mcq']
      if (hasCloze(w)) kinds.push('cloze')
      if (canBuild(w)) kinds.push('builder')
      const kind = kinds[Math.floor(Math.random() * kinds.length)]!
      out.push({ id: `s${++n}`, kind, word: w, dir: 'recog', options: kind === 'listen-mcq' ? shuffle([w, ...distractors(w, words)]) : undefined })
    }
    const fresh: Question[] = []
    for (const item of queue.filter((i) => i.isNew)) {
      const w = byId.get(item.wordId)
      if (!w || used.has(w.id)) continue
      fresh.push({ id: `s${++n}`, kind: 'intro', word: w, dir: 'recog' })
      fresh.push({ id: `s${++n}`, kind: 'mcq', word: w, dir: 'recog', srs: true, options: shuffle([w, ...distractors(w, words)]) })
    }
    // Interleave: reviews and weak words shuffled, new words appended in intro→quiz pairs
    setQs([...shuffle(out), ...fresh])
  }

  useEffect(() => {
    if (words.length) setReady(true)
  }, [words.length])

  if (qs)
    return qs.length ? (
      <QuizRunner initial={qs} title={t.today.fiveMin} onExit={() => navigate('/')} timeLimitMs={LIMIT_MS} sessionMode="session" />
    ) : (
      <FocusLayout title={t.today.fiveMin} onExit={() => navigate('/')}>
        <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
          <p className="text-muted">{t.today.allCaughtUp}</p>
          <Button onClick={() => navigate('/study')}>{t.study.practice}</Button>
        </div>
      </FocusLayout>
    )

  return (
    <FocusLayout title={t.today.fiveMin} onExit={() => navigate('/')}>
      <div className="flex flex-1 flex-col items-center justify-center text-center">
        <p lang="ja" className="jp-serif text-[64px] leading-none text-accent">
          五分
        </p>
        <h1 className="mt-4 text-[26px] font-bold">{t.today.fiveMin}</h1>
        <p className="mt-2 max-w-xs text-[15px] text-muted">{t.today.fiveMinHint}</p>
        <Button
          variant="primary"
          size="lg"
          className="mt-10 w-full max-w-xs"
          disabled={!ready}
          onClick={() => {
            unlockSpeech()
            void build()
          }}
        >
          {t.common.start}
        </Button>
      </div>
    </FocusLayout>
  )
}

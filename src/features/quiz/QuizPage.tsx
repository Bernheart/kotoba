import { useState } from 'react'
import { useLocation, useParams } from 'wouter'
import { Segmented } from '../../components/ui'
import { inScope } from '../../lib/decks'
import { useT } from '../../lib/i18n'
import { makeQuestions, weakWords, type Question, type QuestionKind } from '../../lib/practice'
import { useProgress } from '../../lib/progress'
import { shuffle } from '../../lib/srs/queue'
import type { Direction } from '../../lib/types'
import { useVocab } from '../../lib/vocab-context'
import { PracticeSetup, type SetupValue } from './PracticeSetup'
import { QuizRunner } from './QuizRunner'

type Mode = 'mcq' | 'typing' | 'listening' | 'cloze' | 'builder' | 'weak'

/** /quiz/:mode — multiple choice, typing, listening, cloze, sentence builder and the weak-words deck. */
export function QuizPage() {
  const { mode } = useParams<{ mode: Mode }>()
  const t = useT()
  const [, navigate] = useLocation()
  const { words } = useVocab()
  const progress = useProgress()
  const [questions, setQuestions] = useState<Question[] | null>(null)
  const [dir, setDir] = useState<Direction | 'mixed'>('mixed')
  const [listenKind, setListenKind] = useState<'listen-mcq' | 'listen-type'>('listen-mcq')
  const [last, setLast] = useState<SetupValue | null>(null)

  const meta: Record<Mode, { title: string; desc: string }> = {
    mcq: { title: t.study.mcq, desc: t.study.mcqDesc },
    typing: { title: t.study.typing, desc: t.study.typingDesc },
    listening: { title: t.study.listening, desc: t.study.listeningDesc },
    cloze: { title: t.study.cloze, desc: t.study.clozeDesc },
    builder: { title: t.study.builder, desc: t.study.builderDesc },
    weak: { title: t.study.weak, desc: t.study.weakDesc },
  }
  const m = meta[mode] ?? meta.mcq

  const start = (v: SetupValue) => {
    setLast(v)
    const pool = words.filter((w) => inScope(w, v.lessons, v.decks))
    let qs: Question[]
    if (mode === 'weak') {
      const weak = weakWords(words, progress, v.count)
      const half = Math.ceil(weak.length / 2)
      qs = shuffle([
        ...makeQuestions('typing', weak.slice(0, half), half, { dir: 'mixed' }),
        ...makeQuestions('mcq', weak.slice(half), weak.length - half, { dir: 'recall', distractorPool: words }),
      ])
    } else {
      const kind: QuestionKind = mode === 'listening' ? listenKind : (mode as QuestionKind)
      // deck words only appear as distractors when their deck is in scope
      const distractorPool = words.filter((w) => !w.deck || v.decks.includes(w.deck))
      qs = makeQuestions(kind, pool, v.count, { dir: mode === 'listening' ? 'recog' : dir, distractorPool })
    }
    setQuestions(qs)
  }

  if (questions)
    return (
      <QuizRunner
        key={questions[0]?.id ?? 'empty'}
        initial={questions}
        title={m.title}
        onExit={() => navigate('/study')}
        onRestart={() => last && start(last)}
      />
    )

  return (
    <PracticeSetup
      title={m.title}
      description={m.desc}
      onStart={start}
      hint={mode === 'weak' && progress && weakWords(words, progress).length === 0 ? t.stats.noData : undefined}
    >
      {(mode === 'mcq' || mode === 'typing') && (
        <section className="mt-5">
          <h2 className="mb-2 text-[13px] font-semibold text-muted">{t.study.direction}</h2>
          <Segmented
            value={dir}
            onChange={setDir}
            options={[
              { value: 'recog', label: 'JP → ?' },
              { value: 'recall', label: '? → JP' },
              { value: 'mixed', label: t.study.dirMixed },
            ]}
          />
        </section>
      )}
      {mode === 'listening' && (
        <section className="mt-5">
          <Segmented
            value={listenKind}
            onChange={setListenKind}
            options={[
              { value: 'listen-mcq', label: t.study.mcq },
              { value: 'listen-type', label: t.study.typing },
            ]}
          />
        </section>
      )}
    </PracticeSetup>
  )
}

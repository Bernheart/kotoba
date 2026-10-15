import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Rating } from 'ts-fsrs'
import { Ruby, SentenceJP, WordJP, fitSize } from '../../components/Furigana'
import { IconSpeaker } from '../../components/icons'
import { KanaInput } from '../../components/KanaInput'
import { FocusLayout } from '../../components/Page'
import { SpeakButton, useSpeak, wordSpeech } from '../../components/SpeakButton'
import { Button, ProgressBar } from '../../components/ui'
import { useKeyboardInset } from '../../components/useKeyboardInset'
import { checkJapanese, checkKanaString, checkMeaning, type Verdict } from '../../lib/answer'
import type { StudyMode } from '../../lib/db'
import { exampleTranslation, meaning, useLang, useT } from '../../lib/i18n'
import { conjugate, ruleFor } from '../../lib/jp/conjugate'
import { alignFurigana } from '../../lib/jp/furigana'
import { parseMarkup, stripMarkup } from '../../lib/jp/markup'
import { insertGhosts, type Question } from '../../lib/practice'
import { getSettings } from '../../lib/settings'
import { answerCard, logPractice } from '../../lib/srs/queue'
import type { VocabEntry } from '../../lib/vocab'
import { formLabel } from '../word/ConjugationTable'
import { BuilderQuestion } from './Builder'
import { SessionDone } from '../review/SessionDone'
import { IntroCard } from '../review/ReviewPage'

const MODE_OF: Record<Question['kind'], StudyMode> = {
  mcq: 'mcq',
  typing: 'typing',
  'listen-mcq': 'listening',
  'listen-type': 'listening',
  cloze: 'cloze',
  builder: 'builder',
  conj: 'conjugation',
  intro: 'intro',
}

interface Feedback {
  correct: boolean
  verdict: Verdict
  typed: string
}

export function QuizRunner({
  initial,
  title,
  onExit,
  onRestart,
  timeLimitMs,
  sessionMode,
}: {
  initial: Question[]
  title: string
  onExit: () => void
  onRestart?: () => void
  timeLimitMs?: number
  sessionMode?: StudyMode
}) {
  const t = useT()
  const [queue, setQueue] = useState(initial)
  const [pos, setPos] = useState(0)
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const [score, setScore] = useState({ n: 0, ok: 0 })
  const [missed, setMissed] = useState<VocabEntry[]>([])
  const [started] = useState(Date.now())
  const [now, setNow] = useState(Date.now())
  const [finished, setFinished] = useState(false)
  const shownAt = useRef(Date.now())
  useKeyboardInset()

  const q = queue[pos]
  const timeUp = timeLimitMs !== undefined && now - started >= timeLimitMs

  useEffect(() => {
    if (!timeLimitMs) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [timeLimitMs])

  useEffect(() => {
    shownAt.current = Date.now()
  }, [pos])

  const answer = (correct: boolean, verdict: Verdict, typed: string) => {
    if (!q || feedback) return
    const ms = Date.now() - shownAt.current
    if (q.srs && !q.ghost) {
      void answerCard(q.word.id, q.dir, correct ? (verdict === 'almost' ? Rating.Hard : Rating.Good) : Rating.Again, {
        ms,
        mode: sessionMode ?? 'session',
        correct,
        settings: getSettings(),
      })
    } else {
      void logPractice(q.word.id, sessionMode ?? MODE_OF[q.kind], correct, ms, q.dir)
    }
    if (!q.ghost) {
      setScore((s) => ({ n: s.n + 1, ok: s.ok + (correct ? 1 : 0) }))
      if (!correct) {
        setMissed((m) => (m.some((w) => w.id === q.word.id) ? m : [...m, q.word]))
        setQueue((qs) => insertGhosts(qs, pos, q))
      }
    }
    setFeedback({ correct, verdict, typed })
  }

  const next = () => {
    setFeedback(null)
    if (timeUp || pos + 1 >= queue.length) setFinished(true)
    else setPos((p) => p + 1)
  }

  // Correct multiple-choice answers move on by themselves.
  useEffect(() => {
    if (feedback?.correct && (q?.kind === 'mcq' || q?.kind === 'listen-mcq')) {
      const id = setTimeout(next, 750)
      return () => clearTimeout(id)
    }
  })

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (feedback && (e.key === 'Enter' || e.key === ' ') && (e.target as HTMLElement).tagName !== 'BUTTON') {
        e.preventDefault()
        next()
      }
      if (e.key === 'Escape') onExit()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (finished || !q) {
    const pct = score.n ? Math.round((score.ok / score.n) * 100) : 0
    return (
      <FocusLayout title={title} onExit={onExit}>
        <SessionDone
          stats={[
            { label: t.study.mistakes, value: score.n - score.ok },
            { label: '%', value: `${pct}%` },
            { label: t.study.time, value: t.common.minutes(Math.max(1, Math.round((Date.now() - started) / 60000))) },
          ]}
        >
          {missed.length > 0 && (
            <div className="mb-2 rounded-3xl bg-surface p-3 text-left">
              <p className="mb-1 px-1 text-[12px] text-faint">{t.study.mistakes}</p>
              {missed.slice(0, 8).map((w) => (
                <MissedRow key={w.id} w={w} />
              ))}
            </div>
          )}
          {onRestart && (
            <Button variant="primary" size="lg" onClick={onRestart}>
              {t.study.again}
            </Button>
          )}
          <Button onClick={onExit}>{t.common.done}</Button>
        </SessionDone>
      </FocusLayout>
    )
  }

  const remaining = timeLimitMs ? Math.max(0, Math.ceil((timeLimitMs - (now - started)) / 1000)) : null
  return (
    <FocusLayout
      onExit={onExit}
      progress={
        <div className="flex items-center gap-3">
          <ProgressBar value={pos / queue.length} className="flex-1" color={q.ghost ? 'var(--k-warn)' : undefined} />
          <span className="text-[13px] text-faint tabular-nums">
            {remaining !== null ? `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}` : `${score.ok}/${score.n}`}
          </span>
        </div>
      }
    >
      <AnimatePresence mode="wait">
        <motion.div
          key={q.id}
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -24 }}
          transition={{ duration: 0.18 }}
          className="flex min-h-0 flex-1 flex-col pt-3"
        >
          {q.ghost && <p className="mb-2 text-[12px] font-semibold text-warn">↻ {t.study.again}</p>}
          {q.kind === 'intro' ? <IntroCard word={q.word} onDone={next} /> : <QuestionView q={q} feedback={feedback} onAnswer={answer} />}
          {feedback && <FeedbackPanel q={q} feedback={feedback} onNext={next} />}
        </motion.div>
      </AnimatePresence>
    </FocusLayout>
  )
}

function MissedRow({ w }: { w: VocabEntry }) {
  const lang = useLang()
  return (
    <div className="flex items-center justify-between gap-3 px-1 py-1">
      <WordJP word={w} className="text-[17px] leading-[1.8]" />
      <span className="truncate text-[13px] text-muted">{meaning(w, lang)}</span>
    </div>
  )
}

/* ---------------- Question views ---------------- */

function QuestionView({ q, feedback, onAnswer }: { q: Question; feedback: Feedback | null; onAnswer: (c: boolean, v: Verdict, typed: string) => void }) {
  switch (q.kind) {
    case 'mcq':
    case 'listen-mcq':
      return <McqView q={q} feedback={feedback} onAnswer={onAnswer} />
    case 'builder':
      return <BuilderQuestion word={q.word} disabled={!!feedback} onAnswer={(c, typed) => onAnswer(c, c ? 'correct' : 'wrong', typed)} />
    default:
      return <TypeView q={q} feedback={feedback} onAnswer={onAnswer} />
  }
}

function ListenPrompt({ text }: { text: string }) {
  const say = useSpeak()
  const t = useT()
  useEffect(() => {
    const id = setTimeout(() => void say(text), 250)
    return () => clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text])
  return (
    <div className="flex flex-col items-center gap-3 py-6">
      <button
        onClick={() => void say(text)}
        className="grid h-28 w-28 place-items-center rounded-full bg-accent/15 text-accent ring-1 ring-accent/30 transition active:scale-95"
        aria-label={t.common.play}
      >
        <IconSpeaker size={44} />
      </button>
      <button onClick={() => void say(text, 0.6)} className="text-[13px] text-muted underline-offset-4 hover:underline">
        🐢 {t.shadow.slow}
      </button>
    </div>
  )
}

function Prompt({ q }: { q: Question }) {
  const lang = useLang()
  const t = useT()
  if (q.kind === 'listen-mcq' || q.kind === 'listen-type') return <ListenPrompt text={wordSpeech(q.word)} />
  if (q.kind === 'cloze') {
    const ex = q.word.example!
    return (
      <div className="py-2">
        <SentenceJP
          markup={ex.ja}
          blank={<span className="mx-1 inline-block min-w-[3.5em] border-b-2 border-accent align-baseline">&nbsp;</span>}
          className="text-[24px] leading-[2.1]"
        />
        <p className="mt-2 text-[15px] text-muted">{exampleTranslation(ex, lang)}</p>
        <p className="mt-3 text-[13px] text-faint">
          <span lang="ja">{q.word.japanese}</span> — {meaning(q.word, lang)}
        </p>
      </div>
    )
  }
  if (q.kind === 'conj') {
    return (
      <div className="py-4 text-center">
        <div style={{ fontSize: fitSize(q.word.japanese, 64, 300) }}>
          <WordJP word={q.word} className="jp-serif ruby-display" />
        </div>
        <p className="mt-1 text-[14px] text-muted">
          {meaning(q.word, lang)} · {t.types[q.word.type]}
        </p>
        <p className="mt-4 inline-block rounded-full bg-accent/15 px-4 py-1.5 text-[16px] font-semibold text-accent">→ {formLabel(t, q.form!)}</p>
      </div>
    )
  }
  if (q.dir === 'recog')
    return (
      <div className="flex flex-col items-center gap-3 py-6 text-center">
        <div style={{ fontSize: fitSize(q.word.japanese, 72, 300) }}>
          <WordJP word={q.word} className="jp-serif ruby-display" />
        </div>
        <SpeakButton text={wordSpeech(q.word)} size="sm" />
      </div>
    )
  return (
    <div className="py-6 text-center">
      <p className="text-[28px] leading-tight font-semibold">{meaning(q.word, lang)}</p>
      <p className="mt-2 text-[13px] text-faint">{t.types[q.word.type]}</p>
    </div>
  )
}

function McqView({ q, feedback, onAnswer }: { q: Question; feedback: Feedback | null; onAnswer: (c: boolean, v: Verdict, typed: string) => void }) {
  const lang = useLang()
  const [chosen, setChosen] = useState<string | null>(null)
  const showJapanese = q.dir === 'recall'
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const i = Number(e.key) - 1
      if (!feedback && i >= 0 && i < (q.options?.length ?? 0)) pick(q.options![i]!)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })
  const pick = (w: VocabEntry) => {
    if (feedback) return
    setChosen(w.id)
    const ok = w.id === q.word.id
    onAnswer(ok, ok ? 'correct' : 'wrong', showJapanese ? w.japanese : meaning(w, lang))
  }
  return (
    <div className="flex flex-1 flex-col">
      <Prompt q={q} />
      <div className="mt-auto grid gap-2.5 pb-2">
        {q.options!.map((w, i) => {
          const isRight = feedback && w.id === q.word.id
          const isWrong = feedback && chosen === w.id && w.id !== q.word.id
          return (
            <motion.button
              key={w.id}
              data-option
              onClick={() => pick(w)}
              animate={isWrong ? { x: [0, -8, 8, -5, 5, 0] } : {}}
              transition={{ duration: 0.35 }}
              className={`flex min-h-14 items-center gap-3 rounded-2xl border px-4 py-2.5 text-left transition active:scale-[0.99] ${
                isRight ? 'border-good bg-good/15' : isWrong ? 'border-accent bg-accent/10' : 'border-line bg-surface'
              }`}
            >
              <span className="hidden w-5 text-[12px] text-faint lg:inline">{i + 1}</span>
              {showJapanese ? <WordJP word={w} className="text-[22px] leading-[1.8]" /> : <span className="text-[17px]">{meaning(w, lang)}</span>}
            </motion.button>
          )
        })}
      </div>
    </div>
  )
}

/** Expected answer for typed questions. */
function expected(q: Question): { check: (input: string) => Verdict; japaneseInput: boolean } {
  if (q.kind === 'cloze') {
    const s = parseMarkup(q.word.example!.ja)
    const tSegs = s.segs.filter((x) => x.target)
    const text = tSegs.map((x) => x.text).join('')
    const kana = tSegs.map((x) => x.reading ?? x.text).join('')
    return { check: (i) => (i.trim() === text ? 'correct' : checkKanaString(i, kana)), japaneseInput: true }
  }
  if (q.kind === 'conj') {
    const c = conjugate(q.word, q.form!)!
    return { check: (i) => (i.trim() === c.japanese ? 'correct' : checkKanaString(i, c.kana)), japaneseInput: true }
  }
  if (q.kind === 'listen-type') return { check: (i) => checkJapanese(i, q.word), japaneseInput: true }
  if (q.dir === 'recall') return { check: (i) => checkJapanese(i, q.word), japaneseInput: true }
  return { check: (i) => checkMeaning(i, q.word), japaneseInput: false }
}

function TypeView({ q, feedback, onAnswer }: { q: Question; feedback: Feedback | null; onAnswer: (c: boolean, v: Verdict, typed: string) => void }) {
  const t = useT()
  const [value, setValue] = useState('')
  const ref = useRef<HTMLInputElement>(null)
  const exp = useMemo(() => expected(q), [q])
  useEffect(() => {
    setTimeout(() => ref.current?.focus(), 200)
  }, [q.id])
  const submit = () => {
    if (feedback || !value.trim()) return
    const v = exp.check(value)
    onAnswer(v !== 'wrong', v, value)
  }
  const cls = 'h-14 min-w-0 flex-1 rounded-2xl border border-line bg-surface px-4 text-[19px] focus:border-accent/60 focus:outline-none disabled:opacity-60'
  return (
    <div className="flex flex-1 flex-col">
      <Prompt q={q} />
      <form
        className="mt-auto flex gap-2 pb-[max(8px,calc(var(--kb-inset)-var(--safe-bottom)))]"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        {exp.japaneseInput ? (
          <KanaInput ref={ref} value={value} onValueChange={setValue} disabled={!!feedback} placeholder={t.review.typeJapanese} enterKeyHint="done" className={cls} />
        ) : (
          <input
            ref={ref}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            disabled={!!feedback}
            placeholder={t.review.typeMeaning}
            autoCapitalize="off"
            autoCorrect="off"
            autoComplete="off"
            spellCheck={false}
            enterKeyHint="done"
            className={cls}
          />
        )}
        {!feedback && (
          <Button variant="primary" size="lg" type="submit" className="px-5">
            {t.common.check}
          </Button>
        )}
      </form>
    </div>
  )
}

function FeedbackPanel({ q, feedback, onNext }: { q: Question; feedback: Feedback; onNext: () => void }) {
  const t = useT()
  const lang = useLang()
  const ref = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!feedback.correct) setTimeout(() => ref.current?.focus(), 50)
  }, [feedback.correct])
  let answer: ReactNode = <WordJP word={q.word} className="text-[24px] leading-[1.8]" />
  let rule = ''
  if (q.kind === 'conj') {
    const c = conjugate(q.word, q.form!)!
    answer = <Ruby segs={alignFurigana(c.japanese, c.kana)} className="text-[24px] leading-[1.8]" />
    rule = ruleFor(q.word, q.form!, lang)
  } else if (q.kind === 'cloze' || q.kind === 'builder') {
    answer = <SentenceJP markup={q.word.example!.ja} highlight className="text-[19px] leading-[2]" />
  }
  const tone = feedback.correct ? (feedback.verdict === 'almost' ? 'warn' : 'good') : 'accent'
  return (
    <motion.div
      initial={{ y: 30, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      className={`mt-3 rounded-3xl border p-4 pb-[max(16px,calc(var(--kb-inset)-var(--safe-bottom)))] ${
        tone === 'good' ? 'border-good/40 bg-good/10' : tone === 'warn' ? 'border-warn/40 bg-warn/10' : 'border-accent/40 bg-accent/10'
      }`}
      role="status"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={`text-[15px] font-semibold ${tone === 'good' ? 'text-good' : tone === 'warn' ? 'text-warn' : 'text-accent'}`}>
            {feedback.correct ? (feedback.verdict === 'almost' ? t.common.almost : t.common.correct) : t.common.incorrect}
          </p>
          <div className="mt-1">{answer}</div>
          <p className="text-[14px] text-muted">{meaning(q.word, lang)}</p>
          {rule && !feedback.correct && (
            <p className="mt-2 text-[14px]">
              <b>{t.conj.rule}:</b> <span lang="ja">{rule}</span>
            </p>
          )}
        </div>
        <SpeakButton text={q.kind === 'cloze' || q.kind === 'builder' ? stripMarkup(q.word.example!.ja) : wordSpeech(q.word)} size="sm" />
      </div>
      {!(feedback.correct && (q.kind === 'mcq' || q.kind === 'listen-mcq')) && (
        <Button ref={ref} variant="primary" size="lg" className="mt-3 w-full" onClick={onNext}>
          {t.common.continue}
        </Button>
      )}
    </motion.div>
  )
}

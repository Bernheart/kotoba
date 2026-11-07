import { motion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'wouter'
import { fitSize } from '../../components/Furigana'
import { KanaInput } from '../../components/KanaInput'
import { FocusLayout } from '../../components/Page'
import { Button, Chip, ProgressBar, Segmented, Toggle } from '../../components/ui'
import { useLang, useT } from '../../lib/i18n'
import {
  checkQuizReading,
  defaultKanjiLessons,
  KANJI,
  KANJI_LESSONS,
  KANJI_QTYPES,
  kanjiKey,
  kanjiMeaning,
  makeKanjiQuiz,
  recordKanji,
  variants,
  wordKey,
  wordMeaning,
  type KanjiQType,
  type KanjiQuestion,
} from '../../lib/kanji'
import { useSettings } from '../../lib/settings'
import { SessionDone } from '../review/SessionDone'
import { useKanjiStats } from './KanjiPage'

interface Setup {
  lessons: number[]
  count: number
  types: KanjiQType[]
  weakFirst: boolean
}
const KEY = 'kotoba.kanjiQuiz'

function loadSetup(currentLesson: number): Setup {
  const fallback: Setup = { lessons: defaultKanjiLessons(currentLesson), count: 10, types: [...KANJI_QTYPES], weakFirst: false }
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<Setup> | null
    if (v?.lessons?.length && v.types?.length) return { ...fallback, ...v, lessons: v.lessons.filter((l) => KANJI_LESSONS.includes(l)) }
  } catch {
    /* ignore */
  }
  return fallback
}

export function KanjiQuizPage() {
  const t = useT()
  const lang = useLang()
  const s = useSettings()
  const [, navigate] = useLocation()
  const stats = useKanjiStats()
  const [v, setV] = useState<Setup>(() => loadSetup(s.currentLesson))
  const [qs, setQs] = useState<KanjiQuestion[] | null>(null)
  const [empty, setEmpty] = useState(false)
  const typeLabel: Record<KanjiQType, string> = {
    'word-reading': t.kanji.typeWordReading,
    'word-meaning': t.kanji.typeWordMeaning,
    'kanji-meaning': t.kanji.typeKanjiMeaning,
    'kanji-reading': t.kanji.typeKanjiReading,
  }
  const toggle = <K extends 'lessons' | 'types'>(key: K, x: Setup[K][number]) =>
    setV((p) => {
      const list = p[key] as (typeof x)[]
      return { ...p, [key]: list.includes(x) ? list.filter((y) => y !== x) : [...list, x] }
    })

  const start = () => {
    try {
      localStorage.setItem(KEY, JSON.stringify(v))
    } catch {
      /* ignore */
    }
    const pool = KANJI.filter((k) => v.lessons.includes(k.lesson))
    const quiz = makeKanjiQuiz(pool, v.types, v.count, lang, { stats: v.weakFirst ? (stats ?? new Map()) : undefined })
    if (quiz.length) setQs(quiz)
    else setEmpty(true)
  }

  if (qs) return <KanjiRunner key={qs[0]?.id} initial={qs} onExit={() => setQs(null)} onDone={() => navigate('/kanji?')} />

  return (
    <FocusLayout title={t.kanji.quiz} onExit={() => navigate('/kanji?')}>
      <div className="flex flex-1 flex-col pt-2">
        <h1 className="text-[28px] font-bold tracking-tight">{t.kanji.quiz}</h1>
        <p className="mt-1 text-[15px] text-muted">{t.kanji.quizDesc}</p>
        <section className="mt-6">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-[13px] font-semibold text-muted">{t.kanji.lessons}</h2>
            <button
              className="text-[13px] text-accent"
              onClick={() => setV((p) => ({ ...p, lessons: p.lessons.length === KANJI_LESSONS.length ? [] : [...KANJI_LESSONS] }))}
            >
              {t.common.all}
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {KANJI_LESSONS.map((n) => (
              <Chip key={n} active={v.lessons.includes(n)} onClick={() => toggle('lessons', n)}>
                {t.common.lessonShort(n)}
              </Chip>
            ))}
          </div>
        </section>
        <section className="mt-5">
          <h2 className="mb-2 text-[13px] font-semibold text-muted">{t.kanji.types}</h2>
          <div className="flex flex-wrap gap-2">
            {KANJI_QTYPES.map((q) => (
              <Chip key={q} active={v.types.includes(q)} onClick={() => toggle('types', q)}>
                {typeLabel[q]}
              </Chip>
            ))}
          </div>
        </section>
        <section className="mt-5">
          <h2 className="mb-2 text-[13px] font-semibold text-muted">{t.study.count}</h2>
          <Segmented value={v.count} onChange={(count) => setV((p) => ({ ...p, count }))} options={[10, 20, 30].map((c) => ({ value: c, label: String(c) }))} />
        </section>
        <section className="mt-5 flex items-center justify-between gap-4 rounded-2xl bg-surface px-4 py-3">
          <div>
            <div className="text-[15px]">{t.kanji.weakFirst}</div>
            <div className="text-[12px] text-faint">{t.kanji.weakFirstHint}</div>
          </div>
          <Toggle checked={v.weakFirst} onChange={(weakFirst) => setV((p) => ({ ...p, weakFirst }))} label={t.kanji.weakFirst} />
        </section>
        {empty && <p className="mt-4 text-[14px] text-accent">{t.kanji.empty}</p>}
        <div className="mt-auto pt-8">
          <Button variant="primary" size="lg" className="w-full" disabled={!v.lessons.length || !v.types.length || (v.weakFirst && !stats)} onClick={start}>
            {t.study.begin}
          </Button>
        </div>
      </div>
    </FocusLayout>
  )
}

function KanjiRunner({ initial, onExit, onDone }: { initial: KanjiQuestion[]; onExit: () => void; onDone: () => void }) {
  const t = useT()
  const lang = useLang()
  const [pos, setPos] = useState(0)
  const [value, setValue] = useState('')
  const [picked, setPicked] = useState<string | null>(null)
  const [result, setResult] = useState<null | boolean>(null)
  const [missed, setMissed] = useState<KanjiQuestion[]>([])
  const inputRef = useRef<HTMLInputElement>(null)
  const q = initial[pos]

  useEffect(() => {
    setValue('')
    setPicked(null)
    setResult(null)
    if (q?.type === 'word-reading') setTimeout(() => inputRef.current?.focus(), 150)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pos])

  const answer = (ok: boolean) => {
    if (!q || result !== null) return
    setResult(ok)
    if (!ok) setMissed((m) => [...m, q])
    void recordKanji(kanjiKey(q.kanji.kanji), ok)
    if (q.word) void recordKanji(wordKey(q.kanji.kanji, q.word), ok)
  }
  const next = () => setPos((p) => p + 1)

  if (!q) {
    const n = initial.length
    return (
      <FocusLayout title={t.kanji.quiz} onExit={onExit}>
        <SessionDone
          stats={[
            { label: t.study.mistakes, value: missed.length },
            { label: '%', value: `${n ? Math.round(((n - missed.length) / n) * 100) : 0}%` },
            { label: t.study.count, value: n },
          ]}
        >
          {missed.length > 0 && (
            <div className="mb-3 text-left">
              <h3 className="mb-2 text-[13px] font-semibold text-muted">{t.kanji.missed}</h3>
              <div className="flex flex-wrap gap-2">
                {[...new Map(missed.map((m) => [m.kanji.kanji, m.kanji])).values()].map((k) => (
                  <span key={k.kanji} className="rounded-xl bg-surface px-3 py-1.5 text-[14px]">
                    <span lang="ja" className="jp-serif mr-1.5 text-[18px]">
                      {k.kanji}
                    </span>
                    {kanjiMeaning(k, lang)}
                  </span>
                ))}
              </div>
            </div>
          )}
          <Button variant="primary" size="lg" onClick={onExit}>
            {t.study.again}
          </Button>
          <Button onClick={onDone}>{t.common.done}</Button>
        </SessionDone>
      </FocusLayout>
    )
  }

  const prompt = q.word ? variants(q.word.w)[0]! : q.kanji.kanji
  const label = q.type === 'word-reading' ? t.kanji.promptReading : q.type === 'kanji-reading' ? t.kanji.promptKanjiReading : t.kanji.promptMeaning

  return (
    <FocusLayout onExit={onExit} progress={<ProgressBar value={pos / initial.length} />}>
      <div className="flex flex-1 flex-col items-center pt-4">
        <p className="text-[13px] font-semibold tracking-wide text-muted">{label}</p>
        <motion.div
          key={q.id}
          initial={{ scale: 0.92, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          lang="ja"
          data-testid="kanji-prompt"
          className="jp-serif mt-6 leading-none"
          style={{ fontSize: q.word ? fitSize(prompt, 88) : 120 }}
        >
          {prompt}
        </motion.div>
        {result !== null && (
          <div className="mt-6 text-center" data-testid="kanji-feedback">
            <p className={`text-[18px] font-semibold ${result ? 'text-good' : 'text-accent'}`}>{result ? `✓ ${t.common.correct}` : `✗ ${t.common.incorrect}`}</p>
            {q.word ? (
              <p className="mt-2 text-[17px]">
                <span lang="ja" className="jp-serif">
                  {variants(q.word.w).join('・')}
                </span>
                <span lang="ja" className="ml-2 text-muted">
                  {variants(q.word.r).join('・')}
                </span>
                <span className="mt-1 block text-[15px] text-muted">{wordMeaning(q.word, lang)}</span>
              </p>
            ) : (
              <p className="mt-2 text-[16px]">
                <span lang="ja">{[...q.kanji.on, ...q.kanji.kun].join('・')}</span>
                <span className="mt-1 block text-[15px] text-muted">{kanjiMeaning(q.kanji, lang)}</span>
              </p>
            )}
          </div>
        )}
        <div className="mt-auto w-full pt-6 pb-[max(8px,calc(var(--kb-inset)-var(--safe-bottom)))]">
          {q.type === 'word-reading' ? (
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                if (result !== null) next()
                else if (value.trim()) answer(checkQuizReading(value, q.kanji, q.word!))
              }}
            >
              <KanaInput
                ref={inputRef}
                value={value}
                onValueChange={setValue}
                readOnly={result !== null}
                placeholder={t.kanji.readingPlaceholder}
                enterKeyHint="done"
                className="h-14 min-w-0 flex-1 rounded-2xl border border-line bg-surface px-4 text-center text-[22px] focus:border-accent/60 focus:outline-none"
              />
              <Button variant="primary" size="lg" type="submit">
                {result !== null ? t.common.continue : t.common.check}
              </Button>
            </form>
          ) : (
            <>
              <div className="grid gap-2.5">
                {(q.options ?? []).map((o) => {
                  const right = result !== null && o === q.answer
                  const wrong = result === false && o === picked
                  return (
                    <button
                      key={o}
                      data-option
                      lang={q.type === 'kanji-reading' ? 'ja' : undefined}
                      disabled={result !== null}
                      onClick={() => {
                        setPicked(o)
                        answer(o === q.answer)
                      }}
                      className={`min-h-14 rounded-2xl border px-4 py-3 text-[17px] transition active:scale-[0.98] ${
                        right ? 'border-good bg-good/15' : wrong ? 'border-accent bg-accent/15' : 'border-line bg-surface'
                      }`}
                    >
                      {o}
                    </button>
                  )
                })}
              </div>
              {result !== null && (
                <Button variant="primary" size="lg" className="mt-3 w-full" onClick={next}>
                  {t.common.continue}
                </Button>
              )}
            </>
          )}
        </div>
      </div>
    </FocusLayout>
  )
}

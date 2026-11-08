import { useMemo, useState } from 'react'
import { useLocation } from 'wouter'
import { FocusLayout } from '../../components/Page'
import { Button, Chip, ProgressBar, Segmented, Toggle } from '../../components/ui'
import type { KanjiProgressRow } from '../../lib/db'
import { useLang, useT } from '../../lib/i18n'
import {
  defaultKanjiLessons,
  drawPrompt,
  KANJI,
  KANJI_LESSONS,
  kanjiKey,
  kanjiMeaning,
  pickForWriting,
  recordKanji,
  variants,
  wordMeaning,
  writeScore,
  type DrawPrompt,
  type Kanji,
} from '../../lib/kanji'
import { useSettings } from '../../lib/settings'
import { SessionDone } from '../review/SessionDone'
import { useKanjiStats } from './KanjiPage'
import { DrawCheck, FreeDraw, StrokeAnimation } from './StrokeCanvas'

type Mode = 'free' | 'check'
interface Setup {
  lessons: number[]
  count: number
  mode: Mode
  weakMore: boolean
}
interface Item {
  kanji: Kanji
  prompt: DrawPrompt
}
const KEY = 'kotoba.kanjiDraw'

function loadSetup(currentLesson: number): Setup {
  const fallback: Setup = { lessons: defaultKanjiLessons(currentLesson), count: 10, mode: 'free', weakMore: true }
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<Setup> | null
    if (v?.lessons?.length) {
      const lessons = v.lessons.filter((l) => KANJI_LESSONS.includes(l))
      return { ...fallback, ...v, lessons: lessons.length ? lessons : fallback.lessons, mode: v.mode === 'check' ? 'check' : 'free' }
    }
  } catch {
    /* ignore */
  }
  return fallback
}

/** Write-from-meaning practice: a kanji's meaning and a word with the kanji blanked out → write it. */
export function KanjiDrawPage() {
  const t = useT()
  const lang = useLang()
  const s = useSettings()
  const [, navigate] = useLocation()
  const stats = useKanjiStats()
  const [v, setV] = useState<Setup>(() => loadSetup(s.currentLesson))
  const [items, setItems] = useState<Item[] | null>(null)
  const toggleLesson = (n: number) => setV((p) => ({ ...p, lessons: p.lessons.includes(n) ? p.lessons.filter((l) => l !== n) : [...p.lessons, n] }))

  const start = () => {
    try {
      localStorage.setItem(KEY, JSON.stringify(v))
    } catch {
      /* ignore */
    }
    const pool = KANJI.filter((k) => v.lessons.includes(k.lesson))
    setItems(pickForWriting(pool, stats ?? new Map(), v.count, v.weakMore).map((kanji) => ({ kanji, prompt: drawPrompt(kanji) })))
  }

  if (items) return <DrawRunner key={items.map((i) => i.kanji.kanji).join('')} items={items} mode={v.mode} onExit={() => setItems(null)} onDone={() => navigate('/kanji?')} />

  return (
    <FocusLayout title={t.kanji.drawTitle} onExit={() => navigate('/kanji?')}>
      <div className="flex flex-1 flex-col pt-2">
        <h1 className="text-[28px] font-bold tracking-tight">{t.kanji.drawTitle}</h1>
        <p className="mt-1 text-[15px] text-muted">{t.kanji.drawDesc}</p>
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
              <Chip key={n} active={v.lessons.includes(n)} onClick={() => toggleLesson(n)}>
                {t.common.lessonShort(n)}
              </Chip>
            ))}
          </div>
        </section>
        <section className="mt-5">
          <h2 className="mb-2 text-[13px] font-semibold text-muted">{t.kanji.drawMode}</h2>
          <Segmented
            value={v.mode}
            onChange={(mode) => setV((p) => ({ ...p, mode }))}
            options={[
              { value: 'free', label: t.kanji.drawModeFree },
              { value: 'check', label: t.kanji.drawModeCheck },
            ]}
          />
        </section>
        <section className="mt-5">
          <h2 className="mb-2 text-[13px] font-semibold text-muted">{t.study.count}</h2>
          <Segmented value={v.count} onChange={(count) => setV((p) => ({ ...p, count }))} options={[10, 20, 30].map((c) => ({ value: c, label: String(c) }))} />
        </section>
        <section className="mt-5 flex items-center justify-between gap-4 rounded-2xl bg-surface px-4 py-3">
          <div>
            <div className="text-[15px]">{t.kanji.weakMore}</div>
            <div className="text-[12px] text-faint">{t.kanji.weakMoreHint}</div>
          </div>
          <Toggle checked={v.weakMore} onChange={(weakMore) => setV((p) => ({ ...p, weakMore }))} label={t.kanji.weakMore} />
        </section>
        <WriteRecord lessons={v.lessons} stats={stats} lang={lang} />
        <div className="mt-auto pt-8">
          <Button variant="primary" size="lg" className="w-full" disabled={!v.lessons.length || (v.weakMore && !stats)} onClick={start}>
            {t.study.begin}
          </Button>
        </div>
      </div>
    </FocusLayout>
  )
}

/** The kanji you write best and worst in the chosen lessons. */
function WriteRecord({ lessons, stats, lang }: { lessons: number[]; stats?: Map<string, KanjiProgressRow>; lang: 'en' | 'pl' }) {
  const t = useT()
  const scored = useMemo(
    () =>
      KANJI.filter((k) => lessons.includes(k.lesson))
        .map((k) => ({ k, s: writeScore(stats?.get(kanjiKey(k.kanji))) }))
        .filter((x): x is { k: Kanji; s: NonNullable<typeof x.s> } => !!x.s),
    [lessons, stats],
  )
  if (!scored.length) return null
  // smoothed rate so one lucky answer doesn't top the list
  const rank = (x: (typeof scored)[number]) => (x.s.right + 1) / (x.s.right + x.s.wrong + 2)
  const best = [...scored].sort((a, b) => rank(b) - rank(a)).filter((x) => x.s.rate >= 0.5).slice(0, 6)
  const worst = [...scored].sort((a, b) => rank(a) - rank(b)).filter((x) => x.s.rate < 1).slice(0, 6)
  const row = (title: string, list: typeof scored, tone: string) =>
    list.length > 0 && (
      <div>
        <h3 className="mb-1.5 text-[12px] font-semibold text-muted">{title}</h3>
        <div className="flex flex-wrap gap-1.5">
          {list.map(({ k, s }) => (
            <span key={k.kanji} title={kanjiMeaning(k, lang)} className="inline-flex items-baseline gap-1 rounded-xl bg-surface px-2.5 py-1">
              <span lang="ja" className="jp-serif text-[18px]">
                {k.kanji}
              </span>
              <span className={`text-[11px] tabular-nums ${tone}`}>{t.kanji.writeRate(s.right, s.right + s.wrong)}</span>
            </span>
          ))}
        </div>
      </div>
    )
  return (
    <section className="mt-5 space-y-3" data-testid="write-record">
      {row(t.kanji.best, best, 'text-good')}
      {row(t.kanji.needsWork, worst, 'text-accent')}
    </section>
  )
}

function DrawRunner({ items, mode, onExit, onDone }: { items: Item[]; mode: Mode; onExit: () => void; onDone: () => void }) {
  const t = useT()
  const lang = useLang()
  const [pos, setPos] = useState(0)
  const [result, setResult] = useState<boolean | null>(null)
  const [revealed, setRevealed] = useState(false)
  // after answering: redraw for practice (attempt > 0) or watch the stroke order
  const [attempt, setAttempt] = useState(0)
  const [strokes, setStrokes] = useState(0)
  const [missed, setMissed] = useState<Kanji[]>([])
  const item = items[pos]

  const answer = (ok: boolean) => {
    if (!item || result !== null) return
    setResult(ok)
    if (!ok) setMissed((m) => [...m, item.kanji])
    void recordKanji(kanjiKey(item.kanji.kanji), ok, 'write')
  }
  const next = () => {
    setResult(null)
    setRevealed(false)
    setAttempt(0)
    setStrokes(0)
    setPos((p) => p + 1)
  }
  const drawAgain = () => {
    setRevealed(false)
    setStrokes(0)
    setAttempt((a) => a + 1)
  }
  // replays when already showing
  const showStrokes = () => setStrokes((s) => s + 1)

  if (!item) {
    const n = items.length
    return (
      <FocusLayout title={t.kanji.drawTitle} onExit={onExit}>
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
                {[...new Set(missed)].map((k) => (
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

  const { kanji: k, prompt } = item
  return (
    <FocusLayout onExit={onExit} progress={<ProgressBar value={pos / items.length} />}>
      <div className="mx-auto flex w-full max-w-sm flex-1 flex-col pt-1">
        <p className="text-center text-[13px] font-semibold tracking-wide text-muted">{t.kanji.drawPrompt}</p>
        <div className="mt-1 text-center" data-testid="draw-prompt">
          <div className="text-[24px] font-semibold">{kanjiMeaning(k, lang)}</div>
          <div className="mt-1 text-[15px] text-muted">
            <span lang="ja" className="jp-serif text-[20px] text-text">
              {result !== null || revealed ? variants(prompt.word.w)[0] : prompt.blanked}
            </span>
            <span lang="ja" className="ml-2">
              {variants(prompt.word.r)[0]}
            </span>
            <span className="ml-2">{wordMeaning(prompt.word, lang)}</span>
          </div>
        </div>
        <div className="mt-3">
          {revealed || strokes > 0 ? (
            <StrokeAnimation kanji={k.kanji} run={strokes} />
          ) : mode === 'free' ? (
            // a redraw after answering is practice only: the first attempt is what counts
            <FreeDraw key={`${pos}-${attempt}`} kanji={k.kanji} onGrade={attempt ? undefined : answer} practice={attempt > 0} hint={t.kanji.drawHint} />
          ) : (
            <DrawCheck key={`${pos}-${attempt}`} kanji={k.kanji} allowTrace={false} onDone={(misses) => !attempt && answer(misses === 0)} />
          )}
        </div>
        <div className="mt-auto pt-4">
          {result !== null || revealed ? (
            <>
              <div className={`mb-2 grid gap-2 ${result === true ? 'grid-cols-1' : 'grid-cols-2'}`}>
                {result !== true && <Button onClick={drawAgain}>↻ {t.kanji.drawAgain}</Button>}
                <Button onClick={showStrokes}>▶ {strokes > 0 ? t.kanji.replay : t.kanji.showStrokes}</Button>
              </div>
              <Button variant="primary" size="lg" className="w-full" onClick={next}>
                {t.common.continue}
              </Button>
            </>
          ) : (
            <button
              className="w-full py-2 text-center text-[14px] text-muted underline-offset-4 hover:underline"
              onClick={() => {
                setRevealed(true)
                answer(false)
              }}
            >
              {t.kanji.reveal}
            </button>
          )}
        </div>
      </div>
    </FocusLayout>
  )
}

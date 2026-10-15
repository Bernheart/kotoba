import { motion } from 'motion/react'
import { useEffect, useMemo, useState } from 'react'
import { useLocation } from 'wouter'
import { WordJP } from '../../components/Furigana'
import { FocusLayout } from '../../components/Page'
import { Button } from '../../components/ui'
import { meaning, useLang, useT } from '../../lib/i18n'
import { shuffle, logPractice } from '../../lib/srs/queue'
import type { VocabEntry } from '../../lib/vocab'
import { useVocab } from '../../lib/vocab-context'
import { SessionDone } from '../review/SessionDone'
import { PracticeSetup, type SetupValue } from './PracticeSetup'

const BEST_KEY = 'kotoba.matching.best'
const fmt = (ms: number) => `${(ms / 1000).toFixed(1)}s`

/** Timed pairs: tap a Japanese word, then its meaning. */
export function MatchingPage() {
  const t = useT()
  const lang = useLang()
  const [, navigate] = useLocation()
  const { words } = useVocab()
  const [board, setBoard] = useState<VocabEntry[] | null>(null)
  const [setup, setSetup] = useState<SetupValue | null>(null)
  const [left, setLeft] = useState<VocabEntry[]>([])
  const [right, setRight] = useState<VocabEntry[]>([])
  const [sel, setSel] = useState<{ side: 'l' | 'r'; id: string } | null>(null)
  const [done, setDone] = useState<Set<string>>(new Set())
  const [wrong, setWrong] = useState<string | null>(null)
  const [mistakes, setMistakes] = useState<Set<string>>(new Set())
  const [start, setStart] = useState(0)
  const [now, setNow] = useState(0)
  const [best, setBest] = useState<number | null>(() => Number(localStorage.getItem(BEST_KEY)) || null)
  const finished = board !== null && done.size === board.length

  const begin = (v: SetupValue) => {
    setSetup(v)
    const pool = words.filter((w) => v.lessons.includes(w.genkiLesson) && w.type !== 'particle')
    // avoid duplicate meanings on one board
    const seen = new Set<string>()
    const picked: VocabEntry[] = []
    for (const w of shuffle([...pool])) {
      const key = meaning(w, lang).toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      picked.push(w)
      if (picked.length === v.count) break
    }
    setBoard(picked)
    setLeft(shuffle([...picked]))
    setRight(shuffle([...picked]))
    setDone(new Set())
    setMistakes(new Set())
    setSel(null)
    setStart(Date.now())
    setNow(Date.now())
  }

  useEffect(() => {
    if (!board || finished) return
    const id = setInterval(() => setNow(Date.now()), 100)
    return () => clearInterval(id)
  }, [board, finished])

  const elapsed = (finished ? now : now) - start
  const isRecord = useMemo(() => finished && (best === null || elapsed <= best), [finished]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (finished && board && (best === null || elapsed < best) && board.length === 6) {
      localStorage.setItem(BEST_KEY, String(elapsed))
      setBest(elapsed)
    }
  }, [finished]) // eslint-disable-line react-hooks/exhaustive-deps

  const tap = (side: 'l' | 'r', id: string) => {
    if (done.has(id)) return
    if (!sel || sel.side === side) return setSel({ side, id })
    if (sel.id === id) {
      setDone((d) => new Set(d).add(id))
      void logPractice(id, 'matching', !mistakes.has(id), Date.now() - start)
      setSel(null)
      if (done.size + 1 === board!.length) setNow(Date.now())
    } else {
      setWrong(`${sel.id}|${id}`)
      setMistakes((m) => new Set(m).add(sel.id).add(id))
      setTimeout(() => setWrong(null), 400)
      setSel(null)
    }
  }

  if (!board) return <PracticeSetup title={t.study.matching} description={t.study.matchingDesc} counts={[6]} onStart={begin} />

  if (finished)
    return (
      <FocusLayout title={t.study.matching} onExit={() => navigate('/study')}>
        <SessionDone
          title={isRecord ? t.matching.newRecord : undefined}
          stats={[
            { label: t.study.time, value: fmt(elapsed) },
            { label: t.study.mistakes, value: mistakes.size / 2 },
            { label: t.study.best(''), value: best ? fmt(best) : '—' },
          ]}
        >
          <Button variant="primary" size="lg" onClick={() => setup && begin(setup)}>
            {t.study.again}
          </Button>
          <Button onClick={() => navigate('/study')}>{t.common.done}</Button>
        </SessionDone>
      </FocusLayout>
    )

  const tile = (side: 'l' | 'r', w: VocabEntry) => {
    const isDone = done.has(w.id)
    const isSel = sel?.side === side && sel.id === w.id
    const isWrong = wrong?.split('|').includes(w.id) && !isDone
    return (
      <motion.button
        key={`${side}-${w.id}`}
        layout
        onClick={() => tap(side, w.id)}
        animate={isWrong ? { x: [0, -7, 7, -4, 4, 0] } : { opacity: isDone ? 0.18 : 1, scale: isDone ? 0.96 : 1 }}
        transition={{ duration: 0.3 }}
        disabled={isDone}
        className={`flex min-h-[64px] items-center justify-center rounded-2xl border px-2 py-2 text-center transition ${
          isSel ? 'border-accent bg-accent/15' : isWrong ? 'border-accent/70' : isDone ? 'border-good/40 bg-good/10' : 'border-line bg-surface active:scale-[0.98]'
        }`}
      >
        {side === 'l' ? <WordJP word={w} className="text-[20px] leading-[1.7]" /> : <span className="text-[14px] leading-snug">{meaning(w, lang).split(';')[0]}</span>}
      </motion.button>
    )
  }

  return (
    <FocusLayout
      onExit={() => navigate('/study')}
      progress={
        <div className="flex items-center justify-between">
          <span className="text-[13px] text-muted">{t.matching.instruction}</span>
          <span className="text-[15px] font-semibold tabular-nums">{fmt(elapsed)}</span>
        </div>
      }
    >
      <div className="grid flex-1 grid-cols-2 content-center gap-2.5 py-4">
        <div className="grid gap-2.5">{left.map((w) => tile('l', w))}</div>
        <div className="grid gap-2.5">{right.map((w) => tile('r', w))}</div>
      </div>
    </FocusLayout>
  )
}

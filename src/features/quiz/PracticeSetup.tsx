import { useState, type ReactNode } from 'react'
import { FocusLayout } from '../../components/Page'
import { Button, Chip, Segmented } from '../../components/ui'
import { deckLabel } from '../../lib/decks'
import { useT } from '../../lib/i18n'
import { useSettings } from '../../lib/settings'
import { unlockSpeech } from '../../lib/tts'
import { useVocab } from '../../lib/vocab-context'

export interface SetupValue {
  lessons: number[]
  /** Custom decks in scope (see `inScope`) */
  decks: string[]
  count: number
}

const KEY = 'kotoba.practice'

export function loadSetup(currentLesson: number): SetupValue {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null')
    if (v?.lessons && v?.count) return { decks: [], ...v }
  } catch {
    /* ignore */
  }
  return { lessons: Array.from({ length: currentLesson }, (_, i) => i + 1), decks: [], count: 15 }
}

/** Start screen shared by the practice modes: which lessons, how many questions, plus mode-specific options. */
export function PracticeSetup({
  title,
  description,
  onStart,
  children,
  counts = [10, 15, 25],
  hint,
}: {
  title: string
  description: string
  onStart: (v: SetupValue) => void
  children?: ReactNode
  counts?: number[]
  hint?: ReactNode
}) {
  const t = useT()
  const s = useSettings()
  const { lessons, decks } = useVocab()
  const [v, setV] = useState<SetupValue>(() => loadSetup(s.currentLesson))
  // a remembered deck that was removed since doesn't count
  const chosenDecks = v.decks.filter((d) => decks.includes(d))
  const toggle = (n: number) => setV((x) => ({ ...x, lessons: x.lessons.includes(n) ? x.lessons.filter((l) => l !== n) : [...x.lessons, n] }))
  const toggleDeck = (d: string) => setV((x) => ({ ...x, decks: x.decks.includes(d) ? x.decks.filter((l) => l !== d) : [...x.decks, d] }))
  const allOn = v.lessons.length === lessons.length && chosenDecks.length === decks.length
  return (
    <FocusLayout title={title}>
      <div className="flex flex-1 flex-col pt-2">
        <h1 className="text-[28px] font-bold tracking-tight">{title}</h1>
        <p className="mt-1 text-[15px] text-muted">{description}</p>
        <section className="mt-6">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-[13px] font-semibold text-muted">{t.study.scope}</h2>
            <button className="text-[13px] text-accent" onClick={() => setV((x) => (allOn ? { ...x, lessons: [], decks: [] } : { ...x, lessons: [...lessons], decks: [...decks] }))}>
              {t.common.all}
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {lessons.map((n) => (
              <Chip key={n} active={v.lessons.includes(n)} onClick={() => toggle(n)}>
                {n === 0 ? '—' : t.common.lessonShort(n)}
              </Chip>
            ))}
            {decks.map((d) => (
              <Chip key={d} active={v.decks.includes(d)} onClick={() => toggleDeck(d)}>
                {deckLabel(d)}
              </Chip>
            ))}
          </div>
        </section>
        <section className="mt-5">
          <h2 className="mb-2 text-[13px] font-semibold text-muted">{t.study.count}</h2>
          <Segmented value={v.count} onChange={(count) => setV((x) => ({ ...x, count }))} options={counts.map((c) => ({ value: c, label: String(c) }))} />
        </section>
        {children}
        {hint && <div className="mt-4 text-[13px] text-faint">{hint}</div>}
        <div className="mt-auto pt-8">
          <Button
            variant="primary"
            size="lg"
            className="w-full"
            disabled={!v.lessons.length && !chosenDecks.length}
            onClick={() => {
              unlockSpeech()
              try {
                localStorage.setItem(KEY, JSON.stringify(v))
              } catch {
                /* ignore */
              }
              onStart({ ...v, decks: chosenDecks })
            }}
          >
            {t.study.begin}
          </Button>
        </div>
      </div>
    </FocusLayout>
  )
}

import { AnimatePresence, motion } from 'motion/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Rating, type Grade } from 'ts-fsrs'
import { Link, useLocation, useSearch } from 'wouter'
import { fitSize, SentenceJP, WordJP } from '../../components/Furigana'
import { KanaInput } from '../../components/KanaInput'
import { FocusLayout } from '../../components/Page'
import { SpeakButton, useSpeak, wordSpeech } from '../../components/SpeakButton'
import { Button, ProgressBar, Sheet } from '../../components/ui'
import { useKeyboardInset } from '../../components/useKeyboardInset'
import { checkJapanese, checkMeaning, type Verdict } from '../../lib/answer'
import { db, type CardRow } from '../../lib/db'
import { exampleTranslation, meaning, shortInterval, useLang, useT } from '../../lib/i18n'
import { stripMarkup } from '../../lib/jp/markup'
import { getSettings, setSetting, useSettings } from '../../lib/settings'
import { answerCard, buildQueue, LEARN_AHEAD_MS, previewIntervals, undoAnswer, type AnswerResult, type QueueItem } from '../../lib/srs/queue'
import { studyDay } from '../../lib/time'
import type { VocabEntry } from '../../lib/vocab'
import { useVocab } from '../../lib/vocab-context'
import { setMnemonic } from '../../lib/words'
import { CardView } from './CardView'
import { SessionDone } from './SessionDone'

type Phase = 'front' | 'back'

const RATINGS: { r: Grade; key: 'again' | 'hard' | 'good' | 'easy'; cls: string }[] = [
  { r: Rating.Again, key: 'again', cls: 'text-accent border-accent/40' },
  { r: Rating.Hard, key: 'hard', cls: 'text-warn border-warn/40' },
  { r: Rating.Good, key: 'good', cls: 'text-good border-good/40' },
  { r: Rating.Easy, key: 'easy', cls: 'text-easy border-easy/40' },
]

/** SRS review session. `?new=1` = only learn new words; `?word=<id>` = study one word now. */
export function ReviewPage() {
  const t = useT()
  const settings = useSettings()
  const search = useSearch()
  const [, navigate] = useLocation()
  const { words, byId } = useVocab()
  const say = useSpeak()
  useKeyboardInset()

  const [queue, setQueue] = useState<QueueItem[] | null>(null)
  const [pos, setPos] = useState(0)
  const [phase, setPhase] = useState<Phase>('front')
  const [typed, setTyped] = useState('')
  const [verdict, setVerdict] = useState<Verdict | null>(null)
  const [cards, setCards] = useState<Map<string, CardRow>>(new Map())
  const [history, setHistory] = useState<{ res: AnswerResult; pos: number; inserted: boolean }[]>([])
  const [leech, setLeech] = useState<VocabEntry | null>(null)
  const [stats, setStats] = useState({ answered: 0, correct: 0, started: Date.now() })
  const shownAt = useRef(Date.now())
  const inputRef = useRef<HTMLInputElement>(null)

  // Build the queue once per session.
  useEffect(() => {
    if (!words.length || queue) return
    void (async () => {
      const params = new URLSearchParams(search)
      if (search) navigate('/review?', { replace: true })
      const [all, todayLogs] = await Promise.all([db.cards.toArray(), db.reviewLogs.where('day').equals(studyDay()).toArray()])
      setCards(new Map(all.map((c) => [c.id, c])))
      const s = getSettings()
      const only = params.get('word')
      if (only && byId.has(only)) {
        const c = all.find((x) => x.id === `${only}:recog`)
        setQueue([{ cardId: `${only}:recog`, wordId: only, dir: 'recog', kind: !c || c.state === 0 ? 'intro' : 'card', isNew: !c || c.state === 0 }])
        return
      }
      const newOnly = params.get('new') === '1'
      const q = buildQueue(
        { words, cards: all, todayLogs: todayLogs.filter((l) => !l.deleted), settings: newOnly ? { ...s, newPerDay: s.newPerDay + 5 } : s },
        { includeNew: true },
      )
      setQueue(newOnly ? q.filter((i) => i.isNew) : q)
    })()
  }, [words, byId, queue, search, navigate])

  const item = queue?.[pos]
  const word = item ? byId.get(item.wordId) : undefined
  const done = queue !== null && pos >= queue.length
  const remaining = queue ? queue.length - pos : 0
  const intervals = useMemo(
    () => (item && item.kind === 'card' ? previewIntervals(cards.get(item.cardId), item.wordId, item.dir, settings.retention) : null),
    [item, cards, settings.retention],
  )
  const typeMode = settings.reviewStyle === 'type' && item?.kind === 'card'

  useEffect(() => {
    shownAt.current = Date.now()
    setPhase('front')
    setTyped('')
    setVerdict(null)
    if (typeMode) setTimeout(() => inputRef.current?.focus(), 250)
  }, [pos, item?.cardId, typeMode])

  const flip = useCallback(() => {
    if (!word || !item) return
    setPhase('back')
    if (settings.autoplayAudio || item.dir === 'recall') void say(wordSpeech(word))
  }, [word, item, settings.autoplayAudio, say])

  const check = () => {
    if (!word || !item || phase === 'back') return
    const v = item.dir === 'recog' ? checkMeaning(typed, word) : checkJapanese(typed, word)
    setVerdict(v)
    flip()
  }

  const rate = useCallback(
    async (r: Grade) => {
      if (!item || !word || !queue || item.kind !== 'card') return
      const ms = Date.now() - shownAt.current
      const correct = r !== Rating.Again
      const res = await answerCard(item.wordId, item.dir, r, {
        ms,
        mode: 'review',
        correct,
        settings: getSettings(),
      })
      setCards((m) => new Map(m).set(res.card.id, res.card))
      setStats((s) => ({ ...s, answered: s.answered + 1, correct: s.correct + (correct ? 1 : 0) }))
      // Learning steps due within the session come back later in the queue.
      let inserted = false
      if (res.card.due <= Date.now() + LEARN_AHEAD_MS) {
        const gap = r === Rating.Again ? 3 : 6
        const next = [...queue]
        next.splice(Math.min(next.length, pos + 1 + gap), 0, { ...item, kind: 'card', isNew: false })
        setQueue(next)
        inserted = true
      }
      setHistory((h) => [...h.slice(-20), { res, pos, inserted }])
      if (res.becameLeech) setLeech(word)
      setPos((p) => p + 1)
    },
    [item, word, queue, pos],
  )

  const undo = async () => {
    const last = history.at(-1)
    if (!last || !queue) return
    await undoAnswer(last.res)
    if (last.inserted) {
      const idx = queue.findIndex((q, i) => i > last.pos && q.cardId === last.res.card.id)
      if (idx > 0) setQueue(queue.filter((_, i) => i !== idx))
    }
    setCards((m) => {
      const n = new Map(m)
      if (last.res.prev) n.set(last.res.prev.id, last.res.prev)
      else n.delete(last.res.card.id)
      return n
    })
    setStats((s) => ({ ...s, answered: Math.max(0, s.answered - 1), correct: s.correct - (last.res.log.correct ? 1 : 0) }))
    setHistory((h) => h.slice(0, -1))
    setPos(last.pos)
  }

  const finishIntro = () => {
    if (!item || !queue) return
    // Quick check right after the intro (lesson → quiz), a couple of cards later.
    const next = [...queue]
    next.splice(Math.min(next.length, pos + 2), 0, { ...item, kind: 'card' })
    setQueue(next)
    setPos((p) => p + 1)
  }

  const autoRating: Grade | null = verdict === 'correct' ? Rating.Good : verdict === 'almost' ? Rating.Hard : verdict === 'wrong' ? Rating.Again : null

  // Keyboard shortcuts (Mac)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (leech || e.metaKey || e.ctrlKey || e.altKey) return
      const inInput = (e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'TEXTAREA'
      if (item?.kind === 'intro') {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          finishIntro()
        }
        return
      }
      if (inInput && phase === 'front') return
      if (e.key === 'Escape') navigate('/')
      else if (phase === 'front' && (e.key === ' ' || e.key === 'Enter')) {
        e.preventDefault()
        if (typeMode) check()
        else flip()
      } else if (phase === 'back') {
        const map: Record<string, Grade> = { '1': Rating.Again, '2': Rating.Hard, '3': Rating.Good, '4': Rating.Easy, ArrowLeft: Rating.Again, ArrowRight: Rating.Good, ArrowUp: Rating.Easy }
        if (map[e.key]) {
          e.preventDefault()
          void rate(map[e.key]!)
        } else if ((e.key === 'Enter' || e.key === ' ') && (autoRating || !typeMode)) {
          e.preventDefault()
          void rate(autoRating ?? Rating.Good)
        }
      }
      if (!inInput && (e.key === 'p' || e.key === 'P') && word) void say(wordSpeech(word))
      if (!inInput && (e.key === 'f' || e.key === 'F')) void setSetting('furigana', !getSettings().furigana)
      if (!inInput && e.key === 'z' && history.length) void undo()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (!queue)
    return (
      <FocusLayout title={t.study.flashcards}>
        <div className="flex flex-1 items-center justify-center text-muted">…</div>
      </FocusLayout>
    )

  if (done || !item || !word) {
    const pct = stats.answered ? Math.round((stats.correct / stats.answered) * 100) : 0
    const mins = Math.max(1, Math.round((Date.now() - stats.started) / 60000))
    return (
      <FocusLayout title={t.study.flashcards} onExit={() => navigate('/')}>
        {stats.answered === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
            <p lang="ja" className="jp-serif text-[44px]">
              おつかれさま
            </p>
            <p className="text-muted">{t.review.nothingDue}</p>
            <div className="mt-2 flex w-full max-w-xs flex-col gap-2">
              <Button
                variant="primary"
                onClick={() => {
                  navigate('/review?new=1')
                  setQueue(null)
                }}
              >
                {t.review.learnMore}
              </Button>
              <Link href="/study" className="text-center text-[15px] text-muted underline-offset-4 hover:underline">
                {t.study.practice}
              </Link>
            </div>
          </div>
        ) : (
          <SessionDone
            stats={[
              { label: t.study.mistakes, value: stats.answered - stats.correct },
              { label: '%', value: `${pct}%` },
              { label: t.study.time, value: t.common.minutes(mins) },
            ]}
          >
            <Button variant="primary" size="lg" onClick={() => navigate('/')}>
              {t.common.done}
            </Button>
            <Button onClick={() => navigate('/study')}>{t.study.practice}</Button>
          </SessionDone>
        )}
      </FocusLayout>
    )
  }

  return (
    <FocusLayout
      onExit={() => navigate('/')}
      progress={
        <div className="flex items-center gap-3">
          <ProgressBar value={pos / Math.max(1, queue.length)} className="flex-1" />
          <span className="text-[13px] text-faint tabular-nums">{remaining}</span>
        </div>
      }
      right={
        history.length > 0 ? (
          <button onClick={undo} className="h-11 px-2 text-[14px] text-muted" aria-label={t.review.undo}>
            ↶
          </button>
        ) : null
      }
    >
      <AnimatePresence mode="wait">
        <motion.div
          key={`${pos}-${item.cardId}-${item.kind}`}
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.18 }}
          className="flex min-h-0 flex-1 flex-col pt-2"
        >
          {item.kind === 'intro' ? (
            <IntroCard word={word} onDone={finishIntro} />
          ) : (
            <>
              <CardView
                word={word}
                dir={item.dir}
                flipped={phase === 'back'}
                onFlip={typeMode ? () => inputRef.current?.focus() : flip}
                onSwipe={typeMode ? undefined : (r) => void rate(r)}
                verdict={verdict ? { kind: verdict, typed } : undefined}
                badge={
                  <div className="flex justify-between px-5 pt-4 text-[12px] text-faint">
                    <span>{item.dir === 'recog' ? t.review.recogPrompt : t.review.recallPrompt}</span>
                    {cards.get(item.cardId)?.leech ? <span className="text-accent">{t.word.leech}</span> : null}
                  </div>
                }
              />
              <div className="pt-4 pb-[max(0px,calc(var(--kb-inset)-var(--safe-bottom)))]">
                {phase === 'front' ? (
                  typeMode ? (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault()
                        check()
                      }}
                      className="flex gap-2"
                    >
                      {item.dir === 'recall' ? (
                        <KanaInput
                          ref={inputRef}
                          value={typed}
                          onValueChange={setTyped}
                          placeholder={t.review.typeJapanese}
                          enterKeyHint="done"
                          className="h-14 min-w-0 flex-1 rounded-2xl border border-line bg-surface px-4 text-[20px] focus:border-accent/60 focus:outline-none"
                        />
                      ) : (
                        <input
                          ref={inputRef}
                          value={typed}
                          onChange={(e) => setTyped(e.target.value)}
                          placeholder={t.review.typeMeaning}
                          autoCapitalize="off"
                          autoCorrect="off"
                          autoComplete="off"
                          spellCheck={false}
                          enterKeyHint="done"
                          className="h-14 min-w-0 flex-1 rounded-2xl border border-line bg-surface px-4 text-[18px] focus:border-accent/60 focus:outline-none"
                        />
                      )}
                      <Button variant="primary" size="lg" type="submit" className="px-5">
                        {t.common.check}
                      </Button>
                    </form>
                  ) : (
                    <Button variant="primary" size="lg" className="w-full" onClick={flip}>
                      {t.common.showAnswer}
                      <span className="hidden text-[13px] font-normal opacity-70 lg:inline">· space</span>
                    </Button>
                  )
                ) : (
                  <div className="grid grid-cols-4 gap-2">
                    {RATINGS.map(({ r, key, cls }) => (
                      <button
                        key={r}
                        onClick={() => void rate(r)}
                        className={`flex h-16 flex-col items-center justify-center rounded-2xl border bg-surface transition active:scale-95 ${cls} ${
                          autoRating === r ? 'ring-2 ring-current' : ''
                        }`}
                      >
                        <span className="text-[15px] font-semibold">{t.review[key]}</span>
                        <span className="text-[12px] text-faint tabular-nums">{intervals ? shortInterval(intervals[r]) : ''}</span>
                      </button>
                    ))}
                  </div>
                )}
                <p className="mt-3 hidden text-center text-[12px] text-faint lg:block">{t.review.keysHint}</p>
                {phase === 'back' && !typeMode && <p className="mt-2 text-center text-[12px] text-faint lg:hidden">{t.review.swipeHint}</p>}
              </div>
            </>
          )}
        </motion.div>
      </AnimatePresence>
      <LeechSheet word={leech} onClose={() => setLeech(null)} />
    </FocusLayout>
  )
}

export function IntroCard({ word, onDone }: { word: VocabEntry; onDone: () => void }) {
  const t = useT()
  const lang = useLang()
  const other = lang === 'pl' ? word.en : word.pl
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="card-face flex min-h-0 flex-1 flex-col overflow-y-auto rounded-[32px] border border-line/70 px-6 py-6">
        <span className="self-start rounded-full bg-accent/15 px-3 py-1 text-[12px] font-semibold text-accent">{t.review.newWord}</span>
        <div className="mt-4 flex items-start justify-between gap-3">
          <div style={{ fontSize: fitSize(word.japanese, 76, 250) }}>
            <WordJP word={word} className="jp-serif ruby-display" />
          </div>
          <SpeakButton text={wordSpeech(word)} size="lg" />
        </div>
        <p className="mt-1 text-[13px] tracking-wide text-faint">{word.romaji}</p>
        <p className="mt-3 text-[24px] leading-snug font-medium">{meaning(word, lang)}</p>
        {other && <p className="text-[15px] text-muted">{other}</p>}
        <p className="mt-2 text-[12px] text-faint">
          {t.types[word.type]} · {t.common.lesson(word.genkiLesson)}
        </p>
        {word.mnemonic && <p className="mt-3 rounded-2xl bg-warn/10 px-3.5 py-2 text-[14px] text-warn">💡 {word.mnemonic}</p>}
        {word.example && (
          <div className="mt-auto pt-6">
            <div className="flex items-start gap-2 rounded-2xl bg-bg-2 p-4">
              <div className="min-w-0 flex-1">
                <SentenceJP markup={word.example.ja} highlight className="text-[19px] leading-[2]" />
                <p className="mt-0.5 text-[14px] text-muted">{exampleTranslation(word.example, lang)}</p>
              </div>
              <SpeakButton text={stripMarkup(word.example.ja)} size="sm" />
            </div>
          </div>
        )}
      </div>
      <p className="mt-3 text-center text-[12px] text-faint">{t.review.introHint}</p>
      <Button variant="primary" size="lg" className="mt-3 w-full" onClick={onDone}>
        {t.review.gotIt}
      </Button>
    </div>
  )
}

function LeechSheet({ word, onClose }: { word: VocabEntry | null; onClose: () => void }) {
  const t = useT()
  const [text, setText] = useState('')
  useEffect(() => setText(word?.mnemonic ?? ''), [word])
  return (
    <Sheet open={!!word} onClose={onClose} title={t.review.leechTitle}>
      {word && (
        <div className="space-y-4 pb-2">
          <div className="text-center" style={{ fontSize: fitSize(word.japanese, 56, 300) }}>
            <WordJP word={word} className="jp-serif ruby-display" />
          </div>
          <p className="text-[15px] text-muted">{t.review.leechBody(getSettings().leechThreshold)}</p>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            placeholder={t.word.mnemonicPlaceholder}
            className="w-full rounded-2xl border border-line bg-bg-2 px-3.5 py-3 text-[16px] focus:border-accent/60 focus:outline-none"
          />
          <Button
            variant="primary"
            size="lg"
            className="w-full"
            onClick={async () => {
              if (text.trim()) await setMnemonic(word, text.trim())
              onClose()
            }}
          >
            {t.review.leechSave}
          </Button>
        </div>
      )}
    </Sheet>
  )
}

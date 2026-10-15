import { motion } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { toKatakana } from 'wanakana'
import { useLocation } from 'wouter'
import { FocusLayout } from '../../components/Page'
import { useSpeak } from '../../components/SpeakButton'
import { IconSpeaker } from '../../components/icons'
import { Button, Chip, ProgressBar, Segmented } from '../../components/ui'
import { useT } from '../../lib/i18n'
import { CONFUSABLE_SETS, findKana, KANA, kanaOf, romajiAccepted, type KanaItem } from '../../lib/jp/kana-table'
import { logPractice, shuffle } from '../../lib/srs/queue'
import { unlockSpeech } from '../../lib/tts'
import { SessionDone } from '../review/SessionDone'

type Script = 'hira' | 'kata' | 'both'
type Mode = 'read' | 'listen'
interface KQ {
  item: KanaItem
  script: 'hira' | 'kata'
  options?: string[]
  ghost?: boolean
}

export function KanaPage() {
  const t = useT()
  const [, navigate] = useLocation()
  const [script, setScript] = useState<Script>('kata')
  const [groups, setGroups] = useState<KanaItem['group'][]>(['basic', 'dakuten'])
  const [confusables, setConfusables] = useState(false)
  const [mode, setMode] = useState<Mode>('read')
  const [count, setCount] = useState(20)
  const [chart, setChart] = useState(false)
  const [qs, setQs] = useState<KQ[] | null>(null)

  const start = () => {
    unlockSpeech()
    const scripts: ('hira' | 'kata')[] = script === 'both' ? ['hira', 'kata'] : [script]
    let items: KQ[]
    if (confusables) {
      const sets = CONFUSABLE_SETS.filter((s) => scripts.includes(s.script))
      items = sets.flatMap((s) =>
        s.chars.map((ch) => ({ item: findKana(ch)!, script: s.script, options: shuffle([...s.chars]) })),
      )
    } else {
      const pool = KANA.filter((k) => groups.includes(k.group))
      items = scripts.flatMap((sc) => pool.map((item) => ({ item, script: sc })))
      if (mode === 'listen')
        items = items.map((q) => {
          const others = shuffle(pool.filter((k) => k !== q.item && k.row !== q.item.row)).slice(0, 2)
          const sameRow = shuffle(pool.filter((k) => k !== q.item && k.row === q.item.row)).slice(0, 1)
          return { ...q, options: shuffle([q.item, ...sameRow, ...others].map((k) => kanaOf(k, q.script))) }
        })
    }
    setQs(shuffle(items).slice(0, count))
  }

  if (qs) return <KanaRunner key={String(qs.length) + qs[0]?.item.hira} initial={qs} mode={confusables ? 'listen' : mode} onExit={() => setQs(null)} onDone={() => navigate('/study')} />

  return (
    <FocusLayout title={t.kana.title}>
      <div className="flex flex-1 flex-col pt-2">
        <h1 className="text-[28px] font-bold tracking-tight">{t.kana.title}</h1>
        <p className="mt-1 text-[15px] text-muted">{t.study.kanaDesc}</p>
        <section className="mt-6 space-y-4">
          <Segmented
            value={script}
            onChange={setScript}
            options={[
              { value: 'hira', label: <span lang="ja">ひらがな</span> },
              { value: 'kata', label: <span lang="ja">カタカナ</span> },
              { value: 'both', label: t.common.all },
            ]}
          />
          <div className="flex flex-wrap gap-2">
            {(
              [
                ['basic', t.kana.basic],
                ['dakuten', t.kana.dakuten],
                ['yoon', t.kana.yoon],
              ] as [KanaItem['group'], string][]
            ).map(([g, label]) => (
              <Chip
                key={g}
                active={!confusables && groups.includes(g)}
                onClick={() => {
                  setConfusables(false)
                  setGroups((gs) => (gs.includes(g) ? gs.filter((x) => x !== g) : [...gs, g]))
                }}
              >
                {label}
              </Chip>
            ))}
            <Chip active={confusables} onClick={() => setConfusables((c) => !c)}>
              <span lang="ja">シ/ツ</span> {t.kana.confusables}
            </Chip>
          </div>
          {!confusables && (
            <Segmented
              value={mode}
              onChange={setMode}
              options={[
                { value: 'read', label: t.kana.modeRead },
                { value: 'listen', label: t.kana.modeListen },
              ]}
            />
          )}
          <Segmented value={count} onChange={setCount} options={[10, 20, 40].map((c) => ({ value: c, label: String(c) }))} />
        </section>
        <button className="mt-5 self-start text-[14px] text-accent" onClick={() => setChart((c) => !c)}>
          {t.kana.chart} {chart ? '▲' : '▼'}
        </button>
        {chart && <KanaChart script={script === 'kata' ? 'kata' : 'hira'} />}
        <div className="mt-auto pt-8">
          <Button variant="primary" size="lg" className="w-full" disabled={!confusables && !groups.length} onClick={start}>
            {t.study.begin}
          </Button>
        </div>
      </div>
    </FocusLayout>
  )
}

function KanaChart({ script }: { script: 'hira' | 'kata' }) {
  const rows = useMemo(() => {
    const m = new Map<string, KanaItem[]>()
    for (const k of KANA) m.set(k.row, [...(m.get(k.row) ?? []), k])
    return [...m.values()]
  }, [])
  return (
    <div className="mt-3 grid gap-1.5" lang="ja">
      {rows.map((r) => (
        <div key={r[0]!.row} className="grid grid-cols-5 gap-1.5">
          {r.map((k) => (
            <div key={k.hira} className="rounded-xl bg-surface py-1.5 text-center">
              <div className="text-[20px] leading-tight">{kanaOf(k, script)}</div>
              <div className="text-[11px] text-faint">{k.romaji}</div>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

function KanaRunner({ initial, mode, onExit, onDone }: { initial: KQ[]; mode: Mode; onExit: () => void; onDone: () => void }) {
  const t = useT()
  const say = useSpeak()
  const [queue, setQueue] = useState(initial)
  const [pos, setPos] = useState(0)
  const [value, setValue] = useState('')
  const [result, setResult] = useState<null | boolean>(null)
  const [score, setScore] = useState({ n: 0, ok: 0 })
  const shown = useRef(Date.now())
  const inputRef = useRef<HTMLInputElement>(null)
  const q = queue[pos]
  const char = q ? kanaOf(q.item, q.script) : ''

  useEffect(() => {
    shown.current = Date.now()
    setValue('')
    setResult(null)
    if (mode === 'listen' && char) setTimeout(() => void say(char, 0.8), 200)
    else setTimeout(() => inputRef.current?.focus(), 150)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pos])

  const answer = (ok: boolean) => {
    if (!q || result !== null) return
    setResult(ok)
    void logPractice(`kana:${char}`, 'kana', ok, Date.now() - shown.current)
    if (!q.ghost) setScore((s) => ({ n: s.n + 1, ok: s.ok + (ok ? 1 : 0) }))
    if (!ok && !q.ghost) {
      const next = [...queue]
      next.splice(Math.min(next.length, pos + 3), 0, { ...q, ghost: true })
      setQueue(next)
    }
    if (ok) setTimeout(() => setPos((p) => p + 1), 450)
  }

  if (!q)
    return (
      <FocusLayout title={t.kana.title} onExit={onExit}>
        <SessionDone
          stats={[
            { label: t.study.mistakes, value: score.n - score.ok },
            { label: '%', value: `${score.n ? Math.round((score.ok / score.n) * 100) : 0}%` },
            { label: t.study.count, value: score.n },
          ]}
        >
          <Button variant="primary" size="lg" onClick={onExit}>
            {t.study.again}
          </Button>
          <Button onClick={onDone}>{t.common.done}</Button>
        </SessionDone>
      </FocusLayout>
    )

  return (
    <FocusLayout onExit={onExit} progress={<ProgressBar value={pos / queue.length} color={q.ghost ? 'var(--k-warn)' : undefined} />}>
      <div className="flex flex-1 flex-col items-center pt-6">
        {mode === 'read' ? (
          <motion.div key={pos} initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} lang="ja" className="jp-serif text-[120px] leading-none">
            {char}
          </motion.div>
        ) : (
          <button onClick={() => void say(char, 0.8)} className="grid h-32 w-32 place-items-center rounded-full bg-accent/15 text-accent" aria-label={t.common.play}>
            <IconSpeaker size={48} />
          </button>
        )}
        {result !== null && (
          <p className={`mt-4 text-[18px] font-semibold ${result ? 'text-good' : 'text-accent'}`}>
            {result ? '✓' : '✗'} <span lang="ja">{char}</span> = {q.item.romaji}
          </p>
        )}
        <div className="mt-auto w-full pb-[max(8px,calc(var(--kb-inset)-var(--safe-bottom)))]">
          {mode === 'read' ? (
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                if (result === false) setPos((p) => p + 1)
                else answer(romajiAccepted(q.item, value))
              }}
            >
              <input
                ref={inputRef}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="romaji"
                autoCapitalize="off"
                autoCorrect="off"
                autoComplete="off"
                spellCheck={false}
                enterKeyHint="done"
                className="h-14 min-w-0 flex-1 rounded-2xl border border-line bg-surface px-4 text-center text-[22px] focus:border-accent/60 focus:outline-none"
              />
              <Button variant="primary" size="lg" type="submit">
                {result === false ? t.common.next : t.common.check}
              </Button>
            </form>
          ) : (
            <>
            {result === false && (
              <Button variant="primary" size="lg" className="mb-3 w-full" onClick={() => setPos((p) => p + 1)}>
                {t.common.next}
              </Button>
            )}
            <div className="grid grid-cols-2 gap-2.5">
              {(q.options ?? []).map((o) => {
                const right = result !== null && o === char
                return (
                  <button
                    key={o}
                    lang="ja"
                    onClick={() => (result === false ? setPos((p) => p + 1) : answer(o === char || toKatakana(o) === toKatakana(char)))}
                    className={`h-20 rounded-2xl border text-[34px] transition active:scale-95 ${right ? 'border-good bg-good/15' : 'border-line bg-surface'}`}
                  >
                    {o}
                  </button>
                )
              })}
            </div>
            </>
          )}
        </div>
      </div>
    </FocusLayout>
  )
}

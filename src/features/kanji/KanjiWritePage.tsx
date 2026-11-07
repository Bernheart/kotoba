import { useState } from 'react'
import { useLocation, useParams } from 'wouter'
import { FocusLayout } from '../../components/Page'
import { Button, Segmented } from '../../components/ui'
import { useLang, useT } from '../../lib/i18n'
import { KANJI, KANJI_BY_CHAR, kanjiKey, kanjiMeaning, recordKanji } from '../../lib/kanji'
import { DrawCheck, FreeDraw, StrokeAnimation } from './StrokeCanvas'

type Mode = 'check' | 'free' | 'watch'
const MODE_KEY = 'kotoba.kanjiWriteMode'

function decode(s: string) {
  try {
    return decodeURIComponent(s)
  } catch {
    return s
  }
}

/** Writing practice for one kanji: draw-and-check, free draw with self-grade, or watch the stroke order. */
export function KanjiWritePage() {
  const t = useT()
  const lang = useLang()
  const [, navigate] = useLocation()
  const params = useParams<{ ch: string }>()
  const k = KANJI_BY_CHAR.get(decode(params.ch ?? ''))
  const [mode, setModeState] = useState<Mode>(() => {
    try {
      const m = localStorage.getItem(MODE_KEY)
      return m === 'free' || m === 'watch' ? m : 'check'
    } catch {
      return 'check'
    }
  })
  const [round, setRound] = useState(0)
  const [finished, setFinished] = useState(false)
  const setMode = (m: Mode) => {
    setModeState(m)
    setFinished(false)
    setRound((r) => r + 1)
    try {
      localStorage.setItem(MODE_KEY, m)
    } catch {
      /* ignore */
    }
  }

  if (!k)
    return (
      <FocusLayout onExit={() => navigate('/kanji?')}>
        <p className="pt-10 text-center text-muted">Not found.</p>
      </FocusLayout>
    )

  const next = KANJI[(KANJI.indexOf(k) + 1) % KANJI.length]!
  const done = (ok: boolean) => {
    setFinished(true)
    void recordKanji(kanjiKey(k.kanji), ok, 'write')
  }

  return (
    <FocusLayout title={`${k.kanji} · ${kanjiMeaning(k, lang)}`} onExit={() => navigate(`/kanji?l=${k.lesson}&k=${encodeURIComponent(k.kanji)}`)}>
      <div className="mx-auto flex w-full max-w-sm flex-1 flex-col pt-2">
        <Segmented
          value={mode}
          onChange={setMode}
          options={[
            { value: 'check', label: t.kanji.modeCheck },
            { value: 'free', label: t.kanji.modeFree },
            { value: 'watch', label: t.kanji.modeWatch },
          ]}
        />
        <div className="mt-4 text-center text-[14px] text-muted">
          <span lang="ja">{[...k.on, ...k.kun].join('・')}</span> · {t.kanji.strokes(k.strokes)}
        </div>
        <div className="mt-3">
          {mode === 'check' && <DrawCheck key={`${k.kanji}-${round}`} kanji={k.kanji} onDone={(misses) => done(misses === 0)} />}
          {mode === 'free' && <FreeDraw key={`${k.kanji}-${round}`} kanji={k.kanji} onGrade={done} />}
          {mode === 'watch' && (
            <>
              <StrokeAnimation kanji={k.kanji} run={round} />
              <Button className="mt-3 w-full" onClick={() => setRound((r) => r + 1)}>
                ↻ {t.kanji.replay}
              </Button>
            </>
          )}
        </div>
        {(finished || mode === 'watch') && (
          <div className="mt-auto grid grid-cols-2 gap-2 pt-6">
            <Button
              onClick={() => {
                setFinished(false)
                setRound((r) => r + 1)
              }}
            >
              {t.kanji.again}
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                setFinished(false)
                setRound((r) => r + 1)
                navigate(`/kanji/write/${encodeURIComponent(next.kanji)}`, { replace: true })
              }}
            >
              {t.kanji.nextKanji} <span lang="ja">{next.kanji}</span>
            </Button>
          </div>
        )}
      </div>
    </FocusLayout>
  )
}

import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'wouter'
import { SentenceJP } from '../../components/Furigana'
import { IconMic, IconSpeaker } from '../../components/icons'
import { FocusLayout } from '../../components/Page'
import { useSpeak } from '../../components/SpeakButton'
import { Button, ProgressBar, Segmented } from '../../components/ui'
import { exampleTranslation, useLang, useT } from '../../lib/i18n'
import { stripMarkup } from '../../lib/jp/markup'
import { logPractice, shuffle } from '../../lib/srs/queue'
import type { VocabEntry } from '../../lib/vocab'
import { useVocab } from '../../lib/vocab-context'
import { SessionDone } from '../review/SessionDone'
import { PracticeSetup } from './PracticeSetup'

type Step = 1 | 2 | 3

/**
 * Shadowing in three steps — understand first, then shadow with text, then without
 * (shadowing helps most once the content is understood; Hamada 2016). Optional recording to compare.
 */
export function ShadowingPage() {
  const t = useT()
  const [, navigate] = useLocation()
  const { words } = useVocab()
  const [items, setItems] = useState<VocabEntry[] | null>(null)
  const [pos, setPos] = useState(0)

  if (!items)
    return (
      <PracticeSetup
        title={t.study.shadowing}
        description={t.study.shadowingDesc}
        counts={[5, 10, 15]}
        onStart={(v) => {
          setPos(0)
          setItems(shuffle(words.filter((w) => v.lessons.includes(w.genkiLesson) && w.example && stripMarkup(w.example.ja).length >= 6)).slice(0, v.count))
        }}
      />
    )

  const w = items[pos]
  if (!w)
    return (
      <FocusLayout title={t.study.shadowing} onExit={() => navigate('/study')}>
        <SessionDone stats={[{ label: t.study.count, value: items.length }, { label: '', value: '🗣' }, { label: '', value: '✓' }]}>
          <Button variant="primary" size="lg" onClick={() => setItems(null)}>
            {t.study.again}
          </Button>
          <Button onClick={() => navigate('/study')}>{t.common.done}</Button>
        </SessionDone>
      </FocusLayout>
    )

  return (
    <FocusLayout onExit={() => navigate('/study')} progress={<ProgressBar value={pos / items.length} />}>
      <ShadowItem key={w.id} word={w} onNext={() => setPos((p) => p + 1)} />
    </FocusLayout>
  )
}

function ShadowItem({ word, onNext }: { word: VocabEntry; onNext: () => void }) {
  const t = useT()
  const lang = useLang()
  const say = useSpeak()
  const [step, setStep] = useState<Step>(1)
  const [playing, setPlaying] = useState(false)
  const [rec, setRec] = useState<{ state: 'idle' | 'recording' | 'ready' | 'denied'; url?: string }>({ state: 'idle' })
  const recorder = useRef<MediaRecorder | null>(null)
  const started = useRef(Date.now())
  const text = stripMarkup(word.example!.ja)

  useEffect(
    () => () => {
      if (rec.url) URL.revokeObjectURL(rec.url)
    },
    [rec.url],
  )

  const play = (rate?: number) => {
    setPlaying(true)
    void say(text, rate, () => setPlaying(false))
  }

  const record = async () => {
    if (rec.state === 'recording') {
      recorder.current?.stop()
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mr = new MediaRecorder(stream)
      const chunks: Blob[] = []
      mr.ondataavailable = (e) => chunks.push(e.data)
      mr.onstop = () => {
        stream.getTracks().forEach((tr) => tr.stop())
        const blob = new Blob(chunks, { type: mr.mimeType || 'audio/mp4' })
        setRec({ state: 'ready', url: URL.createObjectURL(blob) })
      }
      recorder.current = mr
      mr.start()
      setRec({ state: 'recording' })
      // speak along: start the model sentence right away
      play()
    } catch {
      setRec({ state: 'denied' })
    }
  }

  const playMine = () => {
    if (!rec.url) return
    void new Audio(rec.url).play()
  }

  const compare = () => {
    setPlaying(true)
    void say(text, undefined, () => {
      setPlaying(false)
      playMine()
    })
  }

  const finish = (ok: boolean) => {
    void logPractice(word.id, 'shadowing', ok, Date.now() - started.current)
    onNext()
  }

  return (
    <div className="flex flex-1 flex-col pt-3">
      <Segmented
        value={step}
        onChange={setStep}
        options={[
          { value: 1, label: '1' },
          { value: 2, label: '2' },
          { value: 3, label: '3' },
        ]}
      />
      <p className="mt-3 text-[14px] font-semibold text-muted">{step === 1 ? t.shadow.step1 : step === 2 ? t.shadow.step2 : t.shadow.step3}</p>

      <div className="card-face mt-3 flex min-h-[220px] flex-col justify-center rounded-[28px] border border-line/70 p-5">
        {step < 3 ? (
          <>
            <SentenceJP markup={word.example!.ja} className="text-[24px] leading-[2.1]" />
            {step === 1 && <p className="mt-2 text-[15px] text-muted">{exampleTranslation(word.example!, lang)}</p>}
          </>
        ) : (
          <p className="text-center text-[15px] text-faint">🎧 …</p>
        )}
      </div>

      <div className="mt-5 flex items-center justify-center gap-3">
        <button
          onClick={() => play()}
          className={`grid h-20 w-20 place-items-center rounded-full bg-accent/15 text-accent ring-1 ring-accent/30 transition active:scale-95 ${playing ? 'ring-4' : ''}`}
          aria-label={t.common.play}
        >
          <IconSpeaker size={34} />
        </button>
        <Button size="sm" onClick={() => play(0.7)}>
          🐢 {t.shadow.slow}
        </Button>
      </div>

      {step > 1 && (
        <div className="mt-5 rounded-3xl bg-surface p-4">
          {rec.state === 'denied' ? (
            <p className="text-[14px] text-muted">{t.shadow.micDenied}</p>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <Button variant={rec.state === 'recording' ? 'danger' : 'secondary'} onClick={record}>
                <IconMic size={18} /> {rec.state === 'recording' ? t.shadow.stop : t.shadow.record}
              </Button>
              {rec.state === 'ready' && (
                <>
                  <Button size="sm" onClick={playMine}>
                    ▶ {t.shadow.playMine}
                  </Button>
                  <Button size="sm" onClick={compare}>
                    ⇄ {t.shadow.playBoth}
                  </Button>
                </>
              )}
            </div>
          )}
        </div>
      )}

      <div className="mt-auto pt-6">
        {step < 3 ? (
          <Button variant="primary" size="lg" className="w-full" onClick={() => setStep((s) => (s + 1) as Step)}>
            {t.common.next}
          </Button>
        ) : (
          <>
            <p className="mb-2 text-center text-[13px] text-faint">{t.shadow.rate}</p>
            <div className="grid grid-cols-3 gap-2">
              <Button onClick={() => finish(false)}>{t.review.again}</Button>
              <Button onClick={() => finish(true)}>{t.review.good}</Button>
              <Button variant="primary" onClick={() => finish(true)}>
                {t.review.easy}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

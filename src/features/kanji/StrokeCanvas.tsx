import { useEffect, useRef, useState, type PointerEvent as RPointerEvent, type ReactNode } from 'react'
import { Button } from '../../components/ui'
import { useT } from '../../lib/i18n'
import { checkStroke, resample, strokeFit, STROKE_BOX, STROKES, type Pt, type StrokeVerdict } from '../../lib/kanji'

const B = STROKE_BOX
const toPoints = (pts: Pt[]) => pts.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ')

/** Square drawing box with the practice-sheet guide cross. */
function Box({ children, className = '', ...rest }: { children: ReactNode; className?: string } & React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox={`0 0 ${B} ${B}`} className={`aspect-square w-full rounded-3xl border border-line bg-surface ${className}`} {...rest}>
      <g stroke="var(--k-line)" strokeWidth={0.5} strokeDasharray="2 2">
        <line x1={B / 2} y1={0} x2={B / 2} y2={B} />
        <line x1={0} y1={B / 2} x2={B} y2={B / 2} />
      </g>
      {children}
    </svg>
  )
}

/** Barely moved: a tap, not a stroke (short dots like the one in 六 are still longer). */
const isTap = (pts: Pt[]) => pts.slice(1).reduce((s, p, i) => s + Math.hypot(p[0] - pts[i]![0], p[1] - pts[i]![1]), 0) < 1.5

const strokeProps = { fill: 'none', strokeLinecap: 'round', strokeLinejoin: 'round' } as const

/** Stroke-order animation: strokes are drawn one after another. Change `run` to replay. */
export function StrokeAnimation({ kanji, run = 0, className = '', speed = 1 }: { kanji: string; run?: number; className?: string; speed?: number }) {
  const data = STROKES[kanji]
  if (!data) return null
  const per = 0.55 / speed
  return (
    <Box className={className} aria-label={kanji} role="img">
      <g {...strokeProps} stroke="var(--k-line)" strokeWidth={3.2}>
        {data.d.map((d, i) => (
          <path key={i} d={d} />
        ))}
      </g>
      <g key={run} {...strokeProps} stroke="var(--k-text)" strokeWidth={3.2}>
        {data.d.map((d, i) => (
          <path key={i} d={d} pathLength={1} className="kanji-stroke-anim" style={{ ['--delay' as string]: `${i * (per + 0.12)}s`, ['--dur' as string]: `${per}s` }} />
        ))}
      </g>
    </Box>
  )
}

/** Pointer drawing on the box (finger or mouse); reports each finished stroke in box coordinates. */
function useDrawing(onStroke: (pts: Pt[]) => void) {
  const [current, setCurrent] = useState<Pt[] | null>(null)
  const ref = useRef<SVGSVGElement>(null)
  const pts = useRef<Pt[]>([])
  const at = (e: RPointerEvent): Pt => {
    const r = ref.current!.getBoundingClientRect()
    return [((e.clientX - r.left) / r.width) * B, ((e.clientY - r.top) / r.height) * B]
  }
  // iOS: stop the page from scrolling or zooming under a finger that is drawing. React registers touch
  // listeners as passive (they can't preventDefault), and touch-action alone isn't honoured on inline SVG.
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const stop = (e: TouchEvent) => e.cancelable && e.preventDefault()
    el.addEventListener('touchstart', stop, { passive: false })
    el.addEventListener('touchmove', stop, { passive: false })
    return () => {
      el.removeEventListener('touchstart', stop)
      el.removeEventListener('touchmove', stop)
    }
  }, [])
  const handlers = {
    onPointerDown: (e: RPointerEvent<SVGSVGElement>) => {
      e.preventDefault()
      e.currentTarget.setPointerCapture?.(e.pointerId)
      pts.current = [at(e)]
      setCurrent(pts.current)
    },
    onPointerMove: (e: RPointerEvent<SVGSVGElement>) => {
      if (!pts.current.length) return
      pts.current = [...pts.current, at(e)]
      setCurrent(pts.current)
    },
    onPointerUp: () => {
      const done = pts.current
      pts.current = []
      setCurrent(null)
      if (done.length) onStroke(done)
    },
  }
  // The browser cancelled the touch (e.g. it started scrolling): drop the half-drawn stroke instead of judging it.
  const onPointerCancel = () => {
    pts.current = []
    setCurrent(null)
  }
  return { ref, current, handlers: { ...handlers, onPointerCancel } }
}

/**
 * Draw-and-check: draw each stroke in order; a stroke in the wrong direction/order/shape is rejected
 * and the correct one is animated. `onDone(misses)` fires after the last stroke.
 */
export function DrawCheck({ kanji, onDone }: { kanji: string; onDone: (misses: number) => void }) {
  const t = useT()
  const data = STROKES[kanji]!
  const [idx, setIdx] = useState(0)
  const [misses, setMisses] = useState(0)
  const [hint, setHint] = useState<{ stroke: number; n: number } | null>(null)
  const [verdict, setVerdict] = useState<StrokeVerdict | null>(null)
  const [trace, setTrace] = useState(false)
  const [miss, setMiss] = useState<Pt[] | null>(null)
  // accepted strokes, used to learn how big and where the learner writes
  const accepted = useRef<{ drawn: Pt[]; model: Pt[] }[]>([])
  const done = idx >= data.d.length

  const { ref, current, handlers } = useDrawing((pts) => {
    if (done || isTap(pts)) return // a stray tap is not an attempt
    const v = checkStroke(pts, idx, data.pts, strokeFit(accepted.current, pts, data.pts[idx]!))
    setVerdict(v)
    if (v === 'ok') {
      accepted.current.push({ drawn: resample(pts, data.pts[idx]!.length), model: data.pts[idx]! })
      setMiss(null)
      setHint(null)
      const next = idx + 1
      setIdx(next)
      if (next >= data.d.length) onDone(misses)
    } else {
      setMiss(pts)
      setMisses((m) => m + 1)
      setHint((h) => ({ stroke: idx, n: (h?.n ?? 0) + 1 }))
    }
  })

  const message =
    verdict === null || done
      ? done
        ? t.kanji.allDone(misses)
        : t.kanji.drawHere.replace('{n}', String(idx + 1)).replace('{total}', String(data.d.length))
      : verdict === 'ok'
        ? `✓ ${t.kanji.strokeOk}`
        : verdict === 'direction'
          ? t.kanji.wrongDirection
          : verdict === 'order'
            ? t.kanji.wrongOrder
            : t.kanji.wrongShape

  return (
    <div>
      <Box ref={ref} data-testid="stroke-canvas" className="touch-none select-none" style={{ touchAction: 'none' }} {...handlers}>
        {trace && (
          <g {...strokeProps} stroke="var(--k-line)" strokeWidth={3.2}>
            {data.d.map((d, i) => (
              <path key={i} d={d} />
            ))}
          </g>
        )}
        <g {...strokeProps} stroke="var(--k-text)" strokeWidth={3.6}>
          {data.d.slice(0, idx).map((d, i) => (
            <path key={i} d={d} />
          ))}
        </g>
        {miss && <polyline points={toPoints(miss)} {...strokeProps} stroke="var(--k-accent)" strokeOpacity={0.35} strokeWidth={3.6} />}
        {hint && !done && (
          <path
            key={`${hint.stroke}-${hint.n}`}
            data-testid="stroke-hint"
            d={data.d[hint.stroke]}
            pathLength={1}
            className="kanji-stroke-anim"
            {...strokeProps}
            stroke="var(--k-good)"
            strokeWidth={3.6}
          />
        )}
        {current && <polyline points={toPoints(current)} {...strokeProps} stroke="var(--k-text)" strokeWidth={3.6} />}
      </Box>
      <p
        data-testid="stroke-status"
        role="status"
        className={`mt-3 min-h-6 text-center text-[15px] ${verdict && verdict !== 'ok' && !done ? 'text-accent' : done || verdict === 'ok' ? 'text-good' : 'text-muted'}`}
      >
        {message}
      </p>
      <div className="mt-2 flex justify-center">
        <button className="text-[13px] text-muted underline-offset-4 hover:underline" aria-pressed={trace} onClick={() => setTrace((x) => !x)}>
          {trace ? '✓ ' : ''}
          {t.kanji.trace}
        </button>
      </div>
    </div>
  )
}

/** Free draw: draw from memory, compare with the model, then grade yourself. */
export function FreeDraw({ kanji, onGrade }: { kanji: string; onGrade: (ok: boolean) => void }) {
  const t = useT()
  const data = STROKES[kanji]!
  const [lines, setLines] = useState<Pt[][]>([])
  const [shown, setShown] = useState(false)
  const [graded, setGraded] = useState<boolean | null>(null)
  const { ref, current, handlers } = useDrawing((pts) => !shown && setLines((l) => [...l, pts]))
  return (
    <div>
      <Box ref={ref} data-testid="free-canvas" className="touch-none select-none" style={{ touchAction: 'none' }} {...handlers}>
        {shown && (
          <g {...strokeProps} stroke="var(--k-good)" strokeOpacity={0.55} strokeWidth={4.5}>
            {data.d.map((d, i) => (
              <path key={i} d={d} pathLength={1} className="kanji-stroke-anim" style={{ ['--delay' as string]: `${i * 0.3}s`, ['--dur' as string]: '0.3s' }} />
            ))}
          </g>
        )}
        <g {...strokeProps} stroke="var(--k-text)" strokeWidth={3.6}>
          {lines.map((l, i) => (
            <polyline key={i} points={toPoints(l)} />
          ))}
          {current && <polyline points={toPoints(current)} />}
        </g>
      </Box>
      <p className="mt-3 text-center text-[14px] text-muted">{t.kanji.freeHint}</p>
      <div className="mt-3 flex flex-wrap justify-center gap-2">
        {!shown ? (
          <>
            <Button onClick={() => setLines([])} disabled={!lines.length}>
              {t.kanji.clear}
            </Button>
            <Button variant="primary" onClick={() => setShown(true)} disabled={!lines.length}>
              {t.kanji.showModel}
            </Button>
          </>
        ) : graded === null ? (
          <>
            <Button
              variant="primary"
              onClick={() => {
                setGraded(true)
                onGrade(true)
              }}
            >
              ✓ {t.kanji.gotIt}
            </Button>
            <Button
              onClick={() => {
                setGraded(false)
                onGrade(false)
              }}
            >
              ✗ {t.kanji.notYet}
            </Button>
          </>
        ) : (
          <p data-testid="free-graded" className={`text-[15px] ${graded ? 'text-good' : 'text-accent'}`}>
            {graded ? `✓ ${t.kanji.gotIt}` : `✗ ${t.kanji.notYet}`}
          </p>
        )}
      </div>
    </div>
  )
}

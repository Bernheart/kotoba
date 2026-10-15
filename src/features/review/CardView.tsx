import { motion, useMotionValue, useTransform, animate, type PanInfo } from 'motion/react'
import type { ReactNode } from 'react'
import { Rating, type Grade } from 'ts-fsrs'
import { fitSize, SentenceJP, WordJP } from '../../components/Furigana'
import { SpeakButton, wordSpeech } from '../../components/SpeakButton'
import type { Verdict } from '../../lib/answer'
import { exampleTranslation, meaning, useLang, useT } from '../../lib/i18n'
import { stripMarkup } from '../../lib/jp/markup'
import type { Direction } from '../../lib/types'
import type { VocabEntry } from '../../lib/vocab'

const SWIPE = 110

export function CardView({
  word,
  dir,
  flipped,
  onFlip,
  onSwipe,
  badge,
  verdict,
}: {
  word: VocabEntry
  dir: Direction
  flipped: boolean
  onFlip: () => void
  onSwipe?: (r: Grade) => void
  badge?: ReactNode
  verdict?: { kind: Verdict; typed: string }
}) {
  const x = useMotionValue(0)
  const y = useMotionValue(0)
  const rotate = useTransform(x, [-240, 240], [-12, 12])
  const goodOp = useTransform(x, [30, SWIPE], [0, 1])
  const againOp = useTransform(x, [-SWIPE, -30], [1, 0])
  const easyOp = useTransform(y, [-SWIPE, -30], [1, 0])
  const canSwipe = flipped && !!onSwipe

  const onDragEnd = (_: unknown, info: PanInfo) => {
    const { offset, velocity } = info
    let r: Grade | null = null
    if (offset.x > SWIPE || velocity.x > 800) r = Rating.Good
    else if (offset.x < -SWIPE || velocity.x < -800) r = Rating.Again
    else if (offset.y < -SWIPE || velocity.y < -800) r = Rating.Easy
    if (r && onSwipe) {
      const tx = r === Rating.Good ? 520 : r === Rating.Again ? -520 : 0
      const ty = r === Rating.Easy ? -700 : 0
      void animate(x, tx, { duration: 0.22 })
      void animate(y, ty, { duration: 0.22 }).then(() => {
        onSwipe(r!)
        x.set(0)
        y.set(0)
      })
    } else {
      void animate(x, 0, { type: 'spring', stiffness: 500, damping: 35 })
      void animate(y, 0, { type: 'spring', stiffness: 500, damping: 35 })
    }
  }

  return (
    <motion.div
      className="relative min-h-[340px] flex-1 [perspective:1600px]"
      style={{ x, y, rotate, touchAction: canSwipe ? 'none' : 'manipulation' }}
      drag={canSwipe}
      dragElastic={0.9}
      dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
      onDragEnd={onDragEnd}
    >
      <motion.div
        className="absolute inset-0"
        style={{ transformStyle: 'preserve-3d' }}
        initial={false}
        animate={{ rotateY: flipped ? 180 : 0 }}
        transition={{ type: 'spring', stiffness: 260, damping: 26 }}
      >
        {/* front */}
        <Face onClick={flipped ? undefined : onFlip} aria-hidden={flipped}>
          {badge}
          <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
            {dir === 'recog' ? <Prompt word={word} /> : <MeaningPrompt word={word} />}
          </div>
          {dir === 'recog' && (
            <div className="flex justify-center pb-6" onClick={(e) => e.stopPropagation()}>
              <SpeakButton text={wordSpeech(word)} />
            </div>
          )}
        </Face>
        {/* back */}
        <Face back aria-hidden={!flipped}>
          <Answer word={word} dir={dir} verdict={verdict} />
        </Face>
      </motion.div>
      {canSwipe && (
        <>
          <SwipeLabel opacity={goodOp} className="right-5 border-good text-good">
            ✓
          </SwipeLabel>
          <SwipeLabel opacity={againOp} className="left-5 border-accent text-accent">
            ↺
          </SwipeLabel>
          <SwipeLabel opacity={easyOp} className="left-1/2 -translate-x-1/2 border-easy text-easy">
            ↑
          </SwipeLabel>
        </>
      )}
    </motion.div>
  )
}

function SwipeLabel({ opacity, className, children }: { opacity: ReturnType<typeof useTransform<number, number>>; className: string; children: ReactNode }) {
  return (
    <motion.div style={{ opacity }} className={`pointer-events-none absolute top-5 z-10 grid h-12 w-12 place-items-center rounded-full border-2 bg-bg/70 text-[22px] font-bold ${className}`}>
      {children}
    </motion.div>
  )
}

function Face({ back, children, onClick, ...rest }: { back?: boolean; children: ReactNode; onClick?: () => void; 'aria-hidden'?: boolean }) {
  return (
    <div
      className={`card-face absolute inset-0 flex flex-col overflow-hidden rounded-[32px] border border-line/70 ${onClick ? 'cursor-pointer' : ''}`}
      style={{ backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden', transform: back ? 'rotateY(180deg)' : undefined }}
      onClick={onClick}
      {...rest}
    >
      {children}
    </div>
  )
}

function Prompt({ word }: { word: VocabEntry }) {
  return (
    <div style={{ fontSize: fitSize(word.japanese, 88, 300) }}>
      <WordJP word={word} className="jp-serif ruby-display font-medium" />
    </div>
  )
}

function MeaningPrompt({ word }: { word: VocabEntry }) {
  const lang = useLang()
  const t = useT()
  const m = meaning(word, lang)
  return (
    <div>
      <p className={`${m.length > 40 ? 'text-[24px]' : 'text-[32px]'} leading-tight font-semibold`}>{m}</p>
      <p className="mt-3 text-[14px] text-faint">
        {t.types[word.type]}
        {word.example ? '' : ''}
      </p>
    </div>
  )
}

function Answer({ word, dir, verdict }: { word: VocabEntry; dir: Direction; verdict?: { kind: Verdict; typed: string } }) {
  const lang = useLang()
  const t = useT()
  const primary = meaning(word, lang)
  const other = lang === 'pl' ? word.en : word.pl
  return (
    <div className="flex h-full flex-col overflow-y-auto overscroll-contain px-6 pt-6 pb-5">
      {verdict && (
        <div
          className={`mb-4 rounded-2xl px-4 py-2.5 text-[15px] ${
            verdict.kind === 'correct' ? 'bg-good/15 text-good' : verdict.kind === 'almost' ? 'bg-warn/15 text-warn' : 'bg-accent/15 text-accent'
          }`}
        >
          {verdict.kind === 'correct' ? t.common.correct : verdict.kind === 'almost' ? t.common.almost : t.common.incorrect}
          {verdict.typed && (
            <span className="ml-2 text-muted">
              — <span lang={dir === 'recall' ? 'ja' : undefined}>{verdict.typed}</span>
            </span>
          )}
        </div>
      )}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0" style={{ fontSize: fitSize(word.japanese, 60, 250) }}>
          <WordJP word={word} className="jp-serif ruby-display" />
        </div>
        <div onClick={(e) => e.stopPropagation()} className="pt-2">
          <SpeakButton text={wordSpeech(word)} />
        </div>
      </div>
      <p className="mt-1 text-[13px] tracking-wide text-faint">{word.romaji}</p>
      <p className="mt-3 text-[22px] leading-snug font-medium">{primary}</p>
      {other && other !== primary && <p className="mt-0.5 text-[15px] text-muted">{other}</p>}
      <p className="mt-2 text-[12px] text-faint">
        {t.types[word.type]} · {t.common.lesson(word.genkiLesson)}
      </p>
      {word.mnemonic && (
        <p className="mt-3 rounded-2xl border border-warn/30 bg-warn/10 px-3.5 py-2 text-[14px] text-warn">💡 {word.mnemonic}</p>
      )}
      {word.example && (
        <div className="mt-auto pt-5">
          <div className="flex items-start gap-2 border-t border-line/60 pt-4">
            <div className="min-w-0 flex-1">
              <SentenceJP markup={word.example.ja} highlight className="text-[18px] leading-[2]" />
              <p className="mt-0.5 text-[14px] text-muted">{exampleTranslation(word.example, lang)}</p>
            </div>
            <div onClick={(e) => e.stopPropagation()}>
              <SpeakButton text={stripMarkup(word.example.ja)} size="sm" />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

import { motion } from 'motion/react'
import { useMemo, useState } from 'react'
import { Ruby } from '../../components/Furigana'
import { Button } from '../../components/ui'
import { exampleTranslation, useLang, useT } from '../../lib/i18n'
import { parseMarkup, type Chunk } from '../../lib/jp/markup'
import { shuffle } from '../../lib/srs/queue'
import type { VocabEntry } from '../../lib/vocab'

/** Put the sentence tiles in order (tap to place, tap a placed tile to take it back). */
export function BuilderQuestion({ word, onAnswer, disabled }: { word: VocabEntry; onAnswer: (correct: boolean, typed: string) => void; disabled?: boolean }) {
  const t = useT()
  const lang = useLang()
  const sentence = useMemo(() => parseMarkup(word.example!.ja), [word])
  const tiles = useMemo(() => {
    const idx = sentence.chunks.map((_, i) => i)
    let s = shuffle([...idx])
    for (let i = 0; i < 5 && s.every((v, j) => v === j); i++) s = shuffle([...idx])
    return s
  }, [sentence])
  const [placed, setPlaced] = useState<number[]>([])
  const strip = (c: Chunk) => ({ ...c, segs: c.segs.map(({ target: _t, ...r }) => r) })
  const text = (i: number) => sentence.chunks[i]!.text
  const check = () => {
    const answer = placed.map(text).join('')
    onAnswer(answer === sentence.plain, answer)
  }
  return (
    <div className="flex flex-1 flex-col">
      <p className="text-[13px] text-faint">{t.builder.instruction}</p>
      <p className="mt-1 text-[18px] leading-snug">{exampleTranslation(word.example!, lang)}</p>
      <div className="mt-4 flex min-h-[112px] flex-wrap content-start gap-2 rounded-3xl border border-dashed border-line bg-bg-2/60 p-3">
        {placed.map((i) => (
          <motion.button
            layoutId={`tile-${i}`}
            key={i}
            disabled={disabled}
            onClick={() => setPlaced((p) => p.filter((x) => x !== i))}
            className="rounded-2xl border border-accent/40 bg-accent/10 px-3 py-1.5 text-[19px] leading-[1.9]"
          >
            <Ruby segs={strip(sentence.chunks[i]!).segs} />
          </motion.button>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {tiles
          .filter((i) => !placed.includes(i))
          .map((i) => (
            <motion.button
              layoutId={`tile-${i}`}
              key={i}
              disabled={disabled}
              onClick={() => setPlaced((p) => [...p, i])}
              className="rounded-2xl border border-line bg-surface px-3 py-1.5 text-[19px] leading-[1.9] active:scale-95"
            >
              <Ruby segs={strip(sentence.chunks[i]!).segs} />
            </motion.button>
          ))}
      </div>
      <div className="mt-auto flex gap-2 pt-6">
        <Button variant="ghost" onClick={() => setPlaced([])} disabled={disabled || !placed.length}>
          {t.builder.reset}
        </Button>
        <Button variant="primary" size="lg" className="flex-1" disabled={disabled || placed.length !== sentence.chunks.length} onClick={check}>
          {t.common.check}
        </Button>
      </div>
    </div>
  )
}

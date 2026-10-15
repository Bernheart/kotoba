import { Fragment, useMemo, useState, type ReactNode } from 'react'
import { alignFurigana, type Seg } from '../lib/jp/furigana'
import { parseMarkup } from '../lib/jp/markup'
import type { Word } from '../lib/types'

export function Ruby({ segs, className, blank }: { segs: Seg[]; className?: string; blank?: ReactNode }) {
  const [peek, setPeek] = useState(false)
  let blanked = false
  return (
    <span
      lang="ja"
      className={`${className ?? ''} ${peek ? 'peek' : ''}`}
      onClick={() => setPeek((p) => !p)}
    >
      {segs.map((s, i) => {
        if (blank !== undefined && s.target) {
          if (blanked) return null
          blanked = true
          return <Fragment key={i}>{blank}</Fragment>
        }
        const inner = s.reading ? (
          <ruby>
            {s.text}
            <rt>{s.reading}</rt>
          </ruby>
        ) : (
          s.text
        )
        return s.target && blank === undefined ? (
          <mark key={i} className="rounded-sm bg-transparent text-accent">
            {inner}
          </mark>
        ) : (
          <Fragment key={i}>{inner}</Fragment>
        )
      })}
    </span>
  )
}

export function wordSegs(w: Pick<Word, 'japanese' | 'kana' | 'furigana'>): Seg[] {
  return w.furigana ? parseMarkup(w.furigana).segs : alignFurigana(w.japanese, w.kana)
}

/** A vocabulary word with furigana over its kanji. */
export function WordJP({ word, className }: { word: Pick<Word, 'japanese' | 'kana' | 'furigana'>; className?: string }) {
  const segs = useMemo(() => wordSegs(word), [word])
  return <Ruby segs={segs} className={className} />
}

/** An example sentence; `highlight` colours the target word, `blank` replaces it (cloze). */
export function SentenceJP({
  markup,
  className,
  highlight = false,
  blank,
}: {
  markup: string
  className?: string
  highlight?: boolean
  blank?: ReactNode
}) {
  const segs = useMemo(() => {
    const s = parseMarkup(markup).segs
    return highlight || blank !== undefined ? s : s.map(({ target: _t, ...rest }) => rest)
  }, [markup, highlight, blank])
  return <Ruby segs={segs} className={className} blank={blank} />
}

/** Font size (px) that keeps a word on one line in a box roughly `width` px wide. */
export function fitSize(text: string, max: number, width = 300): number {
  const n = Math.max(1, [...text].length)
  return Math.min(max, (width / n) * 0.94)
}

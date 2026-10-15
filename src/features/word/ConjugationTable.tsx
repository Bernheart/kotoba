import { useState } from 'react'
import { Ruby } from '../../components/Furigana'
import { IconChevron } from '../../components/icons'
import { useT } from '../../lib/i18n'
import { conjugate, FORM_LESSON, formsFor, type Form } from '../../lib/jp/conjugate'
import { alignFurigana } from '../../lib/jp/furigana'
import type { Word } from '../../lib/types'

export function formLabel(t: ReturnType<typeof useT>, f: Form): string {
  return (t.conj as unknown as Record<string, string>)[f] ?? f
}

export function ConjugationTable({ word }: { word: Pick<Word, 'japanese' | 'kana' | 'type'> }) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const forms = formsFor(word.type)
  if (!forms.length) return null
  return (
    <section className="mt-5">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between rounded-2xl px-1 py-2 text-[13px] font-semibold text-muted"
        aria-expanded={open}
      >
        {t.word.conjugations}
        <IconChevron size={18} className={`transition-transform ${open ? 'rotate-90' : ''}`} />
      </button>
      {open && (
        <div className="overflow-hidden rounded-2xl border border-line/70">
          {forms.map((f, i) => {
            const c = conjugate(word, f)
            if (!c) return null
            return (
              <div key={f} className={`flex items-center justify-between gap-3 px-3.5 py-2 ${i % 2 ? 'bg-bg-2/60' : ''}`}>
                <span className="min-w-0 text-[12px] leading-tight text-muted">
                  {formLabel(t, f)} <span className="text-faint">· L{FORM_LESSON[f]}</span>
                </span>
                <Ruby segs={alignFurigana(c.japanese, c.kana)} className="shrink-0 text-right text-[16px] leading-[1.9] whitespace-nowrap" />
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}

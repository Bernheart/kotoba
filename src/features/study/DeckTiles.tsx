import { Link } from 'wouter'
import { deckLabel } from '../../lib/decks'
import { useT } from '../../lib/i18n'
import { useDeckStats } from '../../lib/stats'
import { useVocab } from '../../lib/vocab-context'

/** One tile per custom deck: due + new counts, opens the deck's own review queue. */
export function DeckTiles({ className = '' }: { className?: string }) {
  const t = useT()
  const { words } = useVocab()
  const decks = useDeckStats(words)
  if (!decks?.length) return null
  return (
    <div className={`grid gap-2.5 sm:grid-cols-2 ${className}`}>
      {decks.map((d) => {
        const badge = d.due + d.newAvailable
        return (
          <Link
            key={d.deck}
            href={`/review?deck=${d.deck}`}
            className="group relative flex gap-3.5 overflow-hidden rounded-3xl border border-line/70 bg-surface p-4 transition active:scale-[0.98] hover:border-line"
          >
            <span lang="ja" className="jp-serif grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-bg-2 text-[26px] text-accent">
              集
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2 text-[16px] font-semibold">
                {deckLabel(d.deck)}
                {badge > 0 && <span className="rounded-full bg-accent px-2 py-0.5 text-[12px] font-bold text-accent-ink tabular-nums">{badge}</span>}
              </span>
              <span className="mt-0.5 block text-[13px] leading-snug text-muted">{t.study.deckDesc(d.due, d.newAvailable)}</span>
              <span className="mt-2 block h-1 overflow-hidden rounded-full bg-line/60">
                <span className="block h-full rounded-full bg-good" style={{ width: `${(d.started / Math.max(1, d.total)) * 100}%` }} />
              </span>
              <span className="mt-1 block text-[12px] text-faint">
                {d.started} / {t.common.words(d.total)}
              </span>
            </span>
          </Link>
        )
      })}
    </div>
  )
}

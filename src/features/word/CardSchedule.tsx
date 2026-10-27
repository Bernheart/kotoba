import { useMemo } from 'react'
import type { Grade } from 'ts-fsrs'
import type { CardRow, ReviewLogRow } from '../../lib/db'
import { relativeDay, shortInterval, useLang, useT } from '../../lib/i18n'
import { useSettings } from '../../lib/settings'
import { newCardRow, State } from '../../lib/srs/fsrs'
import { nextRow } from '../../lib/srs/schedule'
import type { Direction } from '../../lib/types'

const DIRS: Direction[] = ['recog', 'recall']
const RATING_CLS: Record<number, string> = { 1: 'text-accent', 2: 'text-warn', 3: 'text-good', 4: 'text-easy' }

/**
 * Both cards of a word (JP → meaning, meaning → JP): when each is due next, and every answer with the
 * interval it produced (replayed with the current scheduler) — so the timings can be checked by eye.
 */
export function CardSchedule({ wordId, cards, logs }: { wordId: string; cards: CardRow[]; logs: ReviewLogRow[] }) {
  const t = useT()
  const lang = useLang()
  const s = useSettings()
  const date = (ms: number) => new Date(ms).toLocaleDateString(lang, { day: 'numeric', month: 'short' })
  const ratingLabel = (r: number) => [t.review.again, t.review.hard, t.review.good, t.review.easy][r - 1] ?? '?'

  const history = useMemo(() => {
    const out: { at: number; dir: Direction; rating: number; gave: string }[] = []
    for (const dir of DIRS) {
      const answers = logs.filter((l) => l.scheduled && !l.deleted && l.cardId.endsWith(`:${dir}`)).sort((a, b) => a.at - b.at)
      let row = newCardRow(wordId, dir, answers[0]?.at ?? 0)
      for (const l of answers) {
        row = nextRow(row, l.rating as Grade, l.at, s)
        out.push({ at: l.at, dir, rating: l.rating, gave: row.state === State.Review ? t.common.days(row.scheduled_days) : shortInterval(row.due - l.at) })
      }
    }
    return out.sort((a, b) => b.at - a.at).slice(0, 12)
    // the schedule depends only on the answers and the chosen algorithm
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logs, wordId, s.scheduler, s.retention, lang])

  const recog = cards.find((c) => c.dir === 'recog' && !c.deleted)
  const status = (dir: Direction) => {
    const c = cards.find((x) => x.dir === dir && !x.deleted)
    if (dir === 'recall' && !s.recallCards) return t.settings.recallOff
    if (!c || c.state === State.New) {
      const waiting = dir === 'recall' && (!recog || recog.state !== State.Review || recog.scheduled_days < s.recallAfterDays)
      return waiting ? t.word.stateLocked(Math.max(1, s.recallAfterDays)) : t.word.stateNew
    }
    if (c.state !== State.Review) return `${t.word.stateLearning} · ${t.word.nextOn(relativeDay(c.due, lang))}`
    return [
      t.word.every(t.common.days(c.scheduled_days)),
      t.word.nextOn(`${date(c.due)} (${relativeDay(c.due, lang)})`),
      c.ease ? t.word.ease(Math.round(c.ease * 100)) : '',
    ]
      .filter(Boolean)
      .join(' · ')
  }

  return (
    <section className="mt-5">
      <h3 className="mb-2 text-[13px] font-semibold text-muted">{t.word.schedule}</h3>
      <div className="space-y-1.5 rounded-2xl bg-bg-2 px-3.5 py-3 text-[14px]">
        {DIRS.map((dir) => (
          <div key={dir} className="flex flex-wrap items-baseline gap-x-2">
            <span className={`shrink-0 text-[12px] font-semibold ${dir === 'recog' ? 'text-easy' : 'text-accent'}`}>
              {dir === 'recog' ? t.word.dirRecog : t.word.dirRecall}
            </span>
            <span className="text-muted">{status(dir)}</span>
          </div>
        ))}
      </div>
      {history.length > 0 && (
        <>
          <h3 className="mt-4 mb-2 text-[13px] font-semibold text-muted">{t.word.history}</h3>
          <ul className="divide-y divide-line/40 rounded-2xl bg-bg-2 px-3.5 text-[13px]">
            {history.map((h) => (
              <li key={`${h.dir}-${h.at}`} className="flex items-center gap-2 py-2">
                <span className="w-14 shrink-0 text-faint tabular-nums">{date(h.at)}</span>
                <span className={`w-24 shrink-0 ${h.dir === 'recog' ? 'text-easy' : 'text-accent'}`}>{h.dir === 'recog' ? t.word.dirRecog : t.word.dirRecall}</span>
                <span className={`font-semibold ${RATING_CLS[h.rating] ?? ''}`}>{ratingLabel(h.rating)}</span>
                <span className="ml-auto text-muted tabular-nums">{t.word.gave(h.gave)}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}

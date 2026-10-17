import { useMemo, useState, type ReactNode } from 'react'
import { IconFlame } from '../../components/icons'
import { Page } from '../../components/Page'
import { Card, SectionTitle } from '../../components/ui'
import type { StudyMode } from '../../lib/db'
import { deckLabel } from '../../lib/decks'
import { useLang, useT } from '../../lib/i18n'
import { useSettings } from '../../lib/settings'
import { useDashboard, type Bucket } from '../../lib/stats'
import { addDays, studyDay } from '../../lib/time'
import type { WordType } from '../../lib/types'
import { useVocab } from '../../lib/vocab-context'

/** Sequential single-hue ramp (wakatake green), dark → bright on dark surfaces; light mode inverts lightness. */
const HEAT_DARK = ['var(--k-line)', '#24493a', '#2e6b52', '#3f8f6c', '#62b98f']
const HEAT_LIGHT = ['var(--k-line)', '#cfe6d9', '#97cbb0', '#55a982', '#2c7f59']

export function StatsPage() {
  const t = useT()
  const { words } = useVocab()
  const d = useDashboard(words)
  const lang = useLang()

  if (!d) return <Page title={t.stats.title}>{null}</Page>
  const empty = d.total === 0
  return (
    <Page title={t.stats.title} wide>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <Tile
          label={t.stats.streak}
          value={
            <span className="inline-flex items-center gap-1.5">
              <IconFlame size={22} className={d.streak.current ? 'text-warn' : 'text-faint'} />
              {d.streak.current}
            </span>
          }
          sub={t.stats.longest(d.streak.longest)}
        />
        <Tile label={t.stats.learned} value={d.learned} sub={`${t.stats.mature}: ${d.mature}`} />
        <Tile label={t.stats.reviewsToday} value={d.answersToday} />
        <Tile
          label={t.stats.retention}
          value={d.retention30 === null ? '—' : `${Math.round(d.retention30 * 100)}%`}
          sub={d.retentionN ? `n = ${d.retentionN}` : undefined}
        />
      </div>

      {empty && <p className="mt-6 rounded-2xl bg-surface px-4 py-3 text-[14px] text-muted">{t.stats.noData}</p>}

      <section className="mt-8">
        <SectionTitle>{t.stats.heatmap}</SectionTitle>
        <Card className="p-4">
          <Heatmap perDay={d.perDay} lang={lang} />
        </Card>
      </section>

      <div className="mt-8 grid gap-8 lg:grid-cols-2">
        <section>
          <SectionTitle>{t.stats.forecast}</SectionTitle>
          <Card className="p-4">
            <Columns
              values={d.forecast.map((n, i) => ({ label: dayLabel(addDays(studyDay(), i + 1), lang), value: n }))}
              format={(n) => String(n)}
              caption={t.stats.forecast}
            />
          </Card>
        </section>
        <section>
          <SectionTitle>{t.stats.byLesson}</SectionTitle>
          <Card className="p-4">
            <Columns
              values={d.byLesson.map((b) => ({ label: b.key.startsWith('deck:') ? deckLabel(b.key.slice(5)) : b.key === '0' ? '—' : `L${b.key}`, value: b.correct / b.n, n: b.n }))}
              format={(v) => `${Math.round(v * 100)}%`}
              max={1}
              caption={t.stats.byLesson}
            />
          </Card>
        </section>
        <section>
          <SectionTitle>{t.stats.byType}</SectionTitle>
          <Card className="p-4">
            <Bars items={d.byType.filter((b) => b.n >= 3).sort((a, b) => a.correct / a.n - b.correct / b.n)} label={(k) => t.types[k as WordType] ?? k} caption={t.stats.byType} />
          </Card>
        </section>
        <section>
          <SectionTitle>{t.stats.modes}</SectionTitle>
          <Card className="p-4">
            <Bars items={d.byMode} label={(k) => modeLabel(t, k as StudyMode)} caption={t.stats.modes} showCount />
          </Card>
        </section>
      </div>
    </Page>
  )
}

function modeLabel(t: ReturnType<typeof useT>, m: StudyMode): string {
  const map: Record<StudyMode, string> = {
    review: t.study.flashcards,
    intro: t.review.newWord,
    mcq: t.study.mcq,
    typing: t.study.typing,
    listening: t.study.listening,
    cloze: t.study.cloze,
    builder: t.study.builder,
    matching: t.study.matching,
    shadowing: t.study.shadowing,
    conjugation: t.study.conjugation,
    kana: t.study.kana,
    session: t.today.fiveMin,
  }
  return map[m] ?? m
}

function dayLabel(day: string, lang: string) {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number]
  return new Date(y, m - 1, d).toLocaleDateString(lang, { weekday: 'short' })
}

function Tile({ label, value, sub }: { label: string; value: ReactNode; sub?: string }) {
  return (
    <Card className="px-4 py-3.5">
      <div className="text-[28px] leading-tight font-bold tabular-nums">{value}</div>
      <div className="mt-0.5 text-[13px] text-muted">{label}</div>
      {sub && <div className="text-[12px] text-faint">{sub}</div>}
    </Card>
  )
}

/** GitHub-style calendar of the last 26 weeks (Mon–Sun rows). Tap/hover a day for its count. */
function Heatmap({ perDay, lang }: { perDay: Map<string, number>; lang: string }) {
  const t = useT()
  useSettings() // re-render on theme change
  const ramp = document.documentElement.dataset.theme === 'light' ? HEAT_LIGHT : HEAT_DARK
  const [tip, setTip] = useState<{ day: string; n: number } | null>(null)
  const weeks = 26
  const today = studyDay()
  const { cols, months, max } = useMemo(() => {
    const [y, m, d] = today.split('-').map(Number) as [number, number, number]
    const dow = (new Date(y, m - 1, d).getDay() + 6) % 7
    const start = addDays(today, -(weeks - 1) * 7 - dow)
    const cols: { day: string; n: number; future: boolean }[][] = []
    const months: { col: number; label: string }[] = []
    let max = 0
    for (let w = 0; w < weeks; w++) {
      const col = []
      for (let i = 0; i < 7; i++) {
        const day = addDays(start, w * 7 + i)
        const n = perDay.get(day) ?? 0
        max = Math.max(max, n)
        col.push({ day, n, future: day > today })
        if (day.endsWith('-01')) {
          const [yy, mm] = day.split('-').map(Number) as [number, number]
          months.push({ col: w, label: new Date(yy, mm - 1, 1).toLocaleDateString(lang, { month: 'short' }) })
        }
      }
      cols.push(col)
    }
    // Label the partial first month only if the next month label is far enough away.
    if (!months.length || months[0]!.col >= 3) {
      const [yy, mm] = start.split('-').map(Number) as [number, number]
      months.unshift({ col: 0, label: new Date(yy, mm - 1, 1).toLocaleDateString(lang, { month: 'short' }) })
    }
    return { cols, months, max }
  }, [perDay, today, lang])
  const level = (n: number) => (n === 0 ? 0 : max <= 4 ? Math.min(4, n) : Math.min(4, Math.ceil((n / max) * 4)))
  return (
    <div>
      <div className="relative pt-5">
        <div className="grid gap-[3px]" style={{ gridTemplateColumns: `repeat(${weeks}, minmax(0, 1fr))` }}>
          {cols.map((col, w) => (
            <div key={w} className="relative grid gap-[3px]">
              {months.find((m) => m.col === w) && (
                <span className="absolute -top-5 left-0 text-[10px] whitespace-nowrap text-faint">{months.find((m) => m.col === w)!.label}</span>
              )}
              {col.map((c) => (
                <button
                  key={c.day}
                  aria-label={t.stats.reviewsOn(c.n, c.day)}
                  onMouseEnter={() => setTip(c)}
                  onFocus={() => setTip(c)}
                  onClick={() => setTip(c)}
                  className={`aspect-square w-full rounded-[3px] ${c.future ? 'opacity-0' : ''} ${tip?.day === c.day ? 'ring-1 ring-text' : ''}`}
                  style={{ background: ramp[level(c.n)] }}
                  disabled={c.future}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between gap-3 text-[12px] text-faint">
        <span className="min-h-[1.2em] text-muted">{tip ? t.stats.reviewsOn(tip.n, tip.day) : ' '}</span>
        <span className="flex items-center gap-1">
          {t.stats.less}
          {ramp.map((c) => (
            <span key={c} className="h-2.5 w-2.5 rounded-[2px]" style={{ background: c }} />
          ))}
          {t.stats.more}
        </span>
      </div>
    </div>
  )
}

/** Vertical columns, one series. Rounded data-end, value shown on tap/hover, sr-only table. */
function Columns({ values, format, max, caption }: { values: { label: string; value: number; n?: number }[]; format: (v: number) => string; max?: number; caption: string }) {
  const t = useT()
  const [active, setActive] = useState<number | null>(null)
  const top = max ?? Math.max(1, ...values.map((v) => v.value))
  if (!values.length) return <p className="py-6 text-center text-[13px] text-faint">{t.stats.noData}</p>
  return (
    <div>
      <div className="flex h-36 items-end gap-[6px] border-b border-line/70" role="img" aria-label={caption}>
        {values.map((v, i) => (
          <button
            key={v.label}
            className="group relative flex h-full flex-1 items-end justify-center"
            onMouseEnter={() => setActive(i)}
            onMouseLeave={() => setActive(null)}
            onClick={() => setActive(i)}
            aria-label={`${v.label}: ${format(v.value)}${v.n ? ` (n=${v.n})` : ''}`}
          >
            <span
              className={`w-full max-w-7 rounded-t-[4px] transition-colors ${active === i ? 'bg-accent' : 'bg-accent/65'}`}
              style={{ height: `${Math.max(v.value > 0 ? 3 : 0, (v.value / top) * 100)}%` }}
            />
            {active === i && (
              <span className="absolute -top-7 left-1/2 -translate-x-1/2 rounded-lg bg-raised px-2 py-0.5 text-[12px] whitespace-nowrap text-text shadow">
                {format(v.value)}
                {v.n ? <span className="text-faint"> · {v.n}</span> : null}
              </span>
            )}
          </button>
        ))}
      </div>
      <div className="mt-1.5 flex gap-[6px]">
        {values.map((v) => (
          <span key={v.label} className="flex-1 truncate text-center text-[11px] text-faint">
            {v.label}
          </span>
        ))}
      </div>
      <table className="sr-only">
        <caption>{caption}</caption>
        <tbody>
          {values.map((v) => (
            <tr key={v.label}>
              <th>{v.label}</th>
              <td>{format(v.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Horizontal bars: accuracy (%) with the answer count as secondary text. */
function Bars({ items, label, caption, showCount }: { items: Bucket[]; label: (k: string) => string; caption: string; showCount?: boolean }) {
  const t = useT()
  if (!items.length) return <p className="py-6 text-center text-[13px] text-faint">{t.stats.noData}</p>
  const maxN = Math.max(...items.map((b) => b.n))
  return (
    <ul className="space-y-2.5" aria-label={caption}>
      {items.map((b) => {
        const pct = b.correct / b.n
        const width = showCount ? b.n / maxN : pct
        return (
          <li key={b.key}>
            <div className="mb-1 flex items-baseline justify-between gap-2 text-[13px]">
              <span className="truncate">{label(b.key)}</span>
              <span className="shrink-0 text-muted tabular-nums">
                {showCount ? b.n : `${Math.round(pct * 100)}%`}
                <span className="text-faint"> · {showCount ? `${Math.round(pct * 100)}%` : `n=${b.n}`}</span>
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-line/50">
              <div className="h-full rounded-full bg-accent/80" style={{ width: `${Math.max(2, width * 100)}%` }} />
            </div>
          </li>
        )
      })}
    </ul>
  )
}

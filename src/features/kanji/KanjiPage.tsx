import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { useLocation, useSearch } from 'wouter'
import { Page } from '../../components/Page'
import { Button, Chip, Sheet } from '../../components/ui'
import { db, type KanjiProgressRow } from '../../lib/db'
import { useLang, useT } from '../../lib/i18n'
import { KANJI, KANJI_BY_CHAR, KANJI_LESSONS, kanjiKey, kanjiMeaning, variants, weakness, wordMeaning, type Kanji } from '../../lib/kanji'
import { StrokeAnimation } from './StrokeCanvas'

/** All kanji stats as a map (live). */
export function useKanjiStats(): Map<string, KanjiProgressRow> | undefined {
  return useLiveQuery(async () => new Map((await db.kanjiProgress.toArray()).filter((r) => !r.deleted).map((r) => [r.id, r])), [])
}

const pad = (n: number) => String(n).padStart(3, '0')

export function KanjiPage() {
  const t = useT()
  const lang = useLang()
  const search = new URLSearchParams(useSearch())
  const [, navigate] = useLocation()
  const initial = Number(search.get('l'))
  const [lesson, setLesson] = useState<number | null>(KANJI_LESSONS.includes(initial) ? initial : null)
  const [open, setOpen] = useState<string | null>(search.get('k'))
  const stats = useKanjiStats()
  const lessons = lesson === null ? KANJI_LESSONS : [lesson]

  return (
    <Page
      title={t.kanji.title}
      subtitle={t.kanji.subtitle(KANJI.length)}
      actions={
        <Button variant="primary" size="sm" onClick={() => navigate('/kanji/quiz')}>
          {t.kanji.quiz}
        </Button>
      }
    >
      <div className="no-scrollbar -mx-4 mb-5 flex gap-2 overflow-x-auto px-4 sm:-mx-6 sm:px-6">
        <Chip active={lesson === null} onClick={() => setLesson(null)}>
          {t.common.all}
        </Chip>
        {KANJI_LESSONS.map((n) => (
          <Chip key={n} active={lesson === n} onClick={() => setLesson(n)}>
            {t.common.lessonShort(n)}
          </Chip>
        ))}
      </div>

      {lessons.map((l) => (
        <section key={l} className="mb-7">
          <h2 className="mb-3 px-1 text-[13px] font-semibold tracking-wide text-muted">{t.common.lesson(l)}</h2>
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
            {KANJI.filter((k) => k.lesson === l).map((k) => {
              const w = weakness(stats?.get(kanjiKey(k.kanji)))
              return (
                <button
                  key={k.kanji}
                  data-kanji={k.kanji}
                  aria-label={`${k.kanji} ${kanjiMeaning(k, lang)}`}
                  onClick={() => setOpen(k.kanji)}
                  className="relative flex aspect-square flex-col items-center justify-center rounded-2xl border border-line/70 bg-surface transition active:scale-95 hover:border-line"
                >
                  <span lang="ja" className="jp-serif text-[34px] leading-none">
                    {k.kanji}
                  </span>
                  <span className="mt-1 line-clamp-1 max-w-full px-1 text-[11px] text-faint">{kanjiMeaning(k, lang)}</span>
                  {w >= 0 && <span className={`absolute top-2 right-2 h-1.5 w-1.5 rounded-full ${w > 0.4 ? 'bg-accent' : 'bg-good'}`} />}
                </button>
              )
            })}
          </div>
        </section>
      ))}
      <p className="mt-2 text-center text-[12px] text-faint">{t.kanji.credit}</p>

      <KanjiSheet
        kanji={open ? (KANJI_BY_CHAR.get(open) ?? null) : null}
        stats={stats}
        onClose={() => {
          setOpen(null)
          // drop ?k=/?l= so a reload or a later visit doesn't reopen this kanji
          if (search.has('k') || search.has('l')) navigate('/kanji?', { replace: true })
        }}
      />
    </Page>
  )
}

export function KanjiSheet({ kanji: k, stats, onClose }: { kanji: Kanji | null; stats?: Map<string, KanjiProgressRow>; onClose: () => void }) {
  const t = useT()
  const lang = useLang()
  const [, navigate] = useLocation()
  const [run, setRun] = useState(0)
  const s = k ? stats?.get(kanjiKey(k.kanji)) : undefined
  return (
    <Sheet open={!!k} onClose={onClose} title={k ? `${pad(k.n)} · ${t.common.lesson(k.lesson)}` : ''}>
      {k && (
        <div data-testid="kanji-sheet">
          <div className="flex items-start gap-4">
            <div className="w-36 shrink-0">
              <StrokeAnimation kanji={k.kanji} run={run} />
              <button className="mt-1.5 w-full text-center text-[12px] text-accent" onClick={() => setRun((r) => r + 1)}>
                ↻ {t.kanji.replay}
              </button>
            </div>
            <div className="min-w-0 flex-1 space-y-2 pt-1">
              <div className="text-[20px] font-semibold">{kanjiMeaning(k, lang)}</div>
              {k.on.length > 0 && (
                <div className="text-[15px]">
                  <span className="mr-2 text-[12px] text-faint">{t.kanji.on}</span>
                  <span lang="ja">{k.on.join('・')}</span>
                </div>
              )}
              {k.kun.length > 0 && (
                <div className="text-[15px]">
                  <span className="mr-2 text-[12px] text-faint">{t.kanji.kun}</span>
                  <span lang="ja">{k.kun.join('・')}</span>
                </div>
              )}
              <div className="text-[13px] text-muted">{t.kanji.strokes(k.strokes)}</div>
              <div className="text-[12px] text-faint">
                {s ? (
                  <>
                    {t.kanji.stats(s.right, s.wrong)}
                    {(s.writeRight ?? 0) + (s.writeWrong ?? 0) > 0 && <div>{t.kanji.writeStats(s.writeRight ?? 0, s.writeWrong ?? 0)}</div>}
                  </>
                ) : (
                  t.kanji.never
                )}
              </div>
            </div>
          </div>

          <h3 className="mt-5 mb-2 text-[13px] font-semibold text-muted">{t.kanji.words}</h3>
          <ul className="divide-y divide-line/60 rounded-2xl border border-line/70">
            {k.words.map((w) => (
              <li key={`${w.w}|${w.r}`} className={`flex items-baseline gap-3 px-3.5 py-2.5 ${w.hl ? 'bg-accent/8' : ''}`}>
                <span className="min-w-0 shrink-0">
                  <span lang="ja" className="jp-serif text-[19px]">
                    {variants(w.w).join('・')}
                  </span>
                  <span lang="ja" className="ml-2 text-[13px] text-muted">
                    {variants(w.r).join('・')}
                  </span>
                </span>
                <span className="min-w-0 flex-1 text-right text-[13px] text-muted">{wordMeaning(w, lang)}</span>
                {w.hl && (
                  <span className="text-accent" title={t.kanji.important} aria-label={t.kanji.important}>
                    ★
                  </span>
                )}
              </li>
            ))}
          </ul>

          <Button variant="primary" size="lg" className="mt-5 w-full" onClick={() => navigate(`/kanji/write/${encodeURIComponent(k.kanji)}`)}>
            ✎ {t.kanji.write}
          </Button>
        </div>
      )}
    </Sheet>
  )
}

import { useMemo } from 'react'
import { Link, useLocation } from 'wouter'
import { fitSize, SentenceJP, WordJP } from '../../components/Furigana'
import { Page } from '../../components/Page'
import { SpeakButton, wordSpeech } from '../../components/SpeakButton'
import { IconFlame } from '../../components/icons'
import { Button, Card, Ring, SectionTitle } from '../../components/ui'
import { useSettings } from '../../lib/settings'
import { useTodayStats } from '../../lib/stats'
import { exampleTranslation, meaning, useLang, useT } from '../../lib/i18n'
import { stripMarkup } from '../../lib/jp/markup'
import { studyDay } from '../../lib/time'
import { LESSONS } from '../../lib/vocab'
import { useVocab } from '../../lib/vocab-context'

export function greeting(h = new Date().getHours()) {
  if (h >= 4 && h < 11) return { ja: 'おはようございます', en: 'Good morning', pl: 'Dzień dobry' }
  if (h >= 11 && h < 18) return { ja: 'こんにちは', en: 'Good afternoon', pl: 'Dzień dobry' }
  return { ja: 'こんばんは', en: 'Good evening', pl: 'Dobry wieczór' }
}

export function jpDate(d = new Date()) {
  const wd = '日月火水木金土'[d.getDay()]
  return `${d.getMonth() + 1}月${d.getDate()}日（${wd}）`
}

function hash(s: string) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}

export function TodayPage() {
  const t = useT()
  const lang = useLang()
  const { words } = useVocab()
  const settings = useSettings()
  const stats = useTodayStats(words)
  const [, navigate] = useLocation()
  const g = greeting()
  const wotd = useMemo(() => {
    const pool = words.filter((w) => w.example && w.type !== 'number' && w.type !== 'particle')
    return pool.length ? pool[hash(studyDay()) % pool.length] : undefined
  }, [words])

  return (
    <Page>
      <header className="mb-6 flex items-end justify-between">
        <div>
          <p lang="ja" className="text-[13px] tracking-wide text-faint">
            {jpDate()}
          </p>
          <h1 lang="ja" className="jp-serif mt-1 text-[34px] leading-tight font-semibold">
            {g.ja}
          </h1>
          <p className="text-[15px] text-muted">{lang === 'pl' ? g.pl : g.en}</p>
        </div>
        {stats && (
          <div
            className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[14px] font-semibold ${
              stats.streak.current ? 'border-warn/40 bg-warn/10 text-warn' : 'border-line text-faint'
            }`}
            title={stats.streak.current ? t.today.streak(stats.streak.current) : t.today.streakNone}
          >
            <IconFlame size={18} />
            <span className="tabular-nums">{stats.streak.current}</span>
          </div>
        )}
      </header>

      <section className="mb-8">
        <Card className="card-face relative overflow-hidden p-5">
          <div className="flex items-center gap-5">
            <Ring value={stats ? stats.answeredToday / settings.dailyGoal : 0} size={92} stroke={8} color="var(--k-good)">
              <div className="text-center leading-tight">
                <div className="text-[22px] font-bold tabular-nums">{stats?.answeredToday ?? 0}</div>
                <div className="text-[11px] text-faint">/ {settings.dailyGoal}</div>
              </div>
            </Ring>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2">
                <span className="text-[44px] leading-none font-bold tabular-nums">{stats?.due ?? '–'}</span>
                <span className="text-[15px] text-muted">{t.today.due(stats?.due ?? 0).replace(/^\d+\s*/, '')}</span>
              </div>
              <p className="mt-1 text-[14px] text-faint">
                {t.today.newToday(stats?.newAvailable ?? 0)} · {t.today.goal.toLowerCase()} {Math.min(100, Math.round(((stats?.answeredToday ?? 0) / settings.dailyGoal) * 100))}%
              </p>
              {stats && stats.streak.current > 0 && stats.streak.freezeAvailable && (
                <p className="mt-0.5 text-[12px] text-faint">❄ {t.today.freezeLeft}</p>
              )}
            </div>
          </div>
          <div className="mt-5 grid gap-2">
            {stats && stats.due + stats.newAvailable > 0 ? (
              <Button variant="primary" size="lg" onClick={() => navigate('/review?')}>
                {t.today.reviewNow}
                {stats.due + stats.newAvailable > 0 && <span className="rounded-full bg-black/15 px-2 py-0.5 text-[13px] tabular-nums">{stats.due + stats.newAvailable}</span>}
              </Button>
            ) : (
              <p className="py-2 text-center text-[15px] text-muted">{t.today.allCaughtUp}</p>
            )}
            <Button onClick={() => navigate('/session?')}>
              {t.today.fiveMin}
            </Button>
          </div>
          {stats && stats.leeches > 0 && (
            <Link href="/library" className="mt-3 block text-center text-[13px] text-accent" onClick={() => localStorage.setItem('kotoba.library', JSON.stringify({ sort: 'weakest', group: 'none', filter: { lessons: [], types: [], tags: [], status: 'leech' } }))}>
              {t.today.leeches}: {stats.leeches}
            </Link>
          )}
        </Card>
      </section>

      {wotd && (
        <section className="mb-8">
          <SectionTitle>{t.today.wordOfDay}</SectionTitle>
          <Card className="card-face relative overflow-hidden p-6">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div style={{ fontSize: fitSize(wotd.japanese, 56, 240) }}>
                  <WordJP word={wotd} className="jp-serif ruby-display font-medium" />
                </div>
                <p className="mt-1 text-[17px] text-text">{meaning(wotd, lang)}</p>
                <p className="mt-0.5 text-[13px] text-faint">
                  {t.types[wotd.type]} · {t.common.lesson(wotd.genkiLesson)}
                </p>
              </div>
              <SpeakButton text={wordSpeech(wotd)} size="lg" />
            </div>
            {wotd.example && (
              <div className="mt-5 flex items-start gap-3 border-t border-line/70 pt-4">
                <div className="min-w-0 flex-1">
                  <SentenceJP markup={wotd.example.ja} highlight className="text-[18px] leading-[1.95]" />
                  <p className="mt-1 text-[14px] text-muted">{exampleTranslation(wotd.example, lang)}</p>
                </div>
                <SpeakButton text={stripMarkup(wotd.example.ja)} size="sm" />
              </div>
            )}
          </Card>
        </section>
      )}

      <section>
        <SectionTitle>{t.today.lessons}</SectionTitle>
        <div className="no-scrollbar -mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2">
          {LESSONS.map((l) => (
            <Link
              key={l.lesson}
              href={`/library?lesson=${l.lesson}`}
              className="min-w-[150px] snap-start rounded-3xl border border-line/70 bg-surface p-4 transition active:scale-[0.98]"
            >
              <div className="text-[12px] font-semibold text-accent">{t.common.lesson(l.lesson)}</div>
              {l.title.ja && <SentenceJP markup={l.title.ja} className="mt-1 block text-[17px] leading-[1.9]" />}
              <div className="truncate text-[13px] text-muted">{l.title[lang]}</div>
              <div className="mt-2 text-[12px] text-faint">{t.common.words(l.words.length)}</div>
            </Link>
          ))}
        </div>
      </section>
    </Page>
  )
}

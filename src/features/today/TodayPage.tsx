import { useMemo } from 'react'
import { Link } from 'wouter'
import { fitSize, SentenceJP, WordJP } from '../../components/Furigana'
import { Page } from '../../components/Page'
import { SpeakButton, wordSpeech } from '../../components/SpeakButton'
import { Card, SectionTitle } from '../../components/ui'
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
      </header>

      {wotd && (
        <section className="mb-8">
          <SectionTitle>{t.today.wordOfDay}</SectionTitle>
          <Card className="card-face relative overflow-hidden p-6">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div style={{ fontSize: fitSize(wotd.japanese, 56) }}>
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

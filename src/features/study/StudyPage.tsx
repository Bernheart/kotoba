import { Link } from 'wouter'
import { Page } from '../../components/Page'
import { SectionTitle } from '../../components/ui'
import { useT } from '../../lib/i18n'
import { useTodayStats } from '../../lib/stats'
import { useVocab } from '../../lib/vocab-context'

function Tile({ href, glyph, title, desc, badge, wide }: { href: string; glyph: string; title: string; desc: string; badge?: string | number; wide?: boolean }) {
  return (
    <Link
      href={href}
      className={`group relative flex gap-3.5 overflow-hidden rounded-3xl border border-line/70 bg-surface p-4 transition active:scale-[0.98] hover:border-line ${wide ? 'sm:col-span-2' : ''}`}
    >
      <span lang="ja" className="jp-serif grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-bg-2 text-[26px] text-accent">
        {glyph}
      </span>
      <span className="min-w-0">
        <span className="flex items-center gap-2 text-[16px] font-semibold">
          {title}
          {badge !== undefined && badge !== 0 && <span className="rounded-full bg-accent px-2 py-0.5 text-[12px] font-bold text-accent-ink tabular-nums">{badge}</span>}
        </span>
        <span className="mt-0.5 block text-[13px] leading-snug text-muted">{desc}</span>
      </span>
    </Link>
  )
}

export function StudyPage() {
  const t = useT()
  const { words } = useVocab()
  const stats = useTodayStats(words)
  return (
    <Page title={t.study.title}>
      <Link
        href="/session?"
        className="card-face relative mb-7 flex items-center gap-5 overflow-hidden rounded-[28px] border border-line/70 p-5 transition active:scale-[0.99]"
      >
        <span lang="ja" className="jp-serif text-[52px] leading-none text-accent">
          五分
        </span>
        <span>
          <span className="block text-[18px] font-semibold">{t.today.fiveMin}</span>
          <span className="mt-0.5 block text-[13px] text-muted">{t.today.fiveMinHint}</span>
        </span>
      </Link>

      <SectionTitle>{t.study.srs}</SectionTitle>
      <div className="mb-7 grid gap-2.5 sm:grid-cols-2">
        <Tile href="/review?" glyph="復" title={t.study.flashcards} desc={t.study.flashcardsDesc} badge={stats?.due} />
        <Tile href="/review?new=1" glyph="新" title={t.review.learnMore} desc={t.today.newToday(stats?.newAvailable ?? 0)} badge={stats?.newAvailable} />
      </div>

      <SectionTitle>{t.study.practice}</SectionTitle>
      <p className="-mt-1 mb-3 px-1 text-[12px] text-faint">{t.study.practiceNote}</p>
      <div className="grid gap-2.5 sm:grid-cols-2">
        <Tile href="/quiz/mcq" glyph="選" title={t.study.mcq} desc={t.study.mcqDesc} />
        <Tile href="/quiz/typing" glyph="書" title={t.study.typing} desc={t.study.typingDesc} />
        <Tile href="/quiz/listening" glyph="聴" title={t.study.listening} desc={t.study.listeningDesc} />
        <Tile href="/shadowing" glyph="影" title={t.study.shadowing} desc={t.study.shadowingDesc} />
        <Tile href="/quiz/cloze" glyph="穴" title={t.study.cloze} desc={t.study.clozeDesc} />
        <Tile href="/quiz/builder" glyph="並" title={t.study.builder} desc={t.study.builderDesc} />
        <Tile href="/conjugation" glyph="活" title={t.study.conjugation} desc={t.study.conjugationDesc} />
        <Tile href="/matching" glyph="合" title={t.study.matching} desc={t.study.matchingDesc} />
        <Tile href="/kana" glyph="仮" title={t.study.kana} desc={t.study.kanaDesc} />
        <Tile href="/quiz/weak" glyph="弱" title={t.study.weak} desc={t.study.weakDesc} badge={stats?.leeches || undefined} />
      </div>
    </Page>
  )
}

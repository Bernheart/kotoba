import { memo, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useSearch } from 'wouter'
import { WordJP } from '../../components/Furigana'
import { IconClose, IconFilter, IconPlus, IconSearch, IconUpload } from '../../components/icons'
import { Page } from '../../components/Page'
import { Button, Chip, IconButton, Segmented, Sheet } from '../../components/ui'
import { meaning, useLang, useT } from '../../lib/i18n'
import {
  EMPTY_FILTER,
  filterWords,
  groupWords,
  sortWords,
  type GroupKey,
  type LibraryFilter,
  type SortKey,
  type StatusFilter,
} from '../../lib/library'
import { useProgress, type WordProgress } from '../../lib/progress'
import { WORD_TYPES, type Lang, type WordType } from '../../lib/types'
import { lessonTitle, type VocabEntry } from '../../lib/vocab'
import { useVocab } from '../../lib/vocab-context'
import { useOpenWord } from '../word/WordSheet'
import { AddWordSheet } from './AddWordSheet'

const PREFS_KEY = 'kotoba.library'
interface Prefs {
  sort: SortKey
  group: GroupKey
  filter: Omit<LibraryFilter, 'q'>
}
function loadPrefs(): Prefs {
  try {
    const p = JSON.parse(localStorage.getItem(PREFS_KEY) ?? 'null')
    if (p?.sort && p?.group) return p
  } catch {
    /* ignore */
  }
  return { sort: 'lesson', group: 'lesson', filter: { lessons: [], types: [], tags: [], status: 'all' } }
}

export function LibraryPage() {
  const t = useT()
  const lang = useLang()
  const { words, lessons, tags } = useVocab()
  const progress = useProgress()
  const openWord = useOpenWord()
  const [, navigate] = useLocation()
  const search = useSearch()
  const [prefs, setPrefs] = useState<Prefs>(loadPrefs)
  const [q, setQ] = useState('')
  const dq = useDeferredValue(q)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Deep link from Today: /library?lesson=3
  useEffect(() => {
    const lesson = Number(new URLSearchParams(search).get('lesson'))
    if (lesson) {
      setPrefs((p) => ({ ...p, filter: { ...p.filter, lessons: [lesson] } }))
      navigate('/library?', { replace: true })
    }
  }, [search, navigate])

  useEffect(() => {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(prefs))
    } catch {
      /* ignore */
    }
  }, [prefs])

  // "/" focuses search on desktop
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '/' && document.activeElement?.tagName !== 'INPUT') {
        e.preventDefault()
        inputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const filter: LibraryFilter = { ...prefs.filter, q: dq }
  const shown = useMemo(
    () => sortWords(filterWords(words, filter, progress), prefs.sort, progress, dq),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [words, progress, dq, prefs],
  )
  const groups = useMemo(() => (dq ? [{ key: 'all', words: shown }] : groupWords(shown, prefs.group)), [shown, prefs.group, dq])
  const activeCount =
    prefs.filter.types.length + prefs.filter.tags.length + (prefs.filter.status !== 'all' ? 1 : 0) + prefs.filter.lessons.length
  const setFilter = (f: Partial<Prefs['filter']>) => setPrefs((p) => ({ ...p, filter: { ...p.filter, ...f } }))
  const toggleLesson = (n: number) =>
    setFilter({ lessons: prefs.filter.lessons.includes(n) ? prefs.filter.lessons.filter((x) => x !== n) : [...prefs.filter.lessons, n] })

  return (
    <Page
      title={t.library.title}
      subtitle={t.library.results(shown.length)}
      actions={
        <>
          <IconButton label={t.library.import} onClick={() => navigate('/import')}>
            <IconUpload size={22} />
          </IconButton>
          <IconButton label={t.library.addWord} onClick={() => setAddOpen(true)} className="bg-accent/15 text-accent">
            <IconPlus size={22} />
          </IconButton>
        </>
      }
    >
      <div className="sticky top-[var(--safe-top)] z-20 -mx-4 bg-bg/85 px-4 pt-2 pb-3 backdrop-blur-xl sm:-mx-6 sm:px-6 lg:top-0">
        <div className="flex gap-2">
          <label className="relative flex h-12 flex-1 items-center rounded-2xl border border-line bg-surface focus-within:border-accent/60">
            <IconSearch size={20} className="ml-3.5 shrink-0 text-faint" />
            <input
              ref={inputRef}
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t.library.search}
              aria-label={t.common.search}
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="search"
              className="h-full min-w-0 flex-1 bg-transparent px-2.5 text-[16px] placeholder:text-faint focus:outline-none [&::-webkit-search-cancel-button]:hidden"
            />
            {q && (
              <button aria-label={t.common.close} onClick={() => setQ('')} className="mr-1 grid h-10 w-10 place-items-center text-faint">
                <IconClose size={18} />
              </button>
            )}
          </label>
          <button
            onClick={() => setFiltersOpen(true)}
            className={`relative grid h-12 w-12 shrink-0 place-items-center rounded-2xl border ${activeCount ? 'border-accent/60 text-accent' : 'border-line text-muted'} bg-surface`}
            aria-label={t.library.filter}
          >
            <IconFilter size={22} />
            {activeCount > 0 && (
              <span className="absolute -top-1 -right-1 grid h-5 min-w-5 place-items-center rounded-full bg-accent px-1 text-[11px] font-bold text-accent-ink">
                {activeCount}
              </span>
            )}
          </button>
        </div>
        <div className="no-scrollbar -mx-4 mt-2.5 flex gap-2 overflow-x-auto px-4 sm:-mx-6 sm:px-6">
          <Chip active={!prefs.filter.lessons.length} onClick={() => setFilter({ lessons: [] })}>
            {t.common.all}
          </Chip>
          {lessons.map((n) => (
            <Chip key={n} active={prefs.filter.lessons.includes(n)} onClick={() => toggleLesson(n)}>
              {n === 0 ? '—' : t.common.lessonShort(n)}
            </Chip>
          ))}
        </div>
      </div>

      {shown.length === 0 ? (
        <div className="mt-16 text-center">
          <p className="text-muted">{t.library.empty}</p>
          {activeCount > 0 && (
            <Button className="mt-4" onClick={() => setPrefs((p) => ({ ...p, filter: { ...EMPTY_FILTER } }))}>
              {t.library.clearFilters}
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          {groups.map((g) => (
            <section key={g.key}>
              {groups.length > 1 && <GroupHeader group={prefs.group} k={g.key} n={g.words.length} lang={lang} />}
              <ul className="overflow-hidden rounded-3xl border border-line/60 bg-surface">
                {g.words.map((w) => (
                  <WordRow key={w.id} w={w} p={progress?.get(w.id)} lang={lang} onOpen={openWord} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      <FilterSheet
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        prefs={prefs}
        setPrefs={setPrefs}
        lessons={lessons}
        tags={tags}
      />
      <AddWordSheet open={addOpen} onClose={() => setAddOpen(false)} />
    </Page>
  )
}

function GroupHeader({ group, k, n, lang }: { group: GroupKey; k: string; n: number; lang: Lang }) {
  const t = useT()
  let label = k
  if (group === 'lesson') {
    const title = lessonTitle(Number(k))
    label = Number(k) === 0 ? '—' : `${t.common.lesson(Number(k))}${title ? ` · ${title[lang]}` : ''}`
  } else if (group === 'type') label = t.types[k as WordType]
  return (
    <h2 className="mb-2 flex items-baseline justify-between px-1 text-[13px] font-semibold text-muted">
      <span>{label}</span>
      <span className="font-normal text-faint">{n}</span>
    </h2>
  )
}

const STATUS_DOT: Record<string, string> = { new: 'bg-line', learning: 'bg-warn', known: 'bg-good' }

const WordRow = memo(function WordRow({
  w,
  p,
  lang,
  onOpen,
}: {
  w: VocabEntry
  p?: WordProgress
  lang: Lang
  onOpen: (id: string) => void
}) {
  return (
    <li className="border-b border-line/50 last:border-0 [content-visibility:auto] [contain-intrinsic-size:auto_68px]">
      <button onClick={() => onOpen(w.id)} className="flex w-full items-center gap-3 px-4 py-2 text-left active:bg-raised">
        <div className="min-w-0 flex-1">
          <WordJP word={w} className="text-[20px] leading-[1.65]" />
          <p className="truncate text-[14px] text-muted">{meaning(w, lang)}</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span className="text-[11px] text-faint">L{w.genkiLesson}</span>
          <span className="flex items-center gap-1.5">
            {w.verify && <span className="h-1.5 w-1.5 rounded-full bg-warn" title="verify" />}
            {p?.leech && <span className="text-[11px] font-semibold text-accent">!</span>}
            <span className={`h-2 w-2 rounded-full ${STATUS_DOT[p?.status ?? 'new']}`} />
          </span>
        </div>
      </button>
    </li>
  )
})

function FilterSheet({
  open,
  onClose,
  prefs,
  setPrefs,
  lessons,
  tags,
}: {
  open: boolean
  onClose: () => void
  prefs: Prefs
  setPrefs: (f: (p: Prefs) => Prefs) => void
  lessons: number[]
  tags: string[]
}) {
  const t = useT()
  const f = prefs.filter
  const set = (x: Partial<Prefs['filter']>) => setPrefs((p) => ({ ...p, filter: { ...p.filter, ...x } }))
  const toggle = <T,>(arr: T[], v: T) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v])
  const statuses: [StatusFilter, string][] = [
    ['all', t.library.statusAll],
    ['new', t.library.statusNew],
    ['learning', t.library.statusLearning],
    ['known', t.library.statusKnown],
    ['leech', t.library.statusLeech],
    ['verify', t.library.statusVerify],
    ['mine', t.library.statusMine],
  ]
  return (
    <Sheet open={open} onClose={onClose} title={t.library.filter}>
      <div className="space-y-5 pt-1">
        <div>
          <h3 className="mb-2 text-[13px] font-semibold text-muted">{t.library.sort}</h3>
          <div className="flex flex-wrap gap-2">
            {(
              [
                ['lesson', t.library.sortLesson],
                ['kana', t.library.sortKana],
                ['type', t.library.sortType],
                ['difficulty', t.library.sortDifficulty],
                ['weakest', t.library.sortWeakest],
              ] as [SortKey, string][]
            ).map(([k, label]) => (
              <Chip key={k} active={prefs.sort === k} onClick={() => setPrefs((p) => ({ ...p, sort: k }))}>
                {label}
              </Chip>
            ))}
          </div>
        </div>
        <div>
          <h3 className="mb-2 text-[13px] font-semibold text-muted">{t.library.group}</h3>
          <Segmented
            value={prefs.group}
            onChange={(g) => setPrefs((p) => ({ ...p, group: g }))}
            options={[
              { value: 'none', label: '—' },
              { value: 'lesson', label: t.library.groupLesson },
              { value: 'type', label: t.library.groupType },
              { value: 'tag', label: t.library.groupTag },
            ]}
          />
        </div>
        <div>
          <h3 className="mb-2 text-[13px] font-semibold text-muted">{t.library.status}</h3>
          <div className="flex flex-wrap gap-2">
            {statuses.map(([k, label]) => (
              <Chip key={k} active={f.status === k} onClick={() => set({ status: k })}>
                {label}
              </Chip>
            ))}
          </div>
        </div>
        <div>
          <h3 className="mb-2 text-[13px] font-semibold text-muted">{t.library.lessons}</h3>
          <div className="flex flex-wrap gap-2">
            {lessons.map((n) => (
              <Chip key={n} active={f.lessons.includes(n)} onClick={() => set({ lessons: toggle(f.lessons, n) })}>
                {n === 0 ? '—' : t.common.lessonShort(n)}
              </Chip>
            ))}
          </div>
        </div>
        <div>
          <h3 className="mb-2 text-[13px] font-semibold text-muted">{t.library.types}</h3>
          <div className="flex flex-wrap gap-2">
            {WORD_TYPES.map((wt) => (
              <Chip key={wt} active={f.types.includes(wt)} onClick={() => set({ types: toggle(f.types, wt) })}>
                {t.types[wt]}
              </Chip>
            ))}
          </div>
        </div>
        <div>
          <h3 className="mb-2 text-[13px] font-semibold text-muted">{t.library.tags}</h3>
          <div className="flex flex-wrap gap-2">
            {tags.map((tag) => (
              <Chip key={tag} active={f.tags.includes(tag)} onClick={() => set({ tags: toggle(f.tags, tag) })}>
                {tag}
              </Chip>
            ))}
          </div>
        </div>
        <div className="flex gap-2 pt-2">
          <Button variant="ghost" className="flex-1" onClick={() => setPrefs((p) => ({ ...p, filter: { ...EMPTY_FILTER } }))}>
            {t.library.clearFilters}
          </Button>
          <Button variant="primary" className="flex-1" onClick={onClose}>
            {t.common.done}
          </Button>
        </div>
      </div>
    </Sheet>
  )
}

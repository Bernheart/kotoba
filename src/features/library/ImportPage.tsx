import { useMemo, useRef, useState } from 'react'
import { useLocation } from 'wouter'
import { WordJP } from '../../components/Furigana'
import { IconUpload } from '../../components/icons'
import { KanaInput } from '../../components/KanaInput'
import { Page } from '../../components/Page'
import { Button, Card, Segmented, Toggle, useToast } from '../../components/ui'
import { useT } from '../../lib/i18n'
import { applyImport, planImport } from '../../lib/import/apply'
import { buildRows, COL_ROLES, detectRoles, lessonFromFilename, parseText, type ColRole, type ImportRow } from '../../lib/import/parse'
import { isKanaOnly } from '../../lib/jp/chars'
import type { Lang } from '../../lib/types'
import { useVocab } from '../../lib/vocab-context'

const inputCls = 'h-11 w-full rounded-2xl border border-line bg-bg-2 px-3 text-[16px] focus:border-accent/60 focus:outline-none'

export function ImportPage() {
  const t = useT()
  const toast = useToast()
  const [, navigate] = useLocation()
  const { words } = useVocab()
  const fileRef = useRef<HTMLInputElement>(null)
  const [text, setText] = useState('')
  const [fileName, setFileName] = useState('')
  const [meaningLang, setMeaningLang] = useState<Lang>('en')
  const [rolesOverride, setRolesOverride] = useState<ColRole[] | null>(null)
  const [headerOverride, setHeaderOverride] = useState<boolean | null>(null)
  const [lesson, setLesson] = useState<number>(0)
  const [tags, setTags] = useState('')
  const [updateLessons, setUpdateLessons] = useState(true)
  const [fixes, setFixes] = useState<Record<number, string>>({})
  const [busy, setBusy] = useState(false)

  const table = useMemo(() => {
    if (!text.trim()) return null
    const tb = parseText(text)
    return headerOverride === null ? tb : { ...tb, hasHeader: headerOverride }
  }, [text, headerOverride])
  const roles = useMemo(() => rolesOverride ?? (table ? detectRoles(table, meaningLang) : []), [table, rolesOverride, meaningLang])
  const tagList = tags
    .split(/[,，、]/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
  const rows: ImportRow[] = useMemo(() => {
    if (!table) return []
    const base = buildRows(table, roles, { lesson: lesson || undefined, tags: tagList })
    return base.map((r, i) =>
      fixes[i] && isKanaOnly(fixes[i]) ? { ...r, kana: fixes[i], problem: undefined } : r,
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table, roles, lesson, tags, fixes])
  const plan = useMemo(() => planImport(rows, words), [rows, words])
  const counts = {
    add: plan.filter((p) => p.action === 'new').length,
    merge: plan.filter((p) => p.action === 'merge').length,
    skip: plan.filter((p) => p.action === 'skip' && p.row.problem).length,
  }

  const onFile = async (f: File) => {
    setFileName(f.name)
    setText(await f.text())
    setRolesOverride(null)
    setHeaderOverride(null)
    setFixes({})
    const l = lessonFromFilename(f.name)
    if (l) setLesson(l)
    if (/kanji/i.test(f.name) && !tags.includes('kanji')) setTags((x) => (x ? `${x}, kanji` : 'kanji'))
  }

  const run = async () => {
    setBusy(true)
    try {
      const res = await applyImport(plan, { updateLessons, defaultLesson: lesson || 0 })
      toast({ text: t.importer.done(res.added, res.merged), tone: 'good', ms: 5000 })
      navigate('/library')
    } finally {
      setBusy(false)
    }
  }

  const width = roles.length
  const roleLabel: Record<ColRole, string> = {
    ignore: t.importer.colIgnore,
    japanese: t.importer.colJapanese,
    kana: t.importer.colKana,
    en: t.importer.colEn,
    pl: t.importer.colPl,
    type: t.importer.colType,
    lesson: t.importer.colLesson,
    tags: t.importer.colTags,
    example: t.importer.colExample,
  }

  return (
    <Page title={t.importer.title} subtitle={t.importer.intro}>
      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => fileRef.current?.click()}>
            <IconUpload size={18} /> {t.importer.pickFile}
          </Button>
          {fileName && <span className="truncate text-[14px] text-muted">{fileName}</span>}
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.tsv,.txt,.json,text/csv,text/plain,application/json"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
          />
        </div>
        <textarea
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            setRolesOverride(null)
            setFixes({})
          }}
          placeholder={`${t.importer.paste}\n\nだいがく\tcollege; university\n食べる,たべる,to eat,jeść`}
          rows={6}
          lang="ja"
          className="mt-3 w-full rounded-2xl border border-line bg-bg-2 px-3.5 py-3 font-mono text-[14px] placeholder:text-faint focus:border-accent/60 focus:outline-none"
        />
      </Card>

      {table?.backup && <p className="mt-4 text-[15px] text-warn">Kotoba backup → {t.settings.title} → {t.settings.importBackup}</p>}

      {table && !table.backup && (
        <>
          <p className="mt-4 px-1 text-[13px] text-faint">
            {t.importer.detected(table.format.toUpperCase())} · {t.importer.rows(rows.length)}
          </p>

          {table.format !== 'json' && (
            <Card className="mt-3 space-y-3 p-4">
              <h3 className="text-[13px] font-semibold text-muted">{t.importer.columns}</h3>
              <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.min(width, 4)}, minmax(0, 1fr))` }}>
                {roles.map((r, i) => (
                  <label key={i} className="min-w-0">
                    <span className="mb-1 block truncate text-[12px] text-faint">
                      #{i + 1} · {table.rows[table.hasHeader ? 1 : 0]?.[i]?.slice(0, 14) ?? ''}
                    </span>
                    <select
                      value={r}
                      onChange={(e) => {
                        const next = [...roles]
                        next[i] = e.target.value as ColRole
                        setRolesOverride(next)
                      }}
                      className={inputCls}
                    >
                      {COL_ROLES.map((c) => (
                        <option key={c} value={c}>
                          {roleLabel[c]}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-[14px]">{t.importer.hasHeader}</span>
                <Toggle checked={table.hasHeader} onChange={(v) => setHeaderOverride(v)} label={t.importer.hasHeader} />
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-[14px]">{t.importer.meaningLang}</span>
                <Segmented
                  value={meaningLang}
                  onChange={(v) => {
                    setMeaningLang(v)
                    setRolesOverride(null)
                  }}
                  options={[
                    { value: 'en', label: 'EN' },
                    { value: 'pl', label: 'PL' },
                  ]}
                />
              </div>
            </Card>
          )}

          <Card className="mt-3 space-y-3 p-4">
            <div className="grid grid-cols-2 gap-3">
              <label>
                <span className="mb-1 block text-[13px] font-semibold text-muted">{t.importer.lesson}</span>
                <select value={lesson} onChange={(e) => setLesson(Number(e.target.value))} className={inputCls}>
                  {Array.from({ length: 24 }, (_, i) => (
                    <option key={i} value={i}>
                      {i === 0 ? '—' : t.common.lesson(i)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span className="mb-1 block text-[13px] font-semibold text-muted">{t.importer.tags}</span>
                <input value={tags} onChange={(e) => setTags(e.target.value)} className={inputCls} placeholder="anime, kanji" autoCapitalize="off" />
              </label>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-[14px]">{t.common.lesson(lesson || 0).replace(/\d+/, '#')} → ✓ existing</span>
              <Toggle checked={updateLessons} onChange={setUpdateLessons} label="update lessons" />
            </div>
          </Card>

          <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 px-1 text-[14px]">
            <span className="text-good">{t.importer.newWords(counts.add)}</span>
            {counts.merge > 0 && <span className="text-easy">{t.importer.duplicates(counts.merge)}</span>}
            {counts.skip > 0 && <span className="text-accent">{t.importer.problems(counts.skip)}</span>}
          </div>
          {plan.some((p) => p.row.typeGuessed && p.action === 'new') && <p className="mt-1 px-1 text-[12px] text-faint">{t.importer.typeGuess}</p>}

          <ul className="mt-3 overflow-hidden rounded-3xl border border-line/60 bg-surface">
            {plan.slice(0, 60).map((p, i) => (
              <li key={i} className="flex items-center gap-3 border-b border-line/50 px-4 py-2 last:border-0">
                <div className="min-w-0 flex-1">
                  {p.row.kana ? (
                    <WordJP word={p.row} className="text-[19px] leading-[1.8]" />
                  ) : (
                    <span lang="ja" className="text-[19px]">
                      {p.row.japanese}
                    </span>
                  )}
                  <p className="truncate text-[13px] text-muted">{[p.row.en, p.row.pl].filter(Boolean).join(' · ') || '—'}</p>
                  {p.row.problem === 'missing-reading' && (
                    <KanaInput
                      value={fixes[i] ?? ''}
                      onValueChange={(v) => setFixes((f) => ({ ...f, [i]: v }))}
                      placeholder={`${t.common.reading}…`}
                      className="mt-1 h-10 w-full rounded-xl border border-accent/50 bg-bg-2 px-3 text-[16px]"
                    />
                  )}
                </div>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] ${
                    p.action === 'new' ? 'bg-good/15 text-good' : p.action === 'merge' ? 'bg-easy/15 text-easy' : 'bg-accent/15 text-accent'
                  }`}
                >
                  {p.action === 'new' ? '+' : p.action === 'merge' ? '⇄' : '×'} {p.row.lesson ? `L${p.row.lesson}` : ''}
                </span>
              </li>
            ))}
          </ul>
          {plan.length > 60 && <p className="mt-2 px-1 text-[12px] text-faint">+{plan.length - 60}</p>}

          <div className="sticky bottom-[calc(var(--nav-h)+var(--safe-bottom)+12px)] mt-5 lg:bottom-4">
            <Button variant="primary" size="lg" className="w-full" disabled={busy || counts.add + counts.merge === 0} onClick={run}>
              {t.importer.run(counts.add + counts.merge)}
            </Button>
          </div>
        </>
      )}
    </Page>
  )
}

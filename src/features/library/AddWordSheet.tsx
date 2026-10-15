import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { SentenceJP, WordJP } from '../../components/Furigana'
import { KanaInput } from '../../components/KanaInput'
import { Button, Sheet, useToast } from '../../components/ui'
import { useT } from '../../lib/i18n'
import { hasKanji, isKanaOnly } from '../../lib/jp/chars'
import { guessType } from '../../lib/jp/guess'
import { fromAnkiFurigana } from '../../lib/jp/markup'
import { WORD_TYPES, type Word, type WordType } from '../../lib/types'
import { LESSONS } from '../../lib/vocab'
import { saveCustomWord, saveWordEdit } from '../../lib/words'

const inputCls =
  'h-12 w-full rounded-2xl border border-line bg-bg-2 px-3.5 text-[16px] placeholder:text-faint focus:border-accent/60 focus:outline-none'

function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-semibold text-muted">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[12px] text-faint">{hint}</span>}
    </label>
  )
}

export function AddWordSheet({ open, onClose, initial }: { open: boolean; onClose: () => void; initial?: Word }) {
  const t = useT()
  const toast = useToast()
  const maxLesson = Math.max(...LESSONS.map((l) => l.lesson), 10)
  const [japanese, setJapanese] = useState('')
  const [kana, setKana] = useState('')
  const [en, setEn] = useState('')
  const [pl, setPl] = useState('')
  const [type, setType] = useState<WordType | ''>('')
  const [lesson, setLesson] = useState(maxLesson)
  const [tags, setTags] = useState('')
  const [exJa, setExJa] = useState('')
  const [exEn, setExEn] = useState('')
  const [exPl, setExPl] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setJapanese(initial?.japanese ?? '')
    setKana(initial?.kana ?? '')
    setEn(initial?.en ?? '')
    setPl(initial?.pl ?? '')
    setType(initial?.type ?? '')
    setLesson(initial?.genkiLesson ?? maxLesson)
    setTags(initial?.tags.join(', ') ?? '')
    setExJa(initial?.example?.ja ?? '')
    setExEn(initial?.example?.en ?? '')
    setExPl(initial?.example?.pl ?? '')
    setError('')
  }, [open, initial, maxLesson])

  // A kana-only Japanese field doubles as the reading
  const reading = kana || (isKanaOnly(japanese) ? japanese : '')
  const guess = useMemo(() => guessType(reading, en, japanese), [reading, en, japanese])
  const effectiveType = (type || guess.type) as WordType

  const save = async () => {
    const jp = japanese.trim()
    const rd = reading.trim()
    if (!jp || !rd || !(en.trim() || pl.trim())) return setError(t.add.required)
    if (!isKanaOnly(rd)) return setError(t.add.kanaInvalid)
    const word: Word = {
      id: initial?.id ?? '',
      japanese: jp,
      kana: rd,
      en: en.trim(),
      pl: pl.trim(),
      type: effectiveType,
      genkiLesson: lesson,
      tags: tags
        .split(/[,，、]/)
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean),
      ...(exJa.trim() ? { example: { ja: fromAnkiFurigana(exJa.trim()), en: exEn.trim(), pl: exPl.trim() } } : {}),
      ...(initial?.furigana ? { furigana: initial.furigana } : {}),
      ...(initial?.alt ? { alt: initial.alt } : {}),
      ...(initial?.tts ? { tts: initial.tts } : {}),
      source: initial?.source ?? 'user',
    }
    if (initial) await saveWordEdit(initial, word)
    else {
      const { id: _id, ...rest } = word
      await saveCustomWord(rest)
    }
    toast({ text: t.add.saved, tone: 'good' })
    onClose()
  }

  return (
    <Sheet open={open} onClose={onClose} title={initial ? t.add.editTitle : t.add.title}>
      <div className="space-y-4 pt-1">
        {(japanese || reading) && (
          <div className="rounded-3xl bg-bg-2 px-4 py-3 text-center">
            <span className="text-[12px] text-faint">{t.add.preview}</span>
            <div className="jp-serif text-[40px] leading-[1.5]">
              <WordJP word={{ japanese: japanese || reading, kana: reading }} />
            </div>
          </div>
        )}
        <Field label={t.add.japanese} hint={t.add.japaneseHint}>
          <KanaInput value={japanese} onValueChange={setJapanese} className={inputCls} placeholder="食べる / taberu" enterKeyHint="next" />
        </Field>
        {(hasKanji(japanese) || kana) && (
          <Field label={t.add.kana}>
            <KanaInput value={kana} onValueChange={setKana} className={inputCls} placeholder="たべる / taberu" enterKeyHint="next" />
          </Field>
        )}
        <Field label={t.add.en} hint={t.add.synonymsHint}>
          <input value={en} onChange={(e) => setEn(e.target.value)} className={inputCls} placeholder="to eat" autoCapitalize="off" />
        </Field>
        <Field label={t.add.pl}>
          <input value={pl} onChange={(e) => setPl(e.target.value)} className={inputCls} placeholder="jeść" autoCapitalize="off" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t.add.type}>
            <select value={effectiveType} onChange={(e) => setType(e.target.value as WordType)} className={inputCls}>
              {WORD_TYPES.map((wt) => (
                <option key={wt} value={wt}>
                  {t.types[wt]}
                  {!type && wt === guess.type ? ` (${t.add.guessed})` : ''}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t.add.lesson}>
            <select value={lesson} onChange={(e) => setLesson(Number(e.target.value))} className={inputCls}>
              {Array.from({ length: Math.max(maxLesson, 23) + 1 }, (_, i) => (
                <option key={i} value={i}>
                  {i === 0 ? '—' : t.common.lesson(i)}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label={t.add.tags}>
          <input value={tags} onChange={(e) => setTags(e.target.value)} className={inputCls} placeholder="food, verbs" autoCapitalize="off" />
        </Field>
        <Field label={t.add.exampleJa} hint={t.add.exampleHint}>
          <KanaInput value={exJa} onValueChange={setExJa} mode="off" className={inputCls} placeholder="{毎日|まいにち} *{食べます|たべます}*。" />
        </Field>
        {exJa && (
          <div className="rounded-2xl bg-bg-2 px-4 py-2">
            <SentenceJP markup={fromAnkiFurigana(exJa)} highlight className="text-[18px] leading-[2]" />
          </div>
        )}
        {exJa && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t.add.exampleEn}>
              <input value={exEn} onChange={(e) => setExEn(e.target.value)} className={inputCls} />
            </Field>
            <Field label={t.add.examplePl}>
              <input value={exPl} onChange={(e) => setExPl(e.target.value)} className={inputCls} />
            </Field>
          </div>
        )}
        {error && <p className="text-[14px] text-accent">{error}</p>}
        <div className="flex gap-2 pt-1">
          <Button variant="ghost" className="flex-1" onClick={onClose}>
            {t.common.cancel}
          </Button>
          <Button variant="primary" className="flex-[2]" onClick={save}>
            {t.common.save}
          </Button>
        </div>
      </div>
    </Sheet>
  )
}

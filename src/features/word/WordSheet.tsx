import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { SentenceJP, WordJP, fitSize } from '../../components/Furigana'
import { IconEdit, IconTrash } from '../../components/icons'
import { SpeakButton, wordSpeech } from '../../components/SpeakButton'
import { Button, Sheet, useToast } from '../../components/ui'
import { db } from '../../lib/db'
import { exampleTranslation, relativeDay, useLang, useT } from '../../lib/i18n'
import { stripMarkup } from '../../lib/jp/markup'
import { computeProgress } from '../../lib/progress'
import { resetWord, suspendWord } from '../../lib/srs/cards'
import { lessonTitle, type VocabEntry } from '../../lib/vocab'
import { useVocab } from '../../lib/vocab-context'
import { deleteWord, setMnemonic } from '../../lib/words'
import { AddWordSheet } from '../library/AddWordSheet'
import { ConjugationTable } from './ConjugationTable'

const Ctx = createContext<(id: string) => void>(() => {})
export const useOpenWord = () => useContext(Ctx)

export function WordSheetProvider({ children }: { children: ReactNode }) {
  const [id, setId] = useState<string | null>(null)
  const open = useCallback((x: string) => setId(x), [])
  return (
    <Ctx.Provider value={open}>
      {children}
      <WordSheet id={id} onClose={() => setId(null)} />
    </Ctx.Provider>
  )
}

function WordSheet({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { byId } = useVocab()
  const word = id ? byId.get(id) : undefined
  const [editing, setEditing] = useState(false)
  return (
    <>
      <Sheet open={!!word && !editing} onClose={onClose}>
        {word && <WordDetail word={word} onEdit={() => setEditing(true)} onDeleted={onClose} />}
      </Sheet>
      {word && <AddWordSheet open={editing} onClose={() => setEditing(false)} initial={word} />}
    </>
  )
}

function WordDetail({ word, onEdit, onDeleted }: { word: VocabEntry; onEdit: () => void; onDeleted: () => void }) {
  const t = useT()
  const lang = useLang()
  const toast = useToast()
  const data = useLiveQuery(async () => {
    const [cards, logs] = await Promise.all([
      db.cards.where('wordId').equals(word.id).toArray(),
      db.reviewLogs.where('wordId').equals(word.id).toArray(),
    ])
    return { cards, logs }
  }, [word.id])
  const p = data ? computeProgress(data.cards, data.logs).get(word.id) : undefined
  const [mn, setMn] = useState(word.mnemonic ?? '')
  useEffect(() => setMn(word.mnemonic ?? ''), [word.id, word.mnemonic])
  const primary = lang === 'pl' ? word.pl || word.en : word.en || word.pl
  const secondary = lang === 'pl' ? word.en : word.pl
  const title = lessonTitle(word.genkiLesson)

  return (
    <div className="pb-2">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div style={{ fontSize: fitSize(word.japanese, 60) }}>
            <WordJP word={word} className="jp-serif ruby-display" />
          </div>
          <p className="mt-1 text-[13px] tracking-wide text-faint">{word.romaji}</p>
        </div>
        <SpeakButton text={wordSpeech(word)} size="lg" />
      </div>

      <p className="mt-3 text-[20px] leading-snug">{primary}</p>
      {secondary && <p className="mt-0.5 text-[15px] text-muted">{secondary}</p>}

      <div className="mt-3 flex flex-wrap gap-1.5 text-[12px]">
        <span className="rounded-full bg-raised px-2.5 py-1 text-muted">{t.types[word.type]}</span>
        <span className="rounded-full bg-raised px-2.5 py-1 text-muted">
          {t.common.lesson(word.genkiLesson)}
          {title ? ` · ${title[lang]}` : ''}
        </span>
        {word.tags.map((tag) => (
          <span key={tag} className="rounded-full border border-line px-2.5 py-1 text-faint">
            {tag}
          </span>
        ))}
        {word.source === 'user' && <span className="rounded-full bg-easy/15 px-2.5 py-1 text-easy">{t.library.mine}</span>}
      </div>

      {word.verify && (
        <p className="mt-3 rounded-2xl border border-warn/40 bg-warn/10 px-3.5 py-2.5 text-[14px] text-warn">
          <b>{t.common.needsCheck}:</b> {word.verify}
        </p>
      )}

      {word.example && (
        <section className="mt-5 rounded-3xl bg-bg-2 p-4">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <SentenceJP markup={word.example.ja} highlight className="text-[19px] leading-[2]" />
              <p className="mt-1 text-[14px] text-muted">{exampleTranslation(word.example, lang)}</p>
            </div>
            <SpeakButton text={stripMarkup(word.example.ja)} size="sm" />
          </div>
        </section>
      )}

      <ConjugationTable word={word} />

      <section className="mt-5">
        <h3 className="mb-2 text-[13px] font-semibold text-muted">{t.word.stats}</h3>
        {!p || p.status === 'new' ? (
          <p className="text-[15px] text-faint">{t.word.notStarted}</p>
        ) : (
          <div className="grid grid-cols-2 gap-2 text-[14px]">
            <Stat label={t.word.seen(p.attempts)} value={p.attempts ? t.word.accuracy(Math.round((p.correct / p.attempts) * 100)) : '—'} />
            <Stat label={p.due ? t.word.nextReview(relativeDay(p.due, lang)) : '—'} value={p.stability ? t.word.stability(t.common.days(Math.max(1, Math.round(p.stability)))) : ''} />
          </div>
        )}
        {p?.leech && <p className="mt-2 text-[14px] text-accent">● {t.word.leech}</p>}
      </section>

      <section className="mt-5">
        <label htmlFor="mnemonic" className="mb-2 block text-[13px] font-semibold text-muted">
          {t.common.mnemonic}
        </label>
        <textarea
          id="mnemonic"
          value={mn}
          onChange={(e) => setMn(e.target.value)}
          onBlur={() => mn !== (word.mnemonic ?? '') && setMnemonic(word, mn).then(() => toast({ text: t.common.saved, tone: 'good' }))}
          placeholder={t.word.mnemonicPlaceholder}
          rows={2}
          className="w-full resize-none rounded-2xl border border-line bg-bg-2 px-3.5 py-3 text-[16px] placeholder:text-faint focus:border-accent/60 focus:outline-none"
        />
        <p className="mt-1 text-[12px] text-faint">{t.word.mnemonicHint}</p>
      </section>

      <div className="mt-6 flex flex-wrap gap-2">
        <Button size="sm" onClick={onEdit}>
          <IconEdit size={16} /> {t.common.edit}
        </Button>
        <Button size="sm" onClick={() => suspendWord(word.id, !p?.suspended)}>
          {p?.suspended ? t.word.unsuspend : t.word.suspend}
        </Button>
        {p && p.status !== 'new' && (
          <Button size="sm" onClick={() => resetWord(word.id).then(() => toast({ text: t.common.done }))}>
            {t.word.resetProgress}
          </Button>
        )}
        <Button
          size="sm"
          variant="danger"
          onClick={() => {
            if (confirm(t.word.deleteConfirm)) void deleteWord(word).then(onDeleted)
          }}
        >
          <IconTrash size={16} /> {t.common.delete}
        </Button>
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-2xl bg-bg-2 px-3.5 py-3">
      <div className="text-text">{value}</div>
      <div className="text-[12px] text-faint">{label}</div>
    </div>
  )
}

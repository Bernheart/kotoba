import { useState } from 'react'
import { useLocation } from 'wouter'
import { Chip, Segmented } from '../../components/ui'
import { inScope } from '../../lib/decks'
import { useT } from '../../lib/i18n'
import { ADJ_FORMS, FORM_LESSON, isAdj, isVerb, VERB_FORMS, type Form } from '../../lib/jp/conjugate'
import { makeQuestions, unlockedForms, type Question } from '../../lib/practice'
import { useSettings } from '../../lib/settings'
import { useVocab } from '../../lib/vocab-context'
import { formLabel } from '../word/ConjugationTable'
import { PracticeSetup, type SetupValue } from './PracticeSetup'
import { QuizRunner } from './QuizRunner'

/**
 * Conjugation drills. Forms are interleaved by default (mixing forms and verb classes beats blocked
 * practice across sessions — Pan et al. 2019); picking a single form gives a blocked warm-up.
 */
export function ConjugationPage() {
  const t = useT()
  const s = useSettings()
  const [, navigate] = useLocation()
  const { words } = useVocab()
  const [kinds, setKinds] = useState<'verbs' | 'adjectives' | 'both'>('verbs')
  const [forms, setForms] = useState<Form[]>(() => unlockedForms(s.currentLesson))
  const [questions, setQuestions] = useState<Question[] | null>(null)
  const [last, setLast] = useState<SetupValue | null>(null)

  const start = (v: SetupValue) => {
    setLast(v)
    const pool = words.filter(
      (w) => inScope(w, v.lessons, v.decks) && ((kinds !== 'adjectives' && isVerb(w.type)) || (kinds !== 'verbs' && isAdj(w.type))),
    )
    setQuestions(makeQuestions('conj', pool, v.count, { forms }))
  }

  if (questions)
    return <QuizRunner key={questions[0]?.id ?? 'x'} initial={questions} title={t.conj.title} onExit={() => navigate('/study')} onRestart={() => last && start(last)} />

  const shown = kinds === 'verbs' ? VERB_FORMS : kinds === 'adjectives' ? ADJ_FORMS : [...VERB_FORMS, ...ADJ_FORMS]
  const toggle = (f: Form) => setForms((fs) => (fs.includes(f) ? fs.filter((x) => x !== f) : [...fs, f]))
  return (
    <PracticeSetup title={t.conj.title} description={t.study.conjugationDesc} onStart={start} hint={t.conj.unlocked(s.currentLesson)}>
      <section className="mt-5">
        <h2 className="mb-2 text-[13px] font-semibold text-muted">{t.conj.words}</h2>
        <Segmented
          value={kinds}
          onChange={setKinds}
          options={[
            { value: 'verbs', label: t.conj.verbs },
            { value: 'adjectives', label: t.conj.adjectives },
            { value: 'both', label: t.common.all },
          ]}
        />
      </section>
      <section className="mt-5">
        <h2 className="mb-2 text-[13px] font-semibold text-muted">{t.conj.forms}</h2>
        <div className="flex flex-wrap gap-2">
          {shown.map((f) => (
            <Chip key={f} active={forms.includes(f)} onClick={() => toggle(f)} className={FORM_LESSON[f] > s.currentLesson ? 'opacity-60' : ''}>
              <span lang="ja">{formLabel(t, f)}</span>
              <span className="text-[11px] text-faint">L{FORM_LESSON[f]}</span>
            </Chip>
          ))}
        </div>
      </section>
    </PracticeSetup>
  )
}

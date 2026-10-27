import { dayDiff, studyDay } from '../time'
import { useSettings } from '../settings'
import type { Lang, Word } from '../types'
import { en, type Dict } from './en'
import { pl } from './pl'

export const DICTS: Record<Lang, Dict> = { en, pl }

export function useT(): Dict {
  return DICTS[useSettings().lang]
}

export function useLang(): Lang {
  return useSettings().lang
}

/** Meaning in the chosen language, falling back to the other one. */
export function meaning(w: Pick<Word, 'en' | 'pl'>, lang: Lang): string {
  return (lang === 'pl' ? w.pl || w.en : w.en || w.pl) ?? ''
}

export function exampleTranslation(ex: { en: string; pl: string }, lang: Lang): string {
  return lang === 'pl' ? ex.pl || ex.en : ex.en || ex.pl
}

export function relativeDay(ms: number, lang: Lang): string {
  const diff = ms - Date.now()
  const rtf = new Intl.RelativeTimeFormat(lang, { numeric: 'auto' })
  const abs = Math.abs(diff)
  if (abs < 3_600_000) return rtf.format(Math.round(diff / 60_000), 'minute')
  // Days are counted in study days (04:00 rollover), so a card due in 4 days says "in 4 days", not "in 3".
  const days = dayDiff(studyDay(), studyDay(ms))
  if (abs < 86_400_000 && days === 0) return rtf.format(Math.round(diff / 3_600_000), 'hour')
  if (Math.abs(days) < 30) return rtf.format(days, 'day')
  if (abs < 365 * 86_400_000) return rtf.format(Math.round(diff / (30 * 86_400_000)), 'month')
  return rtf.format(Math.round(diff / (365 * 86_400_000)), 'year')
}

/** Compact interval label for rating buttons: 1m · 10m · 3d · 2mo */
export function shortInterval(ms: number): string {
  const m = ms / 60_000
  if (m < 60) return `${Math.max(1, Math.round(m))}m`
  const h = m / 60
  if (h < 24) return `${Math.round(h)}h`
  const d = h / 24
  if (d < 30) return `${Math.round(d)}d`
  const mo = d / 30
  if (mo < 12) return `${Math.round(mo * 10) / 10}mo`
  return `${Math.round((d / 365) * 10) / 10}y`
}

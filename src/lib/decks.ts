import type { Word } from './types'

/**
 * Custom decks: imported word sets (e.g. vocabulary mined from a show) that live only in your own words
 * (IndexedDB + your sync), with their own review queue and new-word limit. They never mix into the main,
 * lesson-gated reviews.
 */

/** Words of the main (Genki + own words) study track. */
export const isMainWord = (w: Pick<Word, 'deck'>) => !w.deck

/** Display name of a deck id: `arcane` → `Arcane`, `my-show` → `My show`. */
export function deckLabel(deck: string): string {
  const s = deck.replace(/-/g, ' ')
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/** Practice / library scope: deck words count when their deck is selected, other words when their lesson is. */
export function inScope(w: Pick<Word, 'deck' | 'genkiLesson'>, lessons: number[], decks: string[]): boolean {
  return w.deck ? decks.includes(w.deck) : lessons.includes(w.genkiLesson)
}

/** Deck words in study order: frequency rank first, words without a rank last (keeping their order). */
export function byFrequency<T extends Pick<Word, 'frequency'>>(words: T[]): T[] {
  return [...words].sort((a, b) => (a.frequency ?? Infinity) - (b.frequency ?? Infinity))
}

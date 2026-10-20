import type { WordProgress } from './progress'
import type { Word } from './types'

/** A deck of character / place names (e.g. `arcane-names`, made by tools/arcane). */
export const isNamesDeck = (deck?: string) => !!deck && deck.endsWith('-names')
/** A deck of grammar points (〜べき, 〜ぞ…): patterns, not words, so asbplayer has nothing to match. */
export const isGrammarDeck = (deck?: string) => !!deck && deck.endsWith('-grammar')
/** A deck of words you already know, seen in a show (e.g. `arcane-known`): treated like your lesson words. */
export const isKnownDeck = (deck?: string) => !!deck && deck.endsWith('-known')

/** asbplayer's word statuses (TokenStatus) and the "ignored" state. */
export const ASB_STATUS = { uncollected: 0, unknown: 1, learning: 2, graduated: 3, young: 4, mature: 5 } as const
const IGNORED_STATE = 0

/** Non-words in the subtitles that should never be coloured. */
export const ASB_ALWAYS_IGNORED = ['NETFLIX']

/** One entry of asbplayer's word export / import (Settings → Annotation → Import Words → Import From File). */
export interface AsbRecord {
  profile: string
  token: string
  status: number
  states?: number[]
}

/**
 * Your words for asbplayer's word database, each with a status, so its subtitle colouring matches what you
 * study:
 * - deck words you're learning from a show (e.g. Arcane's top 300): not trained → Unknown, trained → Learning;
 * - lesson words, your own words and `-known` decks: not trained → Graduated, trained → Young;
 * - anything Kotoba counts as known (held 21+ days) → Mature;
 * - names decks (and NETFLIX) → ignored; grammar decks are left out.
 * One record per written form: ignored wins, otherwise the highest status.
 */
export function asbplayerRecords(
  words: Pick<Word, 'id' | 'japanese' | 'deck'>[],
  progress: Map<string, WordProgress>,
  profile = 'Default',
): AsbRecord[] {
  const status = new Map<string, number>()
  const ignored = new Set<string>(ASB_ALWAYS_IGNORED)
  for (const w of words) {
    if (isGrammarDeck(w.deck)) continue
    const token = w.japanese.replace(/[～〜]/g, '').trim()
    if (!token) continue
    if (isNamesDeck(w.deck)) {
      ignored.add(token)
      continue
    }
    const p = progress.get(w.id)?.status ?? 'new'
    const learningDeck = !!w.deck && !isKnownDeck(w.deck)
    const s =
      p === 'known'
        ? ASB_STATUS.mature
        : p === 'learning'
          ? learningDeck
            ? ASB_STATUS.learning
            : ASB_STATUS.young
          : learningDeck
            ? ASB_STATUS.unknown
            : ASB_STATUS.graduated
    status.set(token, Math.max(s, status.get(token) ?? 0))
  }
  const out: AsbRecord[] = []
  for (const [token, s] of status) if (!ignored.has(token)) out.push({ profile, token, status: s })
  for (const token of ignored) out.push({ profile, token, status: ASB_STATUS.uncollected, states: [IGNORED_STATE] })
  return out
}

export function asbplayerFile(records: AsbRecord[], now = new Date()): File {
  const day = now.toISOString().slice(0, 10)
  return new File([JSON.stringify(records)], `kotoba-asbplayer-words-${day}.json`, { type: 'application/json' })
}

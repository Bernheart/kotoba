export const WORD_TYPES = [
  'noun',
  'pronoun',
  'verb-u',
  'verb-ru',
  'verb-irr',
  'i-adj',
  'na-adj',
  'adverb',
  'particle',
  'expression',
  'counter',
  'number',
  'question',
  'conjunction',
  'prefix',
  'suffix',
] as const

export type WordType = (typeof WORD_TYPES)[number]

export interface ExampleSentence {
  /** Markup: `{漢字|かんじ}` ruby, spaces = tile boundaries, `*…*` = target word. */
  ja: string
  /** Optional full reading; derived from `ja` when omitted. */
  kana?: string
  en: string
  pl: string
  /** Where the line comes from, e.g. `S1E3 · 12:34` (episode · time) for lines taken from a show. */
  ref?: string
}

export interface Word {
  id: string
  /** Standard written form (kanji when normally written with kanji, else kana). */
  japanese: string
  /** Reading in hiragana/katakana. */
  kana: string
  romaji?: string
  /** Furigana override in markup when auto-alignment is wrong, e.g. `{今日|きょう}`. */
  furigana?: string
  /** Other accepted readings/spellings in typing quizzes (e.g. 何 → なん). */
  alt?: string[]
  /** Text for speech synthesis when the word alone is read wrongly (e.g. particle は → わ). */
  tts?: string
  /** Synonyms separated by "; ". */
  en: string
  pl: string
  type: WordType
  genkiLesson: number
  tags: string[]
  example?: ExampleSentence
  difficulty?: 1 | 2 | 3
  /** Rank in a frequency list (1 = most frequent); custom decks introduce new words in this order. */
  frequency?: number
  /** Custom deck id (e.g. `arcane`). Deck words are studied in their own queue, never in the main reviews. */
  deck?: string
  /** Note for the user to double-check this entry. */
  verify?: string
  /** Where the word comes from — set at load time. */
  source?: 'builtin' | 'user'
}

export interface LessonFile {
  lesson: number
  title: { en: string; pl: string; ja?: string }
  words: Word[]
}

export type Lang = 'en' | 'pl'
export type Direction = 'recog' | 'recall'

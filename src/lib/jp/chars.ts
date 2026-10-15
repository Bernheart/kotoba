// Character classes and kana normalization shared by furigana, search and answer checking.

const KANJI_CHAR = /[㐀-䶿一-鿿豈-﫿々〆ヵヶ]/
const HAS_KANJI = /[㐀-䶿一-鿿豈-﫿々〆]/
const KANA_ONLY = /^[ぁ-ゟ゠-ヿㇰ-ㇿー～〜・、。！？\s]+$/u

export const isKanji = (ch: string) => KANJI_CHAR.test(ch)
export const hasKanji = (s: string) => HAS_KANJI.test(s)
export const isKanaOnly = (s: string) => KANA_ONLY.test(s)
export const isKatakanaWord = (s: string) => /^[゠-ヿー・]+$/.test(s)

/** Katakana → hiragana by code point shift (ァ..ヶ → ぁ..ゖ); other chars untouched. */
export function kataToHira(s: string): string {
  let out = ''
  for (const ch of s) {
    const c = ch.codePointAt(0)!
    out += c >= 0x30a1 && c <= 0x30f6 ? String.fromCodePoint(c - 0x60) : ch
  }
  return out
}

const VOWEL_OF: Record<string, string> = {}
const ROWS: [string, string][] = [
  ['あかさたなはまやらわがざだばぱぁゃゎ', 'あ'],
  ['いきしちにひみりぎじぢびぴぃ', 'い'],
  ['うくすつぬふむゆるぐずづぶぷぅゅっゔ', 'う'],
  ['えけせてねへめれげぜでべぺぇ', 'え'],
  ['おこそとのほもよろをごぞどぼぽぉょ', 'お'],
]
for (const [chars, v] of ROWS) for (const ch of chars) VOWEL_OF[ch] = v

/**
 * Canonical kana for comparisons: hiragana, long-vowel mark expanded (コーヒー → こおひい),
 * no whitespace, no ～ or punctuation. Romaji and kanji pass through unchanged.
 */
export function normalizeKana(s: string): string {
  const hira = kataToHira(s.normalize('NFKC'))
  let out = ''
  for (const ch of hira) {
    if (ch === 'ー') {
      const prev = out.at(-1)
      out += (prev && VOWEL_OF[prev]) || ''
      continue
    }
    if (/[\s～〜~・、。！？!?「」『』（）()…\-—.,]/.test(ch)) continue
    out += ch
  }
  return out
}

export function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

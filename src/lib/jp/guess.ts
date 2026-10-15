import type { WordType } from '../types'
import { isKatakanaWord, kataToHira } from './chars'

/** Common る-ending u-verbs that look like ru-verbs (ichidan look-alikes). */
const U_VERBS_ENDING_IRU_ERU = new Set([
  'かえる', 'はいる', 'しる', 'きる', 'いる', 'はしる', 'しゃべる', 'へる', 'かぎる', 'すべる', 'にぎる', 'ける', 'あせる',
  'まいる', 'いじる', 'ちる', 'まじる', 'ひねる', 'つねる', 'ねる', 'にる',
])
/** Words whose ambiguous forms are usually the ru-verb in beginner material */
const RU_PREFERRED = new Set(['きる', 'いる', 'ねる', 'にる'])

const E_ROW = 'えけげせぜてでねへべぺめれ'
const I_ROW = 'いきぎしじちぢにひびぴみり'
const NA_ADJ_I = new Set(['きれい', 'きらい', 'ゆうめい', 'しつれい', 'とくい', 'ていねい', 'あいまい', 'けっこう'])

export interface Guess {
  type: WordType
  confident: boolean
}

/**
 * Guess a word type from its reading and meaning. Verbs are detected from English "to …";
 * ru/u split by the vowel before る (with a list of exceptions).
 */
export function guessType(kana: string, en = '', japanese = ''): Guess {
  const k = kataToHira(kana.trim())
  const e = en.trim().toLowerCase()
  if (!k) return { type: 'noun', confident: false }
  if (k.startsWith('～') || k.startsWith('〜')) return { type: /\d|counter|counting|o'clock|years old/.test(e) ? 'counter' : 'suffix', confident: false }
  if (k.endsWith('～') || k.endsWith('〜')) return { type: 'prefix', confident: false }
  if (isKatakanaWord(kana)) return { type: e.startsWith('to ') ? 'verb-irr' : 'noun', confident: !e.startsWith('to ') }
  const isVerb = /^to\s/.test(e) || /\(v\)|verb/.test(e)
  if (isVerb) {
    if (k.endsWith('する')) return { type: 'verb-irr', confident: true }
    if (k === 'くる' || japanese === '来る') return { type: 'verb-irr', confident: true }
    if (k.endsWith('る')) {
      const before = k.at(-2) ?? ''
      if (E_ROW.includes(before) || I_ROW.includes(before)) {
        if (U_VERBS_ENDING_IRU_ERU.has(k) && !RU_PREFERRED.has(k)) return { type: 'verb-u', confident: false }
        return { type: 'verb-ru', confident: !RU_PREFERRED.has(k) && !U_VERBS_ENDING_IRU_ERU.has(k) }
      }
      return { type: 'verb-u', confident: true }
    }
    if (/[うくぐすつぬぶむ]$/.test(k)) return { type: 'verb-u', confident: true }
  }
  if (NA_ADJ_I.has(k)) return { type: 'na-adj', confident: true }
  if (k.endsWith('い') && !E_ROW.includes(k.at(-2) ?? '') && !/^(the|a|an)\s/.test(e) && e.split(/[;,]/)[0]!.trim().split(' ').length <= 2) {
    return { type: 'i-adj', confident: false }
  }
  if (/^(where|what|who|when|why|how|which)\b/.test(e)) return { type: 'question', confident: true }
  if (/^(very|often|sometimes|always|usually|not much|not at all|already|still|soon|together|a little)\b/.test(e))
    return { type: 'adverb', confident: false }
  return { type: 'noun', confident: false }
}

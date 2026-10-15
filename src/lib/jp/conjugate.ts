import type { Lang, Word, WordType } from '../types'

export type VerbForm =
  | 'masu'
  | 'masen'
  | 'mashita'
  | 'masendeshita'
  | 'mashou'
  | 'te'
  | 'plain'
  | 'nai'
  | 'ta'
  | 'nakatta'
  | 'tai'
export type AdjForm =
  | 'adjPresent'
  | 'adjNeg'
  | 'adjPast'
  | 'adjPastNeg'
  | 'adjTe'
  | 'adjPlainNeg'
  | 'adjPlainPast'
  | 'adjAdverb'
  | 'adjNaru'
export type Form = VerbForm | AdjForm

/** Genki lesson in which each form is introduced (used to unlock drills). */
export const FORM_LESSON: Record<Form, number> = {
  masu: 3,
  masen: 3,
  mashita: 4,
  masendeshita: 4,
  mashou: 5,
  te: 6,
  plain: 8,
  nai: 8,
  ta: 9,
  nakatta: 9,
  tai: 11,
  adjPresent: 5,
  adjNeg: 5,
  adjPast: 5,
  adjPastNeg: 5,
  adjTe: 7,
  adjPlainNeg: 8,
  adjPlainPast: 9,
  adjAdverb: 10,
  adjNaru: 10,
}

export const VERB_FORMS: VerbForm[] = ['masu', 'masen', 'mashita', 'masendeshita', 'mashou', 'te', 'plain', 'nai', 'ta', 'nakatta', 'tai']
export const ADJ_FORMS: AdjForm[] = ['adjNeg', 'adjPast', 'adjPastNeg', 'adjTe', 'adjPlainNeg', 'adjPlainPast', 'adjAdverb', 'adjNaru']

export const isVerb = (t: WordType) => t === 'verb-u' || t === 'verb-ru' || t === 'verb-irr'
export const isAdj = (t: WordType) => t === 'i-adj' || t === 'na-adj'

const U_I: Record<string, string> = { う: 'い', く: 'き', ぐ: 'ぎ', す: 'し', つ: 'ち', ぬ: 'に', ぶ: 'び', む: 'み', る: 'り' }
const U_A: Record<string, string> = { う: 'わ', く: 'か', ぐ: 'が', す: 'さ', つ: 'た', ぬ: 'な', ぶ: 'ば', む: 'ま', る: 'ら' }
const U_TE: Record<string, string> = { う: 'って', つ: 'って', る: 'って', む: 'んで', ぶ: 'んで', ぬ: 'んで', く: 'いて', ぐ: 'いで', す: 'して' }
/** Honorific verbs whose ます-stem ends in い (いらっしゃる → いらっしゃいます) */
const HONORIFIC_I = /(いらっしゃる|くださる|なさる|おっしゃる|ござる)$/

export interface Conjugated {
  japanese: string
  kana: string
}

type Stems = { masu: string; nai: string; te: string; ta: string }

function verbStems(dict: string, type: WordType): Stems | null {
  if (type === 'verb-irr') {
    // する (incl. 勉強する), 来る / くる (incl. 持ってくる)
    if (dict.endsWith('する')) {
      const b = dict.slice(0, -2)
      return { masu: b + 'し', nai: b + 'し', te: b + 'して', ta: b + 'した' }
    }
    if (dict.endsWith('来る')) {
      const b = dict.slice(0, -1) // written form keeps 来: 来ます · 来ない · 来て
      return { masu: b, nai: b, te: b + 'て', ta: b + 'た' }
    }
    if (dict.endsWith('くる')) {
      const b = dict.slice(0, -2)
      return { masu: b + 'き', nai: b + 'こ', te: b + 'きて', ta: b + 'きた' }
    }
  }
  if (type === 'verb-ru') {
    if (!dict.endsWith('る')) return null
    const b = dict.slice(0, -1)
    return { masu: b, nai: b, te: b + 'て', ta: b + 'た' }
  }
  if (type === 'verb-u' || type === 'verb-irr') {
    const last = dict.at(-1)!
    const b = dict.slice(0, -1)
    if (!(last in U_I)) return null
    // 行く (and compounds like 出て行く) → 行って
    const te = /(行く|いく)$/.test(dict) ? b + 'って' : b + U_TE[last]
    const masu = HONORIFIC_I.test(dict) ? b + 'い' : b + U_I[last]
    return { masu, nai: b + U_A[last], te, ta: te.slice(0, -1) + (te.endsWith('で') ? 'だ' : 'た') }
  }
  return null
}

function conjVerbString(dict: string, type: WordType, form: VerbForm): string | null {
  // ある: the negative is ない, not あらない
  if ((dict === 'ある' || dict === '有る') && (form === 'nai' || form === 'nakatta')) return form === 'nai' ? 'ない' : 'なかった'
  const s = verbStems(dict, type)
  if (!s) return null
  switch (form) {
    case 'plain':
      return dict
    case 'masu':
      return s.masu + 'ます'
    case 'masen':
      return s.masu + 'ません'
    case 'mashita':
      return s.masu + 'ました'
    case 'masendeshita':
      return s.masu + 'ませんでした'
    case 'mashou':
      return s.masu + 'ましょう'
    case 'tai':
      return s.masu + 'たい'
    case 'te':
      return s.te
    case 'ta':
      return s.ta
    case 'nai':
      return s.nai + 'ない'
    case 'nakatta':
      return s.nai + 'なかった'
  }
}

function conjAdjString(base: string, type: WordType, form: AdjForm): string | null {
  if (type === 'i-adj') {
    if (!base.endsWith('い')) return null
    // いい / かっこいい / 頭がいい → よ-
    const stem = /いい$/.test(base) ? base.slice(0, -2) + 'よ' : base.slice(0, -1)
    switch (form) {
      case 'adjPresent':
        return base + 'です'
      case 'adjNeg':
        return stem + 'くないです'
      case 'adjPast':
        return stem + 'かったです'
      case 'adjPastNeg':
        return stem + 'くなかったです'
      case 'adjTe':
        return stem + 'くて'
      case 'adjPlainNeg':
        return stem + 'くない'
      case 'adjPlainPast':
        return stem + 'かった'
      case 'adjAdverb':
        return stem + 'く'
      case 'adjNaru':
        return stem + 'くなる'
    }
  }
  if (type === 'na-adj') {
    switch (form) {
      case 'adjPresent':
        return base + 'です'
      case 'adjNeg':
        return base + 'じゃないです'
      case 'adjPast':
        return base + 'でした'
      case 'adjPastNeg':
        return base + 'じゃなかったです'
      case 'adjTe':
        return base + 'で'
      case 'adjPlainNeg':
        return base + 'じゃない'
      case 'adjPlainPast':
        return base + 'だった'
      case 'adjAdverb':
        return base + 'に'
      case 'adjNaru':
        return base + 'になる'
    }
  }
  return null
}

/** Conjugate a verb or adjective. Returns null when the word/form combination doesn't apply. */
export function conjugate(w: Pick<Word, 'japanese' | 'kana' | 'type'>, form: Form): Conjugated | null {
  const kana = w.kana.replace(/[～〜]/g, '')
  const jp = w.japanese.replace(/[～〜]/g, '')
  if (isVerb(w.type)) {
    if (!(VERB_FORMS as string[]).includes(form)) return null
    const k = conjVerbString(kana, w.type, form as VerbForm)
    const j = conjVerbString(jp, w.type, form as VerbForm)
    return k && j ? { japanese: j, kana: k } : null
  }
  if (isAdj(w.type)) {
    if (!(ADJ_FORMS as string[]).includes(form) && form !== 'adjPresent') return null
    const k = conjAdjString(kana, w.type, form as AdjForm)
    const j = conjAdjString(jp, w.type, form as AdjForm)
    return k && j ? { japanese: j, kana: k } : null
  }
  return null
}

export function formsFor(type: WordType): Form[] {
  if (isVerb(type)) return VERB_FORMS
  if (isAdj(type)) return ADJ_FORMS
  return []
}

/** One-line rule shown after a wrong answer (Tae Kim style: rule from the dictionary form). */
export function ruleFor(w: Pick<Word, 'japanese' | 'kana' | 'type'>, form: Form, lang: Lang): string {
  const pl = lang === 'pl'
  const kana = w.kana.replace(/[～〜]/g, '')
  const last = kana.at(-1) ?? ''
  if (w.type === 'verb-irr') {
    if (kana.endsWith('する')) return pl ? 'する jest nieregularne: し-ます · し-ない · して · した' : 'する is irregular: し-ます · し-ない · して · した'
    return pl ? '来る (くる) jest nieregularne: きます · こない · きて · きた' : '来る (くる) is irregular: きます · こない · きて · きた'
  }
  if (w.type === 'verb-ru') {
    const map: Partial<Record<Form, string>> = { te: 'る → て', ta: 'る → た', nai: 'る → ない', nakatta: 'る → なかった' }
    const r = map[form] ?? 'る → ます / ません / ました…'
    return pl ? `Czasownik ru: usuń る — ${r}` : `Ru-verb: drop る — ${r}`
  }
  if (w.type === 'verb-u') {
    if (form === 'te' || form === 'ta') {
      if (/(行く|いく)$/.test(kana) || w.japanese.endsWith('行く'))
        return pl ? 'Wyjątek: 行く → 行って / 行った' : 'Exception: 行く → 行って / 行った'
      const te = U_TE[last]
      const t = form === 'ta' ? te?.replace(/て$/, 'た').replace(/で$/, 'だ') : te
      return pl ? `Czasownik u: ${last} → ${t}` : `U-verb: ${last} → ${t}`
    }
    if (form === 'nai' || form === 'nakatta') {
      if (kana === 'ある') return pl ? 'Wyjątek: ある → ない' : 'Exception: ある → ない'
      return pl
        ? `Czasownik u: ${last} → ${U_A[last]}ない${last === 'う' ? ' (う → わ!)' : ''}`
        : `U-verb: ${last} → ${U_A[last]}ない${last === 'う' ? ' (う → わ!)' : ''}`
    }
    if (form === 'plain') return pl ? 'Forma słownikowa = forma prosta' : 'Dictionary form = plain present'
    return pl ? `Czasownik u: ${last} → ${U_I[last]} + ます` : `U-verb: ${last} → ${U_I[last]} + ます`
  }
  if (w.type === 'i-adj') {
    if (/いい$/.test(kana)) return pl ? 'Wyjątek: いい odmienia się od よい — よくない, よかった, よくて' : 'Exception: いい conjugates from よい — よくない, よかった, よくて'
    const map: Partial<Record<Form, string>> = {
      adjNeg: 'い → くないです',
      adjPast: 'い → かったです',
      adjPastNeg: 'い → くなかったです',
      adjTe: 'い → くて',
      adjPlainNeg: 'い → くない',
      adjPlainPast: 'い → かった',
      adjAdverb: 'い → く',
      adjNaru: 'い → くなる',
    }
    return (pl ? 'Przymiotnik い: ' : 'い-adjective: ') + (map[form] ?? '')
  }
  if (w.type === 'na-adj') {
    const map: Partial<Record<Form, string>> = {
      adjNeg: '+ じゃないです',
      adjPast: '+ でした',
      adjPastNeg: '+ じゃなかったです',
      adjTe: '+ で',
      adjPlainNeg: '+ じゃない',
      adjPlainPast: '+ だった',
      adjAdverb: '+ に',
      adjNaru: '+ になる',
    }
    return (pl ? 'Przymiotnik な: ' : 'な-adjective: ') + (map[form] ?? '')
  }
  return ''
}

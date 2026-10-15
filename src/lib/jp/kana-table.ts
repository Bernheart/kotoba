import { toKatakana } from 'wanakana'

export interface KanaItem {
  hira: string
  romaji: string
  /** other accepted romaji (shi/si, chi/ti, tsu/tu, fu/hu, ji/zi …) */
  alt?: string[]
  group: 'basic' | 'dakuten' | 'yoon'
  row: string
}

const B = (row: string, pairs: [string, string, string[]?][], group: KanaItem['group'] = 'basic'): KanaItem[] =>
  pairs.map(([hira, romaji, alt]) => ({ hira, romaji, alt, group, row }))

export const KANA: KanaItem[] = [
  ...B('a', [['あ', 'a'], ['い', 'i'], ['う', 'u'], ['え', 'e'], ['お', 'o']]),
  ...B('ka', [['か', 'ka'], ['き', 'ki'], ['く', 'ku'], ['け', 'ke'], ['こ', 'ko']]),
  ...B('sa', [['さ', 'sa'], ['し', 'shi', ['si']], ['す', 'su'], ['せ', 'se'], ['そ', 'so']]),
  ...B('ta', [['た', 'ta'], ['ち', 'chi', ['ti']], ['つ', 'tsu', ['tu']], ['て', 'te'], ['と', 'to']]),
  ...B('na', [['な', 'na'], ['に', 'ni'], ['ぬ', 'nu'], ['ね', 'ne'], ['の', 'no']]),
  ...B('ha', [['は', 'ha'], ['ひ', 'hi'], ['ふ', 'fu', ['hu']], ['へ', 'he'], ['ほ', 'ho']]),
  ...B('ma', [['ま', 'ma'], ['み', 'mi'], ['む', 'mu'], ['め', 'me'], ['も', 'mo']]),
  ...B('ya', [['や', 'ya'], ['ゆ', 'yu'], ['よ', 'yo']]),
  ...B('ra', [['ら', 'ra'], ['り', 'ri'], ['る', 'ru'], ['れ', 're'], ['ろ', 'ro']]),
  ...B('wa', [['わ', 'wa'], ['を', 'wo', ['o']], ['ん', 'n', ['nn']]]),
  ...B('ga', [['が', 'ga'], ['ぎ', 'gi'], ['ぐ', 'gu'], ['げ', 'ge'], ['ご', 'go']], 'dakuten'),
  ...B('za', [['ざ', 'za'], ['じ', 'ji', ['zi']], ['ず', 'zu'], ['ぜ', 'ze'], ['ぞ', 'zo']], 'dakuten'),
  ...B('da', [['だ', 'da'], ['ぢ', 'ji', ['di']], ['づ', 'zu', ['du']], ['で', 'de'], ['ど', 'do']], 'dakuten'),
  ...B('ba', [['ば', 'ba'], ['び', 'bi'], ['ぶ', 'bu'], ['べ', 'be'], ['ぼ', 'bo']], 'dakuten'),
  ...B('pa', [['ぱ', 'pa'], ['ぴ', 'pi'], ['ぷ', 'pu'], ['ぺ', 'pe'], ['ぽ', 'po']], 'dakuten'),
  ...B('kya', [['きゃ', 'kya'], ['きゅ', 'kyu'], ['きょ', 'kyo']], 'yoon'),
  ...B('sha', [['しゃ', 'sha', ['sya']], ['しゅ', 'shu', ['syu']], ['しょ', 'sho', ['syo']]], 'yoon'),
  ...B('cha', [['ちゃ', 'cha', ['tya']], ['ちゅ', 'chu', ['tyu']], ['ちょ', 'cho', ['tyo']]], 'yoon'),
  ...B('nya', [['にゃ', 'nya'], ['にゅ', 'nyu'], ['にょ', 'nyo']], 'yoon'),
  ...B('hya', [['ひゃ', 'hya'], ['ひゅ', 'hyu'], ['ひょ', 'hyo']], 'yoon'),
  ...B('mya', [['みゃ', 'mya'], ['みゅ', 'myu'], ['みょ', 'myo']], 'yoon'),
  ...B('rya', [['りゃ', 'rya'], ['りゅ', 'ryu'], ['りょ', 'ryo']], 'yoon'),
  ...B('gya', [['ぎゃ', 'gya'], ['ぎゅ', 'gyu'], ['ぎょ', 'gyo']], 'yoon'),
  ...B('ja', [['じゃ', 'ja', ['zya', 'jya']], ['じゅ', 'ju', ['zyu', 'jyu']], ['じょ', 'jo', ['zyo', 'jyo']]], 'yoon'),
  ...B('bya', [['びゃ', 'bya'], ['びゅ', 'byu'], ['びょ', 'byo']], 'yoon'),
  ...B('pya', [['ぴゃ', 'pya'], ['ぴゅ', 'pyu'], ['ぴょ', 'pyo']], 'yoon'),
]

/** Look-alike groups worth drilling against each other (discrimination practice). */
export const CONFUSABLE_SETS: { script: 'hira' | 'kata'; chars: string[] }[] = [
  { script: 'kata', chars: ['シ', 'ツ', 'ソ', 'ン'] },
  { script: 'kata', chars: ['ク', 'ケ', 'タ', 'ワ', 'ウ'] },
  { script: 'kata', chars: ['ノ', 'メ', 'ヌ', 'ス'] },
  { script: 'kata', chars: ['コ', 'ユ', 'ヨ', 'ロ'] },
  { script: 'kata', chars: ['チ', 'テ', 'ナ'] },
  { script: 'kata', chars: ['フ', 'ラ', 'ヲ'] },
  { script: 'hira', chars: ['ぬ', 'め', 'ね', 'れ', 'わ'] },
  { script: 'hira', chars: ['さ', 'ち', 'き'] },
  { script: 'hira', chars: ['る', 'ろ'] },
  { script: 'hira', chars: ['は', 'ほ', 'け'] },
  { script: 'hira', chars: ['い', 'り', 'こ'] },
  { script: 'hira', chars: ['う', 'つ', 'ら'] },
]

export function kanaOf(item: KanaItem, script: 'hira' | 'kata'): string {
  return script === 'hira' ? item.hira : toKatakana(item.hira)
}

export function findKana(ch: string): KanaItem | undefined {
  return KANA.find((k) => k.hira === ch || toKatakana(k.hira) === ch)
}

export function romajiAccepted(item: KanaItem, input: string): boolean {
  const v = input.trim().toLowerCase()
  return v === item.romaji || (item.alt ?? []).includes(v)
}

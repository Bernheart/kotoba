import { describe, expect, it } from 'vitest'
import { alignFurigana } from '../src/lib/jp/furigana'
import { fromAnkiFurigana, parseMarkup } from '../src/lib/jp/markup'
import { isKanaOnly, kataToHira, normalizeKana } from '../src/lib/jp/chars'

describe('alignFurigana', () => {
  it('keeps okurigana bare', () => {
    expect(alignFurigana('食べる', 'たべる')).toEqual([{ text: '食', reading: 'た' }, { text: 'べる' }])
    expect(alignFurigana('お願いします', 'おねがいします')).toEqual([
      { text: 'お' },
      { text: '願', reading: 'ねが' },
      { text: 'いします' },
    ])
  })
  it('handles multiple kanji runs', () => {
    expect(alignFurigana('引き出し', 'ひきだし')).toEqual([
      { text: '引', reading: 'ひ' },
      { text: 'き' },
      { text: '出', reading: 'だ' },
      { text: 'し' },
    ])
  })
  it('puts one ruby over all-kanji words', () => {
    expect(alignFurigana('大学生', 'だいがくせい')).toEqual([{ text: '大学生', reading: 'だいがくせい' }])
  })
  it('handles prefixes like ～', () => {
    expect(alignFurigana('～年生', '～ねんせい')).toEqual([{ text: '～' }, { text: '年生', reading: 'ねんせい' }])
  })
  it('falls back to whole-word ruby when the reading does not match', () => {
    expect(alignFurigana('食べる', 'のむ')).toEqual([{ text: '食べる', reading: 'のむ' }])
  })
  it('leaves kana words alone', () => {
    expect(alignFurigana('コーヒー', 'コーヒー')).toEqual([{ text: 'コーヒー' }])
  })
})

describe('parseMarkup', () => {
  const s = parseMarkup('{毎日|まいにち} {日本語|にほんご}を *{勉強します|べんきょうします}* 。')
  it('splits tiles on spaces and glues punctuation', () => {
    expect(s.chunks.map((c) => c.text)).toEqual(['毎日', '日本語を', '勉強します。'])
  })
  it('derives plain text and reading', () => {
    expect(s.plain).toBe('毎日日本語を勉強します。')
    expect(s.kana).toBe('まいにちにほんごをべんきょうします。')
  })
  it('marks the target', () => {
    expect(s.hasTarget).toBe(true)
    expect(s.chunks[2]!.target).toBe(true)
    expect(s.segs.filter((x) => x.target).map((x) => x.text).join('')).toBe('勉強します')
  })
  it('supports a target inside a tile', () => {
    const t = parseMarkup('{私|わたし}*は* {学生|がくせい}です。')
    expect(t.chunks[0]!.segs).toEqual([{ text: '私', reading: 'わたし' }, { text: 'は', target: true }])
  })
  it('converts Anki furigana', () => {
    expect(fromAnkiFurigana('日本語[にほんご]を勉強[べんきょう]する')).toBe('{日本語|にほんご}を{勉強|べんきょう}する')
  })
})

describe('kana normalization', () => {
  it('maps katakana to hiragana', () => expect(kataToHira('カタカナ')).toBe('かたかな'))
  it('expands long vowels and strips punctuation', () => {
    expect(normalizeKana('コーヒー')).toBe('こおひい')
    expect(normalizeKana('～ねんせい')).toBe('ねんせい')
    expect(normalizeKana('こーひー')).toBe(normalizeKana('コーヒー'))
  })
  it('detects kana-only strings', () => {
    expect(isKanaOnly('ティーシャツ')).toBe(true)
    expect(isKanaOnly('Tシャツ')).toBe(false)
    expect(isKanaOnly('食べる')).toBe(false)
  })
})

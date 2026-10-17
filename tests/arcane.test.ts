import { join } from 'node:path'
import kuromoji, { type Tokenizer } from 'kuromoji'
import { beforeAll, describe, expect, it } from 'vitest'
import { parseMarkup } from '../src/lib/jp/markup'
import {
  assignExamples,
  classify,
  coverage,
  fromKuromoji,
  guessBaseReading,
  isKnown,
  knownSet,
  lineMarkup,
  mergeCompounds,
  normalizeSlang,
  rankWords,
  typeOf,
  type Line,
  type Tok,
} from '../tools/arcane/mine'
import { episodeOf, isDialogue, languageOf, mergeContinuations, parseSubtitles, refOf } from '../tools/arcane/subs'
import { wordProblems } from '../tools/arcane/validate'

// All subtitle text below is made up for the tests.
const SRT = `1
00:00:01,000 --> 00:00:02,500
（ミナ）
今日は雨だ

2
00:00:03,000 --> 00:00:04,000
<i>扉を開けて―</i>

3
00:00:04,200 --> 00:00:05,000
早く！

4
00:00:06,000 --> 00:00:07,000
［爆発音］

5
00:00:08,000 --> 00:00:09,000
♪ 歌の歌詞

6
00:01:02,345 --> 00:01:04,000
- 行くぞ
- うん
`

const tok = (surface: string, pos: string, pos1: string, base = surface, reading = '', ctype = '*', pos2 = '*'): Tok => ({ surface, pos, pos1, pos2, ctype, base, reading })

describe('subtitles', () => {
  it('parses SRT, strips speaker labels, tags, sound cues and lyrics', () => {
    const cues = parseSubtitles(SRT, 'S1E1')
    expect(cues.map((c) => c.text)).toEqual(['今日は雨だ', '扉を開けて―', '早く！', '行くぞ うん'])
    expect(cues[3]!.start).toBeCloseTo(62.345)
  })

  it('joins sentences continued with ― across cues', () => {
    const merged = mergeContinuations(parseSubtitles(SRT, 'S1E1'))
    expect(merged.map((c) => c.text)).toContain('扉を開けて早く！')
  })

  it('parses WebVTT and ASS', () => {
    const vtt = 'WEBVTT\n\n00:00:01.000 --> 00:00:02.000\n静かに\n'
    expect(parseSubtitles(vtt, 'S2E1')[0]).toMatchObject({ text: '静かに', start: 1 })
    const ass = '[Script Info]\n[Events]\nDialogue: 0,0:00:03.50,0:00:05.00,Default,,0,0,0,,{\\i1}走れ\\N今すぐ\n'
    expect(parseSubtitles(ass, 'S2E1', 'x.ass')[0]).toMatchObject({ text: '走れ 今すぐ', start: 3.5 })
  })

  it('reads episode and language from file names', () => {
    expect(episodeOf('Show S01E03 Title - ja - japoński.nfimsc.srt')).toBe('S1E3')
    expect(episodeOf('S2E09.ja.srt')).toBe('S2E9')
    expect(languageOf('Show S01E03 Title - ja - japoński.nfimsc.srt')).toBe('ja')
    expect(languageOf('S1E01.en.srt')).toBe('en')
    expect(languageOf('Show S01E03 - en - angielski.srt')).toBe('en')
    expect(refOf({ ep: 'S1E3', start: 754.9 })).toBe('S1E3 · 12:34')
    expect(isDialogue('NETFLIX シリーズ')).toBe(false)
    expect(isDialogue('“店の看板”')).toBe(false)
  })
})

describe('word filtering and ranking', () => {
  it('keeps content words; particles, auxiliaries, names and numbers are not words to learn', () => {
    expect(classify(tok('扉', '名詞', '一般'))).toBe('content')
    expect(classify(tok('俺', '名詞', '代名詞'))).toBe('content')
    expect(classify(tok('を', '助詞', '格助詞'))).toBe('grammar')
    expect(classify(tok('た', '助動詞', '*'))).toBe('grammar')
    expect(classify(tok('て', '動詞', '非自立', 'てる'))).toBe('grammar')
    expect(classify(tok('ミナ', '名詞', '固有名詞'))).toBe('name')
    expect(classify(tok('トビ', '名詞', '一般'), new Set(['トビ']))).toBe('name')
    expect(classify(tok('３', '名詞', '数'))).toBe('number')
    expect(classify(tok('！', '記号', '一般'))).toBe('symbol')
  })

  it('maps parts of speech to word types', () => {
    expect(typeOf({ pos: '動詞', pos1: '自立', ctype: '五段・カ行促音便' })).toBe('verb-u')
    expect(typeOf({ pos: '動詞', pos1: '自立', ctype: '一段' })).toBe('verb-ru')
    expect(typeOf({ pos: '動詞', pos1: '自立', ctype: 'サ変・スル' })).toBe('verb-irr')
    expect(typeOf({ pos: '動詞', pos1: '自立', ctype: 'カ変・来ル' })).toBe('verb-irr')
    expect(typeOf({ pos: '形容詞', pos1: '自立', ctype: '形容詞・アウオ段' })).toBe('i-adj')
    expect(typeOf({ pos: '名詞', pos1: '形容動詞語幹', ctype: '*' })).toBe('na-adj')
    expect(typeOf({ pos: '名詞', pos1: '代名詞', ctype: '*' })).toBe('pronoun')
  })

  it('derives the dictionary-form reading of a conjugated token', () => {
    expect(guessBaseReading(tok('開け', '動詞', '自立', '開ける', 'アケ', '一段'))).toBe('あける')
    expect(guessBaseReading(tok('行っ', '動詞', '自立', '行く', 'イッ', '五段・カ行促音便'))).toBe('いく')
  })

  it('treats words as known by written form, or by reading when written in kana', () => {
    const k = knownSet([{ japanese: '分かる', kana: 'わかる' }, { japanese: 'ちょっと', kana: 'ちょっと' }], ['一緒'])
    expect(isKnown({ japanese: '分かる', kana: 'わかる' }, k)).toBe(true)
    expect(isKnown({ japanese: 'わかる', kana: 'わかる' }, k)).toBe(true)
    expect(isKnown({ japanese: '一緒', kana: 'いっしょ' }, k)).toBe(true)
    expect(isKnown({ japanese: '一寸', kana: 'ちょっと' }, k)).toBe(true)
    expect(isKnown({ japanese: '扉', kana: 'とびら' }, k)).toBe(false)
  })

  it('ranks by count × episode spread, and reports coverage gains', () => {
    const line = (id: number, ep: string, words: string[]): Line => ({ id, ep, start: id, text: words.join(''), ref: '', toks: words.map((w) => tok(w, '名詞', '一般', w, 'ア')) })
    // 鍵: 4× in one episode (score 4); 扉: 3× over 3 episodes (score 9)
    const lines = [line(0, 'S1E1', ['鍵', '鍵', '鍵', '鍵', '扉']), line(1, 'S1E2', ['扉', '犬']), line(2, 'S1E3', ['扉'])]
    const known = new Set(['犬'])
    const lemma = (t: Tok) => (known.has(t.base) ? null : { key: t.base, japanese: t.base, kana: 'あ', type: 'noun' as const })
    const ranked = rankWords(lines, lemma)
    expect(ranked.map((w) => [w.key, w.count, w.episodes.length, w.score])).toEqual([
      ['扉', 3, 3, 9],
      ['鍵', 4, 1, 4],
    ])
    const cov = coverage(lines, () => 'content', (t) => known.has(t.base), ranked, [1, 2])
    expect(cov).toMatchObject({ tokens: 8, known: 1 })
    expect(cov.gains.map((g) => Math.round(g.pct))).toEqual([50, 100])
  })
})

describe('example lines', () => {
  it('gives every word its own line, preferring lines with fewer other new words', () => {
    const L = (id: number, text: string, keys: string[]) => ({ id, text, keys: new Set(keys) })
    const lines = [
      L(0, 'あいうえおかきくけ', ['A', 'B', 'X']), // A + two new words
      L(1, 'あいうえおかきく', ['A']), // A alone
      L(2, 'あいうえおかき', ['B']),
      L(3, 'あいうえおか', ['C', 'A']), // C's only line
    ]
    const rank = new Map([
      ['A', 0],
      ['B', 1],
      ['C', 2],
      ['X', 50],
    ])
    const out = assignExamples(['A', 'B', 'C'], lines, (k) => rank.get(k))
    expect(out.map((a) => [a.key, a.lineId])).toEqual([
      ['A', 1],
      ['B', 2],
      ['C', 3],
    ])
    // C is learned after A, so A in its line isn't new any more
    expect(out[2]!.otherNew).toEqual([])
    expect(new Set(out.map((a) => a.lineId)).size).toBe(3)
  })

  it('leaves a word without a line rather than reusing one', () => {
    const lines = [{ id: 0, text: 'あいうえおかき', keys: new Set(['A', 'B']) }]
    const out = assignExamples(['A', 'B'], lines, () => 0)
    expect(out.filter((a) => a.lineId === undefined)).toHaveLength(1)
  })
})

describe('markup from tokens (real tokenizer, made-up lines)', () => {
  let tokenizer: Tokenizer
  beforeAll(async () => {
    tokenizer = await new Promise<Tokenizer>((ok, fail) =>
      kuromoji.builder({ dicPath: join(__dirname, '..', 'node_modules/kuromoji/dict') }).build((e, t) => (e ? fail(e) : ok(t))),
    )
  })
  const markup = (text: string, target: string) => lineMarkup(tokenizer.tokenize(text).map(fromKuromoji), (t) => t.base === target)

  it('adds furigana, tiles and the target (with its inflection)', () => {
    expect(markup('古い扉を開けた', '開ける')).toBe('{古い|ふるい} {扉|とびら}を *{開け|あけ}た*')
    expect(markup('古い扉を開けた', '扉')).toBe('{古い|ふるい} *{扉|とびら}*を {開け|あけ}た')
    const s = parseMarkup(markup('古い扉を開けた', '開ける')!)
    expect(s.plain).toBe('古い扉を開けた')
    expect(s.chunks.map((c) => c.text)).toEqual(['古い', '扉を', '開けた'])
    expect(s.chunks.find((c) => c.target)?.text).toBe('開けた')
  })

  it('joins a noun and a one-kanji suffix into one word', () => {
    const toks = mergeCompounds(tokenizer.tokenize('評議会の科学者たち').map(fromKuromoji))
    expect(toks.map((t) => t.base)).toEqual(['評議会', 'の', '科学者', 'たち'])
    expect(toks[0]!.reading).toBe('ヒョウギカイ')
    expect(normalizeSlang('ヤバいな マズかった ヤバ')).toBe('やばいな まずかった ヤバ')
  })

  it('produces words that pass the vocabulary rules', () => {
    const ja = markup('静かに扉を閉めろ', '閉める')!
    const problems = wordProblems({
      japanese: '閉める',
      kana: 'しめる',
      en: 'to close',
      pl: 'zamykać',
      type: 'verb-ru',
      genkiLesson: 0,
      deck: 'demo',
      frequency: 1,
      tags: ['demo-1'],
      example: { ja, en: 'Close the door quietly.', pl: 'Zamknij cicho drzwi.', ref: 'S1E1 · 0:01' },
    })
    expect(problems).toEqual([])
    expect(wordProblems({ japanese: '扉', kana: 'tobira', en: 'door', pl: 'drzwi', type: 'noun', genkiLesson: 0, tags: [], example: { ja: '扉だ', en: 'x', pl: 'x' } })).toEqual(
      expect.arrayContaining(['kana "tobira" is not kana', 'example has no *target*', 'kanji without furigana in "扉だ"']),
    )
  })
})

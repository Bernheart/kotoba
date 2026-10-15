import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { conjugate, formsFor, type Form } from '../src/lib/jp/conjugate'
import { alignFurigana } from '../src/lib/jp/furigana'
import type { Word, WordType } from '../src/lib/types'

const w = (japanese: string, kana: string, type: WordType) => ({ japanese, kana, type })
const c = (word: ReturnType<typeof w>, f: Form) => conjugate(word, f)

describe('verbs', () => {
  it.each([
    [w('食べる', 'たべる', 'verb-ru'), 'te', '食べて', 'たべて'],
    [w('飲む', 'のむ', 'verb-u'), 'te', '飲んで', 'のんで'],
    [w('書く', 'かく', 'verb-u'), 'te', '書いて', 'かいて'],
    [w('泳ぐ', 'およぐ', 'verb-u'), 'ta', '泳いだ', 'およいだ'],
    [w('話す', 'はなす', 'verb-u'), 'te', '話して', 'はなして'],
    [w('待つ', 'まつ', 'verb-u'), 'nai', '待たない', 'またない'],
    [w('会う', 'あう', 'verb-u'), 'nai', '会わない', 'あわない'],
    [w('帰る', 'かえる', 'verb-u'), 'masu', '帰ります', 'かえります'],
    [w('行く', 'いく', 'verb-u'), 'te', '行って', 'いって'],
    [w('行く', 'いく', 'verb-u'), 'ta', '行った', 'いった'],
    [w('ある', 'ある', 'verb-u'), 'nai', 'ない', 'ない'],
    [w('ある', 'ある', 'verb-u'), 'nakatta', 'なかった', 'なかった'],
    [w('する', 'する', 'verb-irr'), 'nai', 'しない', 'しない'],
    [w('勉強する', 'べんきょうする', 'verb-irr'), 'masendeshita', '勉強しませんでした', 'べんきょうしませんでした'],
    [w('来る', 'くる', 'verb-irr'), 'nai', '来ない', 'こない'],
    [w('来る', 'くる', 'verb-irr'), 'te', '来て', 'きて'],
    [w('持ってくる', 'もってくる', 'verb-irr'), 'ta', '持ってきた', 'もってきた'],
    [w('死ぬ', 'しぬ', 'verb-u'), 'te', '死んで', 'しんで'],
    [w('遊ぶ', 'あそぶ', 'verb-u'), 'ta', '遊んだ', 'あそんだ'],
    [w('作る', 'つくる', 'verb-u'), 'te', '作って', 'つくって'],
  ] as const)('%o %s', (word, form, japanese, kana) => {
    expect(c(word, form)).toEqual({ japanese, kana })
  })
})

describe('adjectives', () => {
  it.each([
    [w('高い', 'たかい', 'i-adj'), 'adjPast', '高かったです', 'たかかったです'],
    [w('いい', 'いい', 'i-adj'), 'adjNeg', 'よくないです', 'よくないです'],
    [w('かっこいい', 'かっこいい', 'i-adj'), 'adjPlainPast', 'かっこよかった', 'かっこよかった'],
    [w('静か', 'しずか', 'na-adj'), 'adjPastNeg', '静かじゃなかったです', 'しずかじゃなかったです'],
    [w('元気', 'げんき', 'na-adj'), 'adjTe', '元気で', 'げんきで'],
  ] as const)('%o %s', (word, form, japanese, kana) => {
    expect(c(word, form)).toEqual({ japanese, kana })
  })
})

// Every verb and adjective in the data must conjugate, and the result must still align with its reading.
const dir = join(__dirname, '..', 'data', 'vocab')
const words: Word[] = readdirSync(dir)
  .filter((f) => f.endsWith('.json'))
  .flatMap((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')).words)
  .filter((x: Word) => formsFor(x.type).length)

describe('all verbs and adjectives in the data conjugate', () => {
  it.each(words.map((x) => [x.id, x] as const))('%s', (_id, word) => {
    for (const f of formsFor(word.type)) {
      const r = conjugate(word, f)
      expect(r, `${word.id} ${f}`).not.toBeNull()
      const segs = alignFurigana(r!.japanese, r!.kana)
      expect(segs.length > 1 || segs[0]!.reading === undefined || !/[ぁ-ん]/.test(r!.japanese), `${word.id} ${f}: ${r!.japanese}/${r!.kana} misaligned`).toBe(true)
    }
  })
})

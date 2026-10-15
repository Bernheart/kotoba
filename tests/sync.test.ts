import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { KotobaDB } from '../src/lib/db'
import { newCardRow } from '../src/lib/srs/fsrs'
import { MemoryRemote, syncOnce } from '../src/lib/sync/core'

// Two "devices" (separate IndexedDB databases) syncing through one in-memory server.
async function devices() {
  const mac = new KotobaDB(`mac-${Math.random()}`)
  const phone = new KotobaDB(`phone-${Math.random()}`)
  await mac.open()
  await phone.open()
  return { mac, phone, server: new MemoryRemote() }
}

describe('sync', () => {
  it('moves progress from one device to the other', async () => {
    const { mac, phone, server } = await devices()
    await mac.cards.put({ ...newCardRow('l01-gakusei', 'recog', 1000), stability: 3, updatedAt: 1000 })
    await mac.reviewLogs.put({ id: 'log1', cardId: 'l01-gakusei:recog', wordId: 'l01-gakusei', mode: 'review', rating: 3, correct: 1, ms: 900, at: 1000, day: '2026-10-16', scheduled: 1, dirty: 1 })
    await mac.settings.put({ key: 'lang', value: 'pl', updatedAt: 1000, dirty: 1 })
    const r1 = await syncOnce(mac, server, { cursor: 0 })
    expect(r1.pushed).toBe(3)
    expect(await mac.cards.where('dirty').equals(1).count()).toBe(0)
    await syncOnce(phone, server, { cursor: 0 })
    expect((await phone.cards.get('l01-gakusei:recog'))?.stability).toBe(3)
    expect(await phone.reviewLogs.count()).toBe(1)
    expect((await phone.settings.get('lang'))?.value).toBe('pl')
    // pulled rows are clean (not pushed back)
    expect(await phone.cards.where('dirty').equals(1).count()).toBe(0)
  })

  it('resolves conflicts per card by last write, and keeps both review logs', async () => {
    const { mac, phone, server } = await devices()
    await mac.cards.put({ ...newCardRow('w', 'recog', 1000), stability: 5, updatedAt: 2000 })
    await phone.cards.put({ ...newCardRow('w', 'recog', 1000), stability: 9, updatedAt: 3000 })
    await mac.reviewLogs.put({ id: 'a', cardId: 'w:recog', wordId: 'w', mode: 'review', rating: 3, correct: 1, ms: 1, at: 2000, day: 'd', scheduled: 1, dirty: 1 })
    await phone.reviewLogs.put({ id: 'b', cardId: 'w:recog', wordId: 'w', mode: 'review', rating: 4, correct: 1, ms: 1, at: 3000, day: 'd', scheduled: 1, dirty: 1 })
    let macCursor = (await syncOnce(mac, server, { cursor: 0 })).cursor
    await syncOnce(phone, server, { cursor: 0 })
    macCursor = (await syncOnce(mac, server, { cursor: macCursor })).cursor
    expect((await mac.cards.get('w:recog'))?.stability).toBe(9)
    expect((await phone.cards.get('w:recog'))?.stability).toBe(9)
    expect(await mac.reviewLogs.count()).toBe(2)
    expect(await phone.reviewLogs.count()).toBe(2)
  })

  it('an older remote write never overwrites a newer local edit', async () => {
    const { mac, phone, server } = await devices()
    await mac.userWords.put({ id: 'u-1', kind: 'custom', word: { japanese: '猫', kana: 'ねこ', en: 'cat' }, createdAt: 1, updatedAt: 5000, dirty: 1 })
    await phone.userWords.put({ id: 'u-1', kind: 'custom', word: { japanese: '猫', kana: 'ねこ', en: 'kitty' }, createdAt: 1, updatedAt: 4000, dirty: 1 })
    await syncOnce(mac, server, { cursor: 0 })
    await syncOnce(phone, server, { cursor: 0 })
    expect((await phone.userWords.get('u-1'))?.word.en).toBe('cat')
    expect(server.rows.get('words/u-1')?.data.word).toMatchObject({ en: 'cat' })
  })

  it('propagates deletions as tombstones', async () => {
    const { mac, phone, server } = await devices()
    await mac.userWords.put({ id: 'u-2', kind: 'custom', word: { japanese: 'いぬ', kana: 'いぬ' }, createdAt: 1, updatedAt: 1000, dirty: 1 })
    let c = (await syncOnce(mac, server, { cursor: 0 })).cursor
    await syncOnce(phone, server, { cursor: 0 })
    await phone.userWords.put({ ...(await phone.userWords.get('u-2'))!, deleted: 1, updatedAt: 2000, dirty: 1 })
    await syncOnce(phone, server, { cursor: 0 })
    c = (await syncOnce(mac, server, { cursor: c })).cursor
    expect((await mac.userWords.get('u-2'))?.deleted).toBe(1)
  })

  it('never syncs device-only settings', async () => {
    const { mac, server } = await devices()
    await mac.settings.put({ key: 'supabaseKey', value: 'secret', updatedAt: 1, dirty: 1 })
    await mac.settings.put({ key: 'voiceURI', value: 'Kyoko', updatedAt: 1, dirty: 1 })
    await syncOnce(mac, server, { cursor: 0 })
    expect(server.rows.size).toBe(0)
  })
})

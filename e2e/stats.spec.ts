import { expect, test } from '@playwright/test'

// Seeds ~2 months of fake answers straight into IndexedDB, then checks the dashboard renders.
test('stats dashboard with history', async ({ page }, info) => {
  await page.goto('/#/')
  await page.waitForTimeout(500)
  await page.evaluate(async () => {
    const ids = ['l01-gakusei', 'l01-daigaku', 'l02-hon', 'l03-taberu', 'l03-nomu', 'l05-takai', 'l06-akeru', 'l07-chichi']
    const modes = ['review', 'review', 'mcq', 'typing', 'listening', 'cloze', 'conjugation']
    const db: IDBDatabase = await new Promise((res, rej) => {
      const r = indexedDB.open('kotoba')
      r.onsuccess = () => res(r.result)
      r.onerror = () => rej(r.error)
    })
    const tx = db.transaction('reviewLogs', 'readwrite')
    const store = tx.objectStore('reviewLogs')
    const now = Date.now()
    let k = 0
    for (let d = 0; d < 70; d++) {
      if (d % 9 === 4) continue
      const n = 5 + ((d * 7) % 23)
      for (let i = 0; i < n; i++) {
        const at = now - d * 86400000 - i * 60000
        const date = new Date(at - 4 * 3600000)
        const day = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
        store.put({ id: `seed-${k++}`, cardId: `${ids[i % ids.length]}:recog`, wordId: ids[i % ids.length], mode: modes[i % modes.length], rating: i % 5 === 0 ? 1 : 3, correct: i % 5 === 0 ? 0 : 1, ms: 2000, at, day, scheduled: 1, state: 2, dirty: 0 })
      }
    }
    await new Promise((res) => (tx.oncomplete = res))
  })
  await page.goto('/?safe=1#/stats')
  await expect(page.getByText('Accuracy by type')).toBeVisible()
  await page.waitForTimeout(500)
  await page.screenshot({ path: `e2e/screenshots/${info.project.name}/stats.png`, fullPage: true })
})

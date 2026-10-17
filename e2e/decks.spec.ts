import { expect, test, type Page } from '@playwright/test'

// A small made-up deck (no real show content): same JSON shape as tools/arcane's output.
const DECK = {
  words: [
    {
      japanese: '試作',
      kana: 'しさく',
      en: 'prototype',
      pl: 'prototyp',
      type: 'noun',
      genkiLesson: 0,
      deck: 'demo',
      frequency: 1,
      tags: ['demo-1'],
      example: { ja: 'これは *{試作|しさく}* だ。', en: 'This is a prototype.', pl: 'To jest prototyp.', ref: 'S1E1 · 00:42' },
    },
    {
      japanese: '歯車',
      kana: 'はぐるま',
      en: 'gear; cog',
      pl: 'zębatka',
      type: 'noun',
      genkiLesson: 0,
      deck: 'demo',
      frequency: 2,
      tags: ['demo-1'],
      example: { ja: '*{歯車|はぐるま}* が {回|まわ}る。', en: 'The gears turn.', pl: 'Zębatki się kręcą.', ref: 'S1E2 · 10:05' },
    },
    {
      japanese: '煙突',
      kana: 'えんとつ',
      en: 'chimney',
      pl: 'komin',
      type: 'noun',
      genkiLesson: 0,
      deck: 'demo',
      frequency: 3,
      tags: ['demo-1'],
    },
  ],
}

async function mainReviewCount(page: Page) {
  await page.goto('/?safe=1#/')
  const btn = page.getByRole('button', { name: /^Review/ })
  await expect(btn).toBeVisible()
  return (await btn.textContent())?.replace(/\D/g, '')
}

test('a custom deck gets its own tile and queue, separate from the main reviews', async ({ page }, info) => {
  const shot = (n: string) => page.screenshot({ path: `e2e/screenshots/${info.project.name}/${n}.png` })
  const before = await mainReviewCount(page)

  await page.goto('/#/import')
  await page.locator('textarea').fill(JSON.stringify(DECK))
  await expect(page.getByText('3 new')).toBeVisible()
  await expect(page.getByText(/^Deck: Demo/)).toBeVisible()
  await page.getByRole('button', { name: /Import 3 words/ }).click()
  await expect(page.getByRole('searchbox')).toBeVisible()

  // main track unchanged
  expect(await mainReviewCount(page)).toBe(before)

  await page.goto('/?safe=1#/study')
  const tile = page.getByRole('link', { name: /Demo/ })
  await expect(tile).toBeVisible()
  await expect(tile).toContainText('0 due · 3 new today')
  await shot('study-decks')
  await tile.click()

  // deck review: new words in frequency order, with the example's episode ref
  await expect(page.getByText('New word')).toBeVisible()
  await expect(page.getByText('prototype').first()).toBeVisible()
  await expect(page.getByText('S1E1 · 00:42')).toBeVisible()
  await page.waitForTimeout(300)
  await shot('deck-intro')
  await page.getByRole('button', { name: 'Got it' }).click()
  await expect(page.getByText('gear; cog').first()).toBeVisible()
  await page.getByRole('button', { name: 'Got it' }).click()
  await page.getByRole('button', { name: 'Show answer' }).click()
  await page.getByRole('button', { name: /^Good/ }).click()
  await expect(page.getByRole('button', { name: 'Show answer' })).toBeVisible() // next card: the answer is saved
  await page.waitForTimeout(300)

  await page.goto('/?safe=1#/study')
  await expect(page.getByRole('link', { name: /Demo/ })).toContainText('1 / 3 words')
  expect(await mainReviewCount(page)).toBe(before)

  // library: deck chip filters to the deck
  await page.goto('/#/library')
  await page.evaluate(() => localStorage.removeItem('kotoba.library'))
  await page.reload()
  await page.getByRole('button', { name: 'Demo', exact: true }).click()
  await expect(page.getByText('3 words', { exact: true }).first()).toBeVisible()
})

test('practice can be limited to a deck', async ({ page }) => {
  await page.goto('/#/import')
  await page.locator('textarea').fill(JSON.stringify(DECK))
  await page.getByRole('button', { name: /Import 3 words/ }).click()
  await expect(page.getByRole('searchbox')).toBeVisible()

  await page.goto('/?safe=1#/quiz/mcq')
  await page.evaluate(() => localStorage.removeItem('kotoba.practice'))
  await page.reload()
  // "All" selects everything, a second tap clears it
  await page.getByRole('button', { name: 'All', exact: true }).click()
  await page.getByRole('button', { name: 'All', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Begin' })).toBeDisabled()
  await page.getByRole('button', { name: 'Demo', exact: true }).click()
  await page.getByRole('button', { name: 'Begin' }).click()
  await expect(page.getByText(/試作|歯車|煙突|prototype|gear; cog|chimney/).first()).toBeVisible()
})

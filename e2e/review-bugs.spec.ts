import { expect, test, type Page } from '@playwright/test'

/** Japanese text of the card on screen, once the card transition has finished */
const currentWord = async (page: Page) => {
  await page.waitForTimeout(450)
  return page.locator('[lang="ja"]').first().innerText()
}

const logCount = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        const r = indexedDB.open('kotoba')
        r.onsuccess = () => {
          const req = r.result.transaction('reviewLogs').objectStore('reviewLogs').count()
          req.onsuccess = () => resolve(req.result)
        }
      }),
  )

test('undo goes back exactly one step, including "Got it" steps', async ({ page }) => {
  await page.goto('/#/review')
  const intro = page.getByText('New word')
  await expect(intro).toBeVisible()
  const first = await currentWord(page)
  await page.getByRole('button', { name: 'Got it' }).click() // intro 1
  await page.getByRole('button', { name: 'Got it' }).click() // intro 2
  await expect(page.getByRole('button', { name: 'Show answer' })).toBeVisible() // quiz of word 1
  const quizWord = await currentWord(page)
  expect(quizWord).toBe(first) // the quiz is of word 1
  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(intro).toBeVisible() // back on intro 2, not further
  const second = await currentWord(page)
  expect(second).not.toBe(first)
  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(intro).toBeVisible()
  expect(await currentWord(page)).toBe(first) // intro 1
  await expect(page.getByRole('button', { name: 'Undo' })).toHaveCount(0)
})

test('a double tap on a rating answers only one card', async ({ page }) => {
  await page.goto('/#/review')
  await page.getByRole('button', { name: 'Got it' }).click()
  await page.getByRole('button', { name: 'Got it' }).click()
  await page.getByRole('button', { name: 'Show answer' }).click()
  const good = page.getByRole('button', { name: /^Good/ })
  await good.dblclick()
  await page.waitForTimeout(600)
  expect(await logCount(page)).toBe(1)
})

test('a card rated Good (10m) waits instead of coming straight back', async ({ page }) => {
  await page.goto('/#/review')
  await page.getByRole('button', { name: 'Got it' }).click()
  await page.getByRole('button', { name: 'Got it' }).click()
  const word1 = await currentWord(page)
  await page.getByRole('button', { name: 'Show answer' }).click()
  await page.getByRole('button', { name: /^Good 10m/ }).click()
  // next: quiz of word 2, then the third word's intro — word 1 does not reappear
  for (let i = 0; i < 2; i++) {
    const current = await currentWord(page)
    expect(current).not.toBe(word1)
    if (await page.getByRole('button', { name: 'Got it' }).isVisible()) await page.getByRole('button', { name: 'Got it' }).click()
    else {
      await page.getByRole('button', { name: 'Show answer' }).click()
      await page.getByRole('button', { name: /^Good/ }).click()
    }
  }
})

test('rating buttons show Anki intervals for a new card', async ({ page }) => {
  await page.goto('/#/review')
  await page.getByRole('button', { name: 'Got it' }).click()
  await page.getByRole('button', { name: 'Got it' }).click()
  await page.getByRole('button', { name: 'Show answer' }).click()
  for (const label of ['Again 1m', 'Hard 6m', 'Good 10m', 'Easy 4d']) await expect(page.getByRole('button', { name: label })).toBeVisible()
})

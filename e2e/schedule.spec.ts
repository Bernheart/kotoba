import { expect, test } from '@playwright/test'

test('word details show both cards’ schedule and the answer history', async ({ page }, info) => {
  await page.goto('/#/settings')
  await page.getByRole('radio', { name: 'Lesson 1' }).click() // first new word: おはようございます
  await page.waitForTimeout(400)
  await page.goto('/?safe=1#/review')
  await page.getByRole('button', { name: 'Got it' }).click()
  await page.getByRole('button', { name: 'Got it' }).click()
  await expect(page.getByText('JP → meaning').first()).toBeVisible() // direction badge on the card
  await page.getByRole('button', { name: 'Show answer' }).click()
  await page.getByRole('button', { name: /^Easy/ }).click()
  await page.waitForTimeout(600) // let the answer reach IndexedDB before navigating
  await page.goto('/?safe=1#/library')
  await page.getByRole('searchbox').fill('ohayougozaimasu')
  await page.getByRole('button', { name: /good morning/ }).first().click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByText('Schedule')).toBeVisible()
  await expect(dialog.getByText(/every 4 days/)).toBeVisible()
  await expect(dialog.getByText('meaning → JP', { exact: true })).toBeVisible()
  await expect(dialog.getByText('→ 4 days')).toBeVisible()
  await dialog.getByText('Schedule').scrollIntoViewIfNeeded()
  await page.waitForTimeout(400)
  await page.screenshot({ path: `e2e/screenshots/${info.project.name}/word-schedule.png` })
})

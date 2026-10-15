import { expect, test } from '@playwright/test'

const shot = (page: import('@playwright/test').Page, project: string, n: string) => page.screenshot({ path: `e2e/screenshots/${project}/${n}.png` })

test('study hub lists all modes', async ({ page }, info) => {
  await page.goto('/?safe=1#/study')
  await expect(page.getByRole('link', { name: /Conjugation/ })).toBeVisible()
  await shot(page, info.project.name, 'study')
})

test('multiple choice quiz runs to the end', async ({ page }, info) => {
  test.setTimeout(120_000)
  await page.goto('/?safe=1#/quiz/mcq')
  await page.getByRole('radio', { name: '10' }).click()
  await page.getByRole('button', { name: 'Begin' }).click()
  await page.waitForTimeout(300)
  await shot(page, info.project.name, 'quiz-mcq')
  for (let i = 0; i < 90; i++) {
    if (await page.getByText('Session complete').isVisible()) break
    const cont = page.getByRole('button', { name: 'Continue' })
    if (await cont.isVisible()) await cont.click()
    else await page.locator('[data-option]').first().click()
    await page.waitForTimeout(800)
  }
  await expect(page.getByText('Session complete')).toBeVisible()
})

test('conjugation trainer shows the rule after a wrong answer', async ({ page }, info) => {
  await page.goto('/?safe=1#/conjugation')
  await page.getByRole('button', { name: 'Begin' }).click()
  const input = page.getByPlaceholder('Type in romaji or kana…')
  await input.pressSequentially('xxx')
  await page.getByRole('button', { name: 'Check' }).click()
  await expect(page.getByText('Rule:')).toBeVisible()
  await shot(page, info.project.name, 'conj-wrong')
})

test('sentence builder, cloze, matching, kana, shadowing and 5-minute session open', async ({ page }, info) => {
  for (const [path, name] of [
    ['/quiz/builder', 'builder'],
    ['/quiz/cloze', 'cloze'],
    ['/quiz/listening', 'listening'],
  ] as const) {
    await page.goto(`/?safe=1#${path}`)
    await page.getByRole('button', { name: 'Begin' }).click()
    await page.waitForTimeout(400)
    await shot(page, info.project.name, name)
  }
  await page.goto('/?safe=1#/matching')
  await page.getByRole('button', { name: 'Begin' }).click()
  await page.waitForTimeout(300)
  await shot(page, info.project.name, 'matching')
  await page.goto('/?safe=1#/kana')
  await page.getByRole('button', { name: 'Begin' }).click()
  await page.getByPlaceholder('romaji').fill('a')
  await shot(page, info.project.name, 'kana')
  await page.goto('/?safe=1#/shadowing')
  await page.getByRole('button', { name: 'Begin' }).click()
  await shot(page, info.project.name, 'shadowing')
  await page.goto('/?safe=1#/session')
  await page.getByRole('button', { name: 'Start' }).click()
  await page.waitForTimeout(500)
  await shot(page, info.project.name, 'session')
  await expect(page.getByText(/New word|Continue|Check/).first()).toBeVisible()
})

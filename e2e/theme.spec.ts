import { test } from '@playwright/test'

test('light theme and desktop layout screenshots', async ({ page }, info) => {
  await page.goto('/#/settings')
  await page.getByRole('radio', { name: 'Light' }).click()
  await page.waitForTimeout(400) // let the IndexedDB write finish before navigating
  for (const [n, path] of [['light-today', '/'], ['light-library', '/library'], ['light-study', '/study']] as const) {
    await page.goto(`/?safe=1#${path}`)
    await page.waitForTimeout(500)
    await page.screenshot({ path: `e2e/screenshots/${info.project.name}/${n}.png` })
  }
  await page.goto('/#/settings')
  await page.getByRole('radio', { name: 'Dark' }).click()
  await page.goto('/#/study')
  await page.waitForTimeout(400)
  await page.screenshot({ path: `e2e/screenshots/${info.project.name}/dark-study.png` })
})

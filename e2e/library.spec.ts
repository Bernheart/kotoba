import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.goto('/#/library')
  await page.evaluate(() => localStorage.removeItem('kotoba.library'))
})

test('search by romaji, kana and Polish, open word details', async ({ page }, info) => {
  const search = page.getByRole('searchbox')
  await search.fill('daigaku')
  await expect(page.getByRole('button', { name: /university; college/ }).first()).toBeVisible()
  await search.fill('だいがく')
  await expect(page.getByRole('button', { name: /university; college/ }).first()).toBeVisible()
  await search.fill('uniwersytet')
  await page.getByRole('button', { name: /university; college/ }).first().click()
  await expect(page.getByRole('dialog')).toContainText('uniwersytet')
  await expect(page.getByRole('dialog')).toContainText('daigaku')
  await page.waitForTimeout(500)
  await page.screenshot({ path: `e2e/screenshots/${info.project.name}/word-sheet.png` })
  await page.keyboard.press('Escape')
  await page.getByRole('searchbox').fill('taberu')
  await page.getByRole('button', { name: /to eat/ }).first().click()
  await page.getByRole('button', { name: /Conjugations/ }).click()
  await page.waitForTimeout(400)
  await page.screenshot({ path: `e2e/screenshots/${info.project.name}/word-conj.png` })
})

test('switching to Polish changes UI and meanings', async ({ page }) => {
  await page.goto('/#/settings')
  await page.getByRole('radio', { name: 'Polski' }).click()
  await expect(page.getByRole('heading', { name: 'Ustawienia' })).toBeVisible()
  await page.goto('/#/library')
  await page.getByRole('searchbox').fill('daigaku')
  await expect(page.getByText('uniwersytet; uczelnia').first()).toBeVisible()
  await page.goto('/#/settings')
  await page.getByRole('radio', { name: 'English' }).click()
})

test('add a word with romaji → kana input', async ({ page }) => {
  await page.getByRole('button', { name: 'Add word' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByPlaceholder('食べる / taberu').pressSequentially('nekojita')
  await expect(dialog.getByPlaceholder('食べる / taberu')).toHaveValue('ねこじた')
  await dialog.getByPlaceholder('to eat').fill('cat tongue (can’t handle hot food)')
  await dialog.getByPlaceholder('jeść').fill('wrażliwy na gorące')
  await dialog.getByRole('button', { name: 'Save' }).click()
  await page.getByRole('searchbox').fill('nekojita')
  await expect(page.getByText('cat tongue').first()).toBeVisible()
})

test('import a pasted TSV list', async ({ page }) => {
  await page.goto('/#/import')
  await page.locator('textarea').fill('きょうりゅう\tdinosaur\nうちゅう\tspace; universe\nだいがく\tcollege\n')
  await expect(page.getByText('2 new')).toBeVisible()
  await expect(page.getByText(/1 already in your library/)).toBeVisible()
  await page.getByRole('button', { name: /Import 3 words/ }).click()
  await page.getByRole('searchbox').fill('uchuu')
  await expect(page.getByText('space; universe').first()).toBeVisible()
})

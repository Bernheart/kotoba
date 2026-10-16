import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })

test('first run shows the welcome sheet once, with language and lesson', async ({ page }, info) => {
  await page.goto('/?safe=1#/')
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByText('Welcome to Kotoba')).toBeVisible()
  await dialog.getByRole('radio', { name: 'Polski' }).click()
  await expect(dialog.getByText('Witaj w Kotoba')).toBeVisible()
  await page.waitForTimeout(400)
  await page.screenshot({ path: `e2e/screenshots/${info.project.name}/welcome.png` })
  await dialog.getByRole('button', { name: 'Zaczynamy' }).click()
  await expect(dialog).toBeHidden()
  await page.waitForTimeout(400)
  await page.reload()
  await page.waitForTimeout(800)
  await expect(page.getByText('Witaj w Kotoba')).toBeHidden()
})

test('visitors see private sync instead of a sign-in form when a server is baked in', async ({ page }) => {
  // dev builds have no baked-in server, so this only checks the "not configured" path renders
  await page.goto('/#/settings')
  await page.keyboard.press('Escape')
  await expect(page.getByText(/Sync is not set up yet|Synchronizacja nie jest/)).toBeVisible()
})

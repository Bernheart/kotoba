import { expect, test } from '@playwright/test'

test('sync section shows password sign-in once configured', async ({ page }, info) => {
  await page.goto('/#/settings')
  await page.getByPlaceholder(/Supabase URL/).fill('https://example.supabase.co')
  await page.getByPlaceholder('Supabase anon key').fill('sb_publishable_test')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByRole('button', { name: 'Create account' })).toBeVisible()
  await page.getByText('Sync between devices').scrollIntoViewIfNeeded()
  await page.screenshot({ path: `e2e/screenshots/${info.project.name}/sync-signin.png` })
})

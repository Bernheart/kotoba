import { expect, test } from '@playwright/test'

// Visual pass over every main screen; screenshots land in e2e/screenshots/<project>/ (git-ignored).
// `?safe=1` fakes the iPhone notch and home-indicator insets.
const SCREENS = [
  ['today', '/'],
  ['library', '/library'],
  ['settings', '/settings'],
  ['import', '/import'],
] as const

for (const [name, path] of SCREENS) {
  test(`screen: ${name}`, async ({ page }, info) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    await page.goto(`/?safe=1#${path}`)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(400)
    await page.screenshot({ path: `e2e/screenshots/${info.project.name}/${name}.png`, fullPage: false })
    expect(errors).toEqual([])
  })
}

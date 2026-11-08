import { expect, test, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'

const lesson3 = JSON.parse(readFileSync(new URL('../data/kanji/lesson-03.json', import.meta.url), 'utf8')) as {
  kanji: { kanji: string; meaning: { en: string }; words: { w: string; r: string }[] }[]
}

const shot = (page: Page, project: string, n: string) => page.screenshot({ path: `e2e/screenshots/${project}/${n}.png` })

/** Set a group of toggle chips so exactly `want` are pressed. */
async function chooseChips(page: Page, names: string[], want: string[]) {
  for (const name of names) {
    const chip = page.getByRole('button', { name, exact: true })
    const on = (await chip.getAttribute('aria-pressed')) === 'true'
    if (on !== want.includes(name)) await chip.click()
  }
}

const readingOf = (prompt: string) => {
  for (const k of lesson3.kanji) for (const w of k.words) if (w.w.split('／')[0] === prompt) return w.r.split('／')[0]!
  throw new Error(`No reading for ${prompt}`)
}

test('kanji quiz: word → reading on lesson 3 runs to the results screen', async ({ page }, info) => {
  test.setTimeout(90_000)
  await page.goto('/?safe=1#/study')
  await page.getByRole('link', { name: /Kanji/ }).click()
  await expect(page.getByRole('heading', { name: 'Kanji', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Kanji quiz' }).click()
  await chooseChips(page, ['L3', 'L4', 'L5', 'L6', 'L7', 'L8', 'L9', 'L10', 'L11', 'L12'], ['L3'])
  await chooseChips(page, ['Word → reading', 'Word → meaning', 'Kanji → meaning', 'Kanji → reading'], ['Word → reading'])
  await page.getByRole('radio', { name: '10' }).click()
  await page.getByRole('button', { name: 'Begin' }).click()

  let sawSanji = false
  for (let i = 0; i < 10; i++) {
    const prompt = (await page.getByTestId('kanji-prompt').textContent())!.trim()
    if (prompt === '三時') sawSanji = true
    const input = page.getByPlaceholder('Reading in kana or romaji…')
    await input.fill(readingOf(prompt))
    await page.getByRole('button', { name: 'Check' }).click()
    await expect(page.getByTestId('kanji-feedback')).toContainText('Correct')
    if (i === 0) await shot(page, info.project.name, 'kanji-quiz')
    await page.getByRole('button', { name: 'Continue' }).click()
  }
  await expect(page.getByText('Session complete')).toBeVisible()
  // which words come up is random; 三時 → さんじ is also checked directly in tests/kanji.test.ts
  if (!sawSanji) test.info().annotations.push({ type: 'note', description: '三時 not drawn this run; covered by tests/kanji.test.ts' })
})

test('kanji quiz marks a wrong reading wrong', async ({ page }) => {
  await page.goto('/?safe=1#/kanji/quiz')
  await chooseChips(page, ['L3', 'L4', 'L5', 'L6', 'L7', 'L8', 'L9', 'L10', 'L11', 'L12'], ['L3'])
  await chooseChips(page, ['Word → reading', 'Word → meaning', 'Kanji → meaning', 'Kanji → reading'], ['Word → reading'])
  await page.getByRole('button', { name: 'Begin' }).click()
  await page.getByPlaceholder('Reading in kana or romaji…').fill('ぬぬぬ')
  await page.getByRole('button', { name: 'Check' }).click()
  await expect(page.getByTestId('kanji-feedback')).toContainText('Not quite')
})

test('draw-and-check: 一 accepted left → right, rejected right → left with the correct stroke shown', async ({ page }, info) => {
  await page.goto('/?safe=1#/kanji')
  await page.locator('[data-kanji="一"]').click()
  await expect(page.getByTestId('kanji-sheet')).toBeVisible()
  await page.getByRole('button', { name: /Practise writing/ }).click()
  await page.getByRole('radio', { name: 'Draw & check' }).click()
  const box = (await page.getByTestId('stroke-canvas').boundingBox())!
  const at = (x: number, y: number) => [box.x + (box.width * x) / 109, box.y + (box.height * y) / 109] as const
  const draw = async (from: [number, number], to: [number, number]) => {
    await page.mouse.move(...at(...from))
    await page.mouse.down()
    await page.mouse.move(...at(...to), { steps: 12 })
    await page.mouse.up()
  }

  await draw([96, 50], [12, 54])
  await expect(page.getByTestId('stroke-status')).toContainText('Wrong direction')
  await expect(page.getByTestId('stroke-hint')).toBeAttached()
  await shot(page, info.project.name, 'kanji-draw-wrong')

  await draw([12, 54], [96, 50])
  await expect(page.getByTestId('stroke-status')).toContainText('Done')
  await expect(page.getByRole('button', { name: /Next kanji/ })).toBeVisible()
})

test('free draw shows the model and records the self-grade', async ({ page }) => {
  await page.goto(`/?safe=1#/kanji/write/${encodeURIComponent('二')}`)
  await page.getByRole('radio', { name: 'Free draw' }).click()
  const box = (await page.getByTestId('free-canvas').boundingBox())!
  await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.35)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.35, { steps: 8 })
  await page.mouse.up()
  await page.getByRole('button', { name: 'Check' }).click()
  // one line is not 二: the auto-check says so and suggests "Not quite"; overriding it is allowed
  await expect(page.getByTestId('free-result')).toContainText('1 of 2 strokes match')
  await page.getByRole('button', { name: /I got it right/ }).click()
  await expect(page.getByTestId('free-graded')).toBeVisible()
  // the grade is stored as kanji stats: Back opens the detail sheet, which shows them
  await page.getByRole('button', { name: 'Back' }).click()
  await expect(page.getByTestId('kanji-sheet')).toBeVisible()
  await expect(page.getByText('Writing: 1 right · 0 wrong')).toBeVisible()
})

test('library links to the kanji grid', async ({ page }) => {
  await page.goto('/?safe=1#/library')
  await page.getByRole('link', { name: 'L5' }).first().click()
  await expect(page.locator('[data-kanji="山"]')).toBeVisible()
  await expect(page.locator('[data-kanji="一"]')).toHaveCount(0)
})

test('write from meaning: prompt, free draw auto-check, results', async ({ page }, info) => {
  await page.goto('/?safe=1#/study')
  await page.getByRole('link', { name: /Write kanji/ }).click()
  await chooseChips(page, ['L3', 'L4', 'L5', 'L6', 'L7', 'L8', 'L9', 'L10', 'L11', 'L12'], ['L3'])
  await page.getByRole('radio', { name: 'Free draw + auto-check' }).click()
  await page.getByRole('radio', { name: '10' }).click()
  await page.getByRole('button', { name: 'Begin' }).click()
  await expect(page.getByTestId('draw-prompt')).toContainText('□')
  await shot(page, info.project.name, 'kanji-draw-prompt')
  // draw the answer itself, stroke by stroke, from the stroke data the app uses
  const strokes = JSON.parse(readFileSync(new URL('../data/kanji/strokes.json', import.meta.url), 'utf8')) as { strokes: Record<string, { pts: [number, number][][] }> }
  const lessonKanji = new Set(lesson3.kanji.map((k) => k.kanji))
  for (let i = 0; i < 10; i++) {
    // the kanji is revealed in the word once answered; before that, find it by elimination from the meaning
    const meaning = (await page.getByTestId('draw-prompt').locator('div').first().textContent())!.trim()
    const k = lesson3.kanji.find((x) => x.meaning.en === meaning)!
    expect(lessonKanji.has(k.kanji)).toBe(true)
    const box = (await page.getByTestId('free-canvas').boundingBox())!
    for (const st of strokes.strokes[k.kanji]!.pts) {
      await page.mouse.move(box.x + (box.width * st[0]![0]) / 109, box.y + (box.height * st[0]![1]) / 109)
      await page.mouse.down()
      for (const p of st.slice(1)) await page.mouse.move(box.x + (box.width * p[0]) / 109, box.y + (box.height * p[1]) / 109)
      await page.mouse.up()
    }
    await page.getByRole('button', { name: 'Check' }).click()
    await expect(page.getByTestId('free-result')).toContainText('match')
    await expect(page.getByTestId('free-result')).not.toContainText(' of ')
    if (i === 0) await shot(page, info.project.name, 'kanji-draw-checked')
    await page.getByRole('button', { name: /I got it right/ }).click()
    await page.getByRole('button', { name: 'Continue' }).click()
  }
  await expect(page.getByText('Session complete')).toBeVisible()
  // the record on the setup screen now lists what you write best
  await page.getByRole('button', { name: 'Again' }).click()
  await expect(page.getByTestId('write-record')).toContainText('You write best')
})

test('write from meaning: after a miss you can watch the strokes and draw again', async ({ page }) => {
  await page.goto('/?safe=1#/kanji/draw')
  await page.getByRole('radio', { name: 'Free draw + auto-check' }).click()
  await page.getByRole('button', { name: 'Begin' }).click()
  await page.getByRole('button', { name: 'Show the kanji' }).click()
  await expect(page.getByRole('img')).toBeVisible()
  // redraw: a fresh canvas whose check has nothing to grade (the miss already counted)
  await page.getByRole('button', { name: /Draw again/ }).click()
  const box = (await page.getByTestId('free-canvas').boundingBox())!
  await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.5)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.5, { steps: 8 })
  await page.mouse.up()
  await page.getByRole('button', { name: 'Check' }).click()
  await expect(page.getByTestId('free-result')).toBeVisible()
  await expect(page.getByRole('button', { name: /I got it right/ })).toHaveCount(0)
  // watch the stroke order again, then move on
  await page.getByRole('button', { name: /Show strokes/ }).click()
  await expect(page.getByRole('img')).toBeVisible()
  await expect(page.getByRole('button', { name: /Replay strokes/ })).toBeVisible()
  await page.getByRole('button', { name: 'Continue' }).click()
  await expect(page.getByTestId('draw-prompt')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Show the kanji' })).toBeVisible()
})

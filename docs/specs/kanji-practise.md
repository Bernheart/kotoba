# Kanji practise

## Goal
Practise the kanji from Genki I's reading-and-writing section (lessons 3–12, 145 kanji) inside Kotoba.
For each kanji the learner should know the kanji itself well, be able to read the example words
next to it "without furigana, or at least know their meaning", and know the most important meanings.

"Working" means the learner can:
- browse kanji by lesson and open a detail sheet for any kanji;
- run a kanji quiz with four question types:
  - word → type reading (e.g. 午後 → ごご, using the existing kana input; meaning shown after);
  - word → pick meaning (4 options, EN or PL per app language);
  - kanji → pick meaning (後 → "after");
  - kanji → pick reading (後 → ゴ / あと);
- watch a stroke-order animation of any kanji;
- practise writing with **draw-and-check** (draw each stroke; the app checks stroke direction and
  order and shows the correct stroke after a miss) and **free draw, self-grade** (draw on a canvas,
  compare with the model, mark yourself right or wrong).

## Constraints
- Kanji data is transcribed from the Genki I textbook PDF only
  (`../full_genki/Genki Textbook 1 - 3rd Edition (1).pdf`, printed p. 304 = PDF p. 312 onwards).
  The pages are images with no text layer, so they are read visually.
- Per kanji, store what the page shows: Genki number (001–145), lesson, on readings (▶),
  kun readings (▷), meaning, stroke count/order, and **all** example words, each with reading and
  meaning. Keep a flag for the words highlighted in the book (the most important ones).
- On readings are shown in **katakana** and kun readings in **hiragana**, for every kanji.
- Meanings are EN + PL. Genki has English only: the implementer writes the PL meanings and lists
  them for the user's review (like `data/VERIFY.md`).
- Stroke data comes from KanjiVG, bundled with the app for only these 145 kanji (a generated JSON),
  so it works offline in the PWA. Credit KanjiVG (CC BY-SA 3.0) in Settings/README.
- Kanji practise is a quiz, not an SRS: no due queue, no kanji in Flashcards or Today due counts.
- Per-kanji (and per-word) right/wrong stats are kept and synced through the existing Supabase
  records table and included in backup/export. Weak kanji are offered first / as an option.
- Lesson chips work like the other practice modes (pre-select up to the current lesson).
- Works on iPhone (finger drawing in the PWA) and desktop (mouse).

## Out of scope
- Handwriting recognition (no ML recognising arbitrary drawn kanji).
- Any change to vocab data (`data/vocab/*.json` stays untouched).
- Genki II kanji (lessons 13–23).

## Acceptance criteria
- [ ] `data/kanji/lesson-03.json` … `lesson-12.json` hold 145 kanji in total, numbered as in Genki.
- [ ] Every kanji has ≥1 reading, an EN and PL meaning, stroke data, and ≥1 example word.
- [ ] On readings are stored/shown in katakana, kun readings in hiragana.
- [ ] Every example word has reading, EN and PL meaning, and a highlighted flag.
- [ ] Study page has a Kanji tile; Library has a Kanji section; both open a per-lesson kanji grid.
- [ ] Tapping a kanji opens a detail sheet: big kanji, on/kun, meaning, example words, stroke
      animation, and a button to practise writing.
- [ ] Kanji quiz setup lets the user choose lessons, count, and question types (the four above).
- [ ] Word → type reading accepts the correct kana and marks wrong answers wrong.
- [ ] Draw-and-check accepts a stroke drawn in the right direction/order and rejects a wrong one
      with the correct stroke shown.
- [ ] Free draw shows the model after drawing and records the self-grade.
- [ ] Per-kanji stats persist, sync to another device, and appear in backup/export.
- [ ] Kanji never appear in review queues or due counts.
- [ ] All UI text has EN and PL strings.
- [ ] Works offline once the PWA is installed.

## Files affected
New:
- `data/kanji/lesson-03.json` … `lesson-12.json` — transcribed kanji data
- PL-meaning review list (e.g. `data/kanji/VERIFY.md`)
- `scripts/kanji-strokes.mjs` — extracts KanjiVG paths for the 145 kanji into bundled JSON
- `src/lib/kanji.ts` — loading, types, quiz question building, stats
- `src/features/kanji/` — KanjiPage (grid), KanjiSheet (detail), StrokeCanvas (animation,
  draw-and-check, free draw), kanji quiz
- `tests/kanji.test.ts`, `e2e/kanji.spec.ts`

Changed:
- `src/App.tsx` — routes
- `src/features/study/StudyPage.tsx` — Kanji tile
- `src/features/library/LibraryPage.tsx` — Kanji section
- `src/lib/i18n/en.ts`, `src/lib/i18n/pl.ts`
- `src/lib/db.ts` — kanji progress table (new Dexie version)
- `src/lib/sync/engine.ts` / `core.ts` — new record kind
- `src/lib/backup.ts` — include kanji progress
- `README.md` — KanjiVG credit

## Verification
1. `npm run typecheck && npm test` pass, including `tests/kanji.test.ts`
   (145 kanji over L3–12; every kanji has reading, EN+PL meaning, stroke data; on readings are
   katakana, kun readings hiragana; every word has reading + EN + PL).
2. `npm run e2e` passes, including `e2e/kanji.spec.ts`:
   - Study → Kanji → pick L3 → word → type reading → answer 三時 with さんじ → marked correct →
     results screen.
   - Open 一 → practise writing → draw its stroke left→right → accepted; right→left → rejected
     with the correct stroke shown.
3. Spot-check 5 kanji from different lessons against the Genki PDF pages.
4. Manual, end to end on iPhone: install/open the PWA, go offline, open Kanji, run a quiz on L10,
   draw a kanji with a finger in draw-and-check, then check the stats show up on the Mac after sync.

## Open questions
- Should the user's class notes (`../notatki`, L10 kanji with on in katakana / kun in hiragana) be
  used to double-check L10? The user chose "transcribe pages only" for the data source.
- Exact shape of "weak kanji": a separate quiz option, or weak items weighted first in every quiz?
- Library: a separate Kanji tab/segment, or a section below the word list?

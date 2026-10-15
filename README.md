# Kotoba 言葉

A personal Japanese vocabulary trainer that follows **Genki (3rd ed.) lessons 1–10**. It is dark-mode first, phone-first and works offline. Progress syncs between Mac and iPhone.

- **Spaced repetition with FSRS.** The same scheduler Anki now uses. It includes sibling burying, leech rescue with mnemonics, and new words gated by your current Genki lesson.
- **Practice modes.** Multiple choice, typing (romaji→kana as you type), listening, shadowing with record and compare, cloze, sentence builder, a matching game, a kana trainer, a conjugation trainer, a weak-words deck and a 5-minute session.
- **Word library.** Search kanji, kana, romaji, English or Polish. Filter, group, and sort (gojūon order, weakest first, and more). Furigana can be toggled, and every word and example sentence has audio.
- **EN / PL** interface and meanings.

> The vocabulary was **written for this app** in the style of N5–N4 beginner lists and tagged by Genki lesson. It is **not** copied from the textbook. Entries marked with a yellow dot ("Please verify") are ones I wasn't sure about. They are listed in [`data/VERIFY.md`](data/VERIFY.md) and appear under *Words → Filter → Needs check*. Import your own lesson lists to match your course exactly (see below).

---

## Run it locally

```bash
npm install
npm run dev          # http://localhost:5173 (also reachable from your phone on the same Wi-Fi via the printed network URL)
npm run check        # type check + unit tests (FSRS, sync merge, importer, conjugations, vocabulary validator)
npm run e2e          # Playwright: iPhone-size WebKit + desktop Chromium, screenshots in e2e/screenshots/
npm run build        # production PWA in dist/
```

## Put it online (GitHub Pages)

The workflow in `.github/workflows/deploy.yml` builds, tests and deploys on every push to `main`. It only needs to be set up once:

```bash
gh repo create Bernheart/kotoba --public --source=. --remote=origin --push
```

```bash
gh api -X POST repos/Bernheart/kotoba/pages -f build_type=workflow
```

```bash
git push
```

After 1–2 minutes the app is live at **https://bernheart.github.io/kotoba/**. You can watch the build in the repo's **Actions** tab.

The repo has to be public for free GitHub Pages. It contains only the code and the generated vocabulary. Your own words and progress stay in the app, never in the repo. For a private repo, use Cloudflare Pages instead: connect the repo, set the build command to `npm run build`, the output folder to `dist`, and the env var `BASE_PATH=/`.

## Install on your iPhone (do this before you start studying)

1. Open **https://bernheart.github.io/kotoba/** in **Safari**.
2. Tap **Share** (□↑), then **Add to Home Screen**, then **Add**.
3. Open Kotoba from the Home Screen. It runs full screen, offline, like a native app.

**Storage on iOS:**
- **Separate storage.** A Home Screen app keeps its data separately from Safari. Progress made in a Safari tab does **not** carry over to the installed app, so install first, or move your data with sync or a backup.
- **Eviction.** Safari can delete website data after about 7 days without visits. Installed Home Screen apps are much safer (the app asks for persistent storage; check *Settings → Data & backup → Storage*).
- **Backups.** Still keep sync on, or export a backup now and then.

On the Mac, any browser works. In Chrome or Edge you can also use *Install app* from the address bar.

## Sync Mac ⇄ iPhone (Supabase, free)

Sync is optional. Without it the app works fully offline on one device. Setup takes about 10 minutes, once:

1. Create a free account and project at <https://supabase.com>. Any region is fine. Save the database password somewhere.
2. Open **SQL Editor**, then **New query**. Paste the contents of [`supabase/schema.sql`](supabase/schema.sql) and click **Run**.
3. Go to **Authentication → Sign In / Providers**. Make sure **Email** is enabled. Turning off "Confirm email" is fine.
4. Go to **Authentication → Emails → Magic Link** and replace the template body with:
   ```html
   <h2>Your Kotoba code</h2>
   <p>Enter this code in the app: <strong>{{ .Token }}</strong></p>
   ```
   The app uses the **6-digit code**, not the link. A link would open in Safari, which can't sign in the installed Home Screen app because its storage is separate.
5. Go to **Project Settings → API** (or **Data API**). Copy the **Project URL** and the **anon / publishable key**.
6. Paste both into the app on each device. Either:
   - in **Settings → Sync between devices** on each device, or
   - once, for everyone: add them as repository **variables** `SUPABASE_URL` and `SUPABASE_ANON_KEY` under *GitHub → repo → Settings → Secrets and variables → Actions → Variables*, then re-run the deploy.
7. On each device, enter your email, tap **Send code**, then type the code. You stay signed in.

**How sync works:**
- **Local-first.** Everything is saved locally first. Sync runs on launch, when you come back online, when the app returns to the foreground, a few seconds after you answer, and when you tap *Sync now*.
- **Conflicts.** For each card, word and setting, the newest edit wins (by timestamp). Review history is append-only, so no answer is ever lost.
- **Free-tier pause.** Supabase pauses free projects after 7 days without activity. Daily use keeps it awake, and so does the *Keep Supabase awake* workflow once the repo variables are set. If it does pause, the app keeps working locally and shows a hint. Click **Restore** in the Supabase dashboard and sync resumes.

## Backup (works without sync)

Go to **Settings → Data & backup → Export backup**.
- **On iPhone:** the share sheet opens. Choose **Save to Files**, then **iCloud Drive**.
- **On Mac:** the backup downloads as a `.json` file.

**Restore from backup** can *merge* the file into the device (newest wins) or *replace* everything on it. The Today screen reminds you to back up after 7 days (30 if sync is working).

## Adding your own words

- **One word:** go to **Words → ＋**. Type romaji and it turns into kana (the iPhone Japanese keyboard works too). Add meanings in EN/PL, and the type is guessed for you. An example sentence is optional.
- **Many words:** go to **Words → ⇧ (Import)**. Paste text or pick a file. The importer understands:
  - TSV or CSV like `だいがく⇥college; university` or `"おかね","money"`
  - kanji lists like `"午前","(ごぜん)\nA. M."`, `"東","higashi (ひがし)\neast"`, `一日（ついたち）` or `一\tいち`
  - lists with an example after the word (`"ありがとう ほんとうに ありがとう","thank you Thank you, really."`)
  - Anki exports with `漢字[かんじ]` furigana, files with a header row (Japanese / Reading / English / Polish / Type / Lesson / Tags), and JSON arrays

  The lesson is taken from the file name (`genki7.csv` → lesson 7). Words you already have are merged instead of duplicated, so a kanji list upgrades your kana entries to their kanji form. Rows without a reading can be fixed inline before importing.
- **Into the built-in data:** edit `data/vocab/lesson-NN.json`. Example sentences use a small markup:
  `{毎日|まいにち} {日本語|にほんご}を *{勉強します|べんきょうします}*。`
  - `{漢字|かな}` adds furigana; okurigana is aligned automatically.
  - Spaces split the sentence into builder tiles.
  - `*…*` marks the word for cloze.

  `npm run check` validates the files.

## Single-file version (offline on the Mac)

```bash
npm run build:single   # → dist-single/kotoba.html (≈1.2 MB, everything inlined)
```

Double-click the file to open it in Chrome or Safari on the Mac. What's different in this mode:
- **No service worker or install, no web fonts.** It falls back to the system's Hiragino fonts.
- **Fragile storage.** Pages opened from `file://` get browser storage that some browsers wipe or isolate, so the app shows a warning. Export backups.
- **Sync** works if you're online, but it isn't recommended here.
- **Not for iPhone.** The Files app opens HTML in Quick Look, which won't run the app properly. Use the hosted PWA on the phone.

## Audio

Audio uses the Web Speech API with Japanese voices. **On iPhone**, if you hear nothing, go to *Settings → Accessibility → Spoken Content → Voices → Japanese* and download a voice (Kyoko or O-ren). **On a Mac**, go to *System Settings → Accessibility → Spoken Content → System voice → Manage Voices… → Japanese*. iOS only allows sound after a tap, so the first sound in a session always comes from a button.

## Keyboard shortcuts (Mac)

| Key | Action |
|---|---|
| Space | Reveal the answer |
| 1–4 | Again, hard, good, easy |
| ← / → | Again / good |
| P | Play audio |
| F | Toggle furigana |
| Z | Undo |
| / | Search the library |
| Esc | Exit |

## How it's built

- Vite, React 19, TypeScript, Tailwind CSS 4 and Motion.
- Dexie (IndexedDB) for local storage, ts-fsrs (FSRS-6) for scheduling, WanaKana for romaji→kana input.
- vite-plugin-pwa (Workbox) for the PWA, and Supabase (lazy-loaded) for sync.

Data model and decisions: see `src/lib/types.ts`, `src/lib/db.ts`, `src/lib/srs/`, `src/lib/sync/` and `supabase/schema.sql`.

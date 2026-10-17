# Deck miner (`tools/arcane`)

Builds a private word deck from **your own** subtitle files of a show (written for Arcane's Japanese dub, works for any show): the most useful words you don't know yet, each with one real line from the show.

> **Never commit subtitles or the generated deck.** They're derived from copyrighted media and are for your personal study only. Everything is read from and written to your subtitle folder, outside this repo. `.gitignore` also blocks `*.srt`, `*.vtt`, `*.ass` and `arcane-*.json` as a safety net. Import the deck via *Words → Import*, so it lives only in your app (IndexedDB) and your private sync.

## 1. Subtitles

Export the Japanese track of each episode with asbplayer (Ctrl+Shift+F on Netflix, then the download icon in the side panel) into one folder, by default `~/Documents/japanese/arcane-subs/`.

- The file name must contain the episode as `S01E03` (asbplayer's names already do).
- Japanese is detected from `ja` / `japoński` / `Japanese` in the name. English files (`en` / `angielski`) are optional and only give translation hints.
- `.srt`, `.vtt` and `.ass` are supported.

If the show has a Japanese **CC** track, prefer it: it transcribes the dub. The plain Japanese track is usually a shortened translation of the English script. It still works for vocabulary, but its lines won't match the audio word for word.

## 2. Run

```bash
npm run arcane -- --backup ~/Documents/japanese/kodoba-backups/kotoba-backup-2026-10-16.json
```

Options:
- `--subs DIR` sets the subtitle folder.
- `--top N` sets the deck size (default 300).
- `--deck ID` sets the deck id (default `arcane`).
- `--backup FILE` is a Kotoba backup; your own words count as known.
- `--names FILE` replaces [`names.txt`](names.txt), the list of character and place names to ignore.

The script:
1. **Parses** the subtitles. It drops speaker labels, sound cues, lyrics and signs, and joins sentences split with `―`.
2. **Tokenizes** them with kuromoji (IPADIC). Nouns and one-kanji suffixes are merged (評議+会 → 評議会).
3. **Filters.** Particles, auxiliaries, numbers and names don't count as words. Words in `data/vocab` and your own words count as known (by written form, or by reading when written in kana).
4. **Ranks** the new words by occurrences × the number of episodes they appear in, then prints the **coverage report**: the % of spoken tokens you know now, and after the top 100/200/300/500.
5. **Picks one unique line per word.** It prefers 6–30 characters with the fewest other words that are still new at that point in the deck. Words with the fewest candidate lines choose first.
6. **Writes `<subs>/arcane-draft.json`.** Each entry has the word, reading, type, count, and the example as Kotoba markup with its `S1E3 · 12:34` ref.

## 3. Meanings → deck

Write `<subs>/arcane-meanings.json`, keyed by the word's written form:

```json
{
  "扉": { "en": "door", "pl": "drzwi", "ex": { "en": "Open the door.", "pl": "Otwórz drzwi." } },
  "大勢": { "kana": "おおぜい", "en": "crowd; many people", "pl": "tłum; wiele osób", "ex": { "en": "…", "pl": "…" } },
  "作れる": { "skip": true, "en": "", "pl": "" }
}
```

Optional fields:
- `kana` / `type` / `furigana` fix the tokenizer's guesses.
- `ja` replaces the example markup.
- `skip` drops a misparsed token or a name. Skipped words count as known in the report.

Run the same command again. It merges the meanings and validates every word with the rules of `tests/vocab.test.ts`, then writes `<subs>/arcane-deck.json`:
- `deck: "arcane"`
- `frequency` = rank
- tags `arcane-1/2/3` for ranks 1–100 / 101–200 / 201–300

## 4. Import

In Kotoba, open **Words → Import → Choose file** and pick `arcane-deck.json`. The words become your own words in deck **Arcane**:
- a tile under **Study** (and **Today**) with its own queue;
- new words in rank order, at *Settings → New words per day in decks* (default 10);
- never mixed into your Genki reviews;
- every practice mode can be limited to the deck with its chip.

Re-importing an updated deck refreshes the words in place, and your progress is kept.

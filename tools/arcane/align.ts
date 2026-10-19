/**
 * Translation tracks re-timed to the Japanese lines. Each track of a multi-track export keeps its own
 * timing (English lines often end before the Japanese one), so when auto-pause stops at the end of a
 * Japanese line the translation is gone. Giving every translation line the timing of the Japanese line it
 * overlaps keeps both on screen together.
 */
import { cueLanguage, translationLanguage, type Cue } from './subs'

/** Japanese, English and Polish cues of one file; Latin lines that could be either go to both. */
export function splitTracks(cues: Cue[]): { ja: Cue[]; en: Cue[]; pl: Cue[] } {
  const out = { ja: [] as Cue[], en: [] as Cue[], pl: [] as Cue[] }
  for (const c of cues) {
    if (cueLanguage(c.text) === 'ja') out.ja.push(c)
    else if (/\p{L}/u.test(c.text)) {
      const lang = translationLanguage(c.text)
      if (lang !== 'pl') out.en.push(c)
      if (lang !== 'en') out.pl.push(c)
    }
  }
  return out
}

/**
 * One cue per Japanese line, timed like it, holding the translation lines that overlap it (by more than
 * `slack` seconds). A Japanese line without an overlap takes a translation line that ends or starts within
 * `near` seconds of it; one with neither gets no translation cue.
 */
export function retime(base: Cue[], other: Cue[], slack = 0.1, near = 0.4): Cue[] {
  const out: Cue[] = []
  for (const b of base) {
    let hits = other.filter((o) => o.start < b.end - slack && o.end > b.start + slack)
    if (!hits.length) hits = other.filter((o) => Math.abs(o.end - b.start) <= near || Math.abs(o.start - b.end) <= near).slice(0, 1)
    const lines: string[] = []
    for (const h of [...hits].sort((x, y) => x.start - y.start)) for (const l of h.text.split('\n')) if (!lines.includes(l)) lines.push(l)
    if (lines.length) out.push({ ep: b.ep, start: b.start, end: b.end, text: lines.join('\n') })
  }
  return out
}

function stamp(sec: number): string {
  const ms = Math.round(sec * 1000)
  const p = (n: number, w = 2) => String(n).padStart(w, '0')
  return `${p(Math.floor(ms / 3_600_000))}:${p(Math.floor(ms / 60_000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`
}

export function toSrt(cues: Cue[]): string {
  return cues.map((c, i) => `${i + 1}\n${stamp(c.start)} --> ${stamp(c.end)}\n${c.text}\n`).join('\n')
}

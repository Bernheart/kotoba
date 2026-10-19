/**
 * Subtitle parsing for the deck miner: SRT / WebVTT / ASS → cues with episode + time.
 * Formatting, speaker labels like （ヴァイ）, sound cues like (爆発音)/［爆発音］ and ♪ lines are removed.
 */

export interface Cue {
  /** Episode label, e.g. `S1E3` */
  ep: string
  /** Seconds from the start of the episode */
  start: number
  end: number
  text: string
}

/** `Arcane S01E03 … .srt` / `S1E3.ja.srt` → `S1E3` (season and episode without zero padding). */
export function episodeOf(fileName: string): string | undefined {
  const m = /s(\d{1,2})\s*e(\d{1,2})/i.exec(fileName)
  return m ? `S${Number(m[1])}E${Number(m[2])}` : undefined
}

/** Language of a subtitle file from its name: `.ja.` / `japoński` / `Japanese` → ja, `.en.` / `angielski` / `English` → en. */
export function languageOf(fileName: string): 'ja' | 'en' | undefined {
  const n = fileName.toLowerCase()
  if (/(^|[ ._\-[(])(ja|jpn|japanese|japoński|japonski|日本語)([ ._\-\])]|$)/.test(n)) return 'ja'
  if (/(^|[ ._\-[(])(en|eng|english|angielski)([ ._\-\])]|$)/.test(n)) return 'en'
  return undefined
}

const SPEAKER = /^[（(][^）)]{1,12}[）)]\s*/u
const SOUND = /[［\[][^］\]]*[］\]]|[（(][^）)]*音[^）)]*[）)]/gu

/** One cue's text: no tags, no speaker label, no sound description; lines joined with a space (or kept, `\n`). */
export function cleanText(raw: string, joiner = ' '): string {
  const lines = raw
    .replace(/\{\\[^}]*\}/g, '') // ASS override tags
    .replace(/\\N/gi, '\n')
    .replace(/<[^>]+>/g, '') // SRT/VTT tags
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .split(/\r?\n/)
    .filter((l) => !/^\s*[♪♫]/u.test(l)) // song lyrics
    .map((l) =>
      l
        .replace(SOUND, '')
        .replace(SPEAKER, '')
        .replace(/^[-‐–]\s*/, '') // dialogue dash
        .replace(/[♪♫]/gu, '')
        .trim(),
    )
    .filter(Boolean)
  return lines
    .map((l) => l.replace(/\s+/g, ' '))
    .join(joiner)
    .trim()
}

function seconds(ts: string): number {
  const m = /(?:(\d+):)?(\d{1,2}):(\d{1,2})[.,](\d{1,3})/.exec(ts)
  if (!m) return NaN
  return Number(m[1] ?? 0) * 3600 + Number(m[2]) * 60 + Number(m[3]) + Number(m[4]!.padEnd(3, '0')) / 1000
}

/** SRT and WebVTT: blocks separated by blank lines, a `-->` timing line, then text. */
function parseTimed(text: string, ep: string, joiner: string): Cue[] {
  const cues: Cue[] = []
  for (const block of text.replace(/\r/g, '').split(/\n{2,}/)) {
    const lines = block.split('\n')
    const ti = lines.findIndex((l) => l.includes('-->'))
    if (ti < 0) continue
    const [a, b] = lines[ti]!.split('-->')
    const start = seconds(a ?? '')
    const end = seconds(b ?? '')
    const body = cleanText(lines.slice(ti + 1).join('\n'), joiner)
    if (body && Number.isFinite(start)) cues.push({ ep, start, end: Number.isFinite(end) ? end : start, text: body })
  }
  return cues
}

/** ASS: `Dialogue: layer,start,end,style,name,marginL,marginR,marginV,effect,text` lines. */
function parseAss(text: string, ep: string, joiner: string): Cue[] {
  const cues: Cue[] = []
  for (const line of text.split(/\r?\n/)) {
    if (!line.startsWith('Dialogue:')) continue
    const parts = line.slice(9).split(',')
    if (parts.length < 10) continue
    const body = cleanText(parts.slice(9).join(','), joiner)
    const start = seconds(`${parts[1]!.trim()}0`)
    const end = seconds(`${parts[2]!.trim()}0`)
    if (body && Number.isFinite(start)) cues.push({ ep, start, end, text: body })
  }
  return cues
}

/** `keepLines` keeps a cue's line breaks (for writing subtitle files back out). */
export function parseSubtitles(text: string, ep: string, fileName = '', opts: { keepLines?: boolean } = {}): Cue[] {
  const t = text.replace(/^\uFEFF/, '')
  const joiner = opts.keepLines ? '\n' : ' '
  const cues = /\.ass$|\.ssa$/i.test(fileName) || /^\[Script Info\]/m.test(t) ? parseAss(t, ep, joiner) : parseTimed(t, ep, joiner)
  return cues.sort((x, y) => x.start - y.start)
}

/**
 * Japanese subtitles split long sentences over cues with a trailing ― or ⸺ (dash). Join those with the next cue
 * (when it follows within `gap` seconds) so example sentences are whole.
 */
export function mergeContinuations(cues: Cue[], gap = 1.5): Cue[] {
  const out: Cue[] = []
  for (const c of cues) {
    const prev = out.at(-1)
    if (prev && prev.ep === c.ep && /[―—⸺]$/u.test(prev.text) && c.start - prev.end <= gap) {
      prev.text = `${prev.text.replace(/[―—⸺]+$/u, '')}${c.text}`
      prev.end = c.end
    } else out.push({ ...c })
  }
  for (const c of out) c.text = c.text.replace(/[―—⸺]+$/u, '…')
  return out
}

// Words only one of the two languages uses (to, go, no, a, i, on, do… exist in both and decide nothing).
const PL_WORDS = new Set(
  'nie jest jestem jesteś są tak czy jak ale mnie mną tylko teraz tam co ty ja jej mi mam masz ma był była było były żeby może wiem chcesz dobra chodź proszę dlaczego czemu kurwa nas wam gdzie kto dla że się już wszystko coś nic mój moja twój twoja jego będzie trzeba musisz musimy możesz zrobić robisz tego tej tym ta te jeszcze bardzo przez dziecko'.split(' '),
)
const EN_WORDS = new Set(
  "the you your you're it's it is are and of what that this we me my not don't can't in for with be have he she they just know get here there all about why how who where when now out up right yeah okay come let's did will can but if our us him her his them been got gonna want need see look think never ever one would could should".split(' '),
)

/**
 * Language of a Latin-script cue: `pl` / `en` by Polish letters and words found only in one language, or
 * undefined when it can't tell (short lines like "Vi?" or "Jinx!", which read the same in both).
 */
export function translationLanguage(text: string): 'en' | 'pl' | undefined {
  if (/[ąćęłńóśźż]/iu.test(text)) return 'pl'
  let pl = 0
  let en = 0
  for (const w of text.toLowerCase().match(/[\p{L}']+/gu) ?? []) {
    if (PL_WORDS.has(w)) pl++
    if (EN_WORDS.has(w)) en++
  }
  return pl > en ? 'pl' : en > pl ? 'en' : undefined
}

/**
 * Language of one cue. asbplayer can export several loaded tracks into one file (Japanese, English and
 * Polish cues interleaved), so each cue is sorted on its own: Japanese script → ja, then Polish or
 * English (undecided Latin text counts as English here).
 */
export function cueLanguage(text: string): 'ja' | 'en' | 'pl' | undefined {
  if (/[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u.test(text)) return 'ja'
  if (!/\p{L}/u.test(text)) return undefined
  return translationLanguage(text) ?? 'en'
}

/** Drop channel idents and on-screen titles that aren't dialogue. */
export function isDialogue(text: string): boolean {
  if (/^NETFLIX/i.test(text)) return false
  if (/^[“"「『].*[”"」』]$/u.test(text) && text.length <= 16) return false // signs / captions
  return /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u.test(text)
}

/** `S1E3 · 12:34` (episode · time) */
export function refOf(c: Pick<Cue, 'ep' | 'start'>): string {
  const s = Math.floor(c.start)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = String(s % 60).padStart(2, '0')
  return `${c.ep} · ${h ? `${h}:${String(m).padStart(2, '0')}` : m}:${ss}`
}

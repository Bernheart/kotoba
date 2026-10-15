/** A "study day" starts at 04:00 local time (Anki's default), so late-night reviews count for the same day. */
export const ROLLOVER_HOUR = 4
export const DAY_MS = 86_400_000

export function studyDay(at: number | Date = Date.now(), rollover = ROLLOVER_HOUR): string {
  const d = new Date(typeof at === 'number' ? at : at.getTime())
  d.setHours(d.getHours() - rollover)
  return ymd(d)
}

export function ymd(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

/** Epoch ms when the current study day ends (next 04:00). */
export function endOfStudyDay(at: number = Date.now(), rollover = ROLLOVER_HOUR): number {
  const d = new Date(at)
  const end = new Date(d)
  end.setHours(rollover, 0, 0, 0)
  if (d.getHours() >= rollover) end.setDate(end.getDate() + 1)
  return end.getTime()
}

export function addDays(day: string, n: number): string {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number]
  const date = new Date(y, m - 1, d + n, 12)
  return ymd(date)
}

export function dayDiff(a: string, b: string): number {
  const pa = a.split('-').map(Number) as [number, number, number]
  const pb = b.split('-').map(Number) as [number, number, number]
  return Math.round((Date.UTC(pb[0], pb[1] - 1, pb[2]) - Date.UTC(pa[0], pa[1] - 1, pa[2])) / DAY_MS)
}

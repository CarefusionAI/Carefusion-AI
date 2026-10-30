/** Pure helpers for the citizen medicines screens (dates in India time, opening hours). */

/** YYYY-MM-DD plus n days (calendar arithmetic, no time zone). */
export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** Whole days from a to b (YYYY-MM-DD); negative when b is before a. */
export function daysBetween(a: string, b: string): number {
  return Math.round((new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime()) / 86_400_000)
}

/** HH:MM in India time. */
export function hhmmIst(d: Date | string): string {
  const t = new Date(new Date(d).getTime() + 5.5 * 3600_000)
  return t.toISOString().slice(11, 16)
}

/** "PHC Konni" from "Hospital Pharmacy, PHC Konni"; the full text when there is no comma. */
export function shortPlace(name: string): string {
  const i = name.lastIndexOf(',')
  return i >= 0 ? name.slice(i + 1).trim() : name
}

const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']

function dayRange(key: string): number[] {
  const parts = key.toLowerCase().split('-').map((p) => DAYS.indexOf(p.trim().slice(0, 3)))
  if (parts.some((p) => p < 0)) return []
  if (parts.length === 1) return [parts[0]!]
  const out: number[] = []
  let d = parts[0]!
  for (let n = 0; n < 7; n++) {
    out.push(d)
    if (d === parts[1]) break
    d = (d + 1) % 7
  }
  return out
}

function minutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return (h ?? 0) * 60 + (m ?? 0)
}

/**
 * Opening hours look like {"mon-sun": [["08:00","20:00"]]}. Hours that are not listed count as open
 * (the finder should not hide a pharmacy only because nobody typed its hours).
 */
export function openStatus(hours: unknown, now: Date): { openNow: boolean; text: string } {
  if (!hours || typeof hours !== 'object' || Object.keys(hours as object).length === 0) {
    return { openNow: true, text: 'Hours not listed' }
  }
  const ist = new Date(now.getTime() + 5.5 * 3600_000)
  const day = ist.getUTCDay()
  const mins = ist.getUTCHours() * 60 + ist.getUTCMinutes()
  const windows: [number, number][] = []
  for (const [key, val] of Object.entries(hours as Record<string, unknown>)) {
    if (!dayRange(key).includes(day) || !Array.isArray(val)) continue
    for (const w of val) {
      if (Array.isArray(w) && typeof w[0] === 'string' && typeof w[1] === 'string') windows.push([minutes(w[0]), minutes(w[1])])
    }
  }
  windows.sort((a, b) => a[0] - b[0])
  const cur = windows.find(([s, e]) => mins >= s && mins < e)
  const pad = (n: number) => String(Math.floor(n / 60)).padStart(2, '0') + ':' + String(n % 60).padStart(2, '0')
  if (cur) return { openNow: true, text: `Open till ${pad(cur[1])}` }
  const later = windows.find(([s]) => s > mins)
  if (later) return { openNow: false, text: `Closed · opens ${pad(later[0])}` }
  return { openNow: false, text: 'Closed now' }
}

// Small formatting helpers for the Doctor app. All times show in India time.
const TZ = 'Asia/Kolkata'

function dateOf(iso: string | null | undefined): Date | null {
  if (!iso) return null
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00+05:30` : iso)
  return Number.isNaN(d.getTime()) ? null : d
}

export function fmtTime(iso: string | null | undefined): string {
  const d = dateOf(iso)
  return d ? d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: TZ }) : '-'
}

export function fmtDay(iso: string | null | undefined): string {
  const d = dateOf(iso)
  return d ? d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', timeZone: TZ }) : '-'
}

export function fmtDayTime(iso: string | null | undefined): string {
  const d = dateOf(iso)
  return d ? `${fmtDay(iso)}, ${fmtTime(iso)}` : '-'
}

export function fmtLongDate(iso: string | null | undefined): string {
  const d = dateOf(iso)
  return d ? d.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: TZ }) : ''
}

/** 1830 -> "30:30" */
export function fmtClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds))
  const mm = String(Math.floor(s / 60)).padStart(2, '0')
  const ss = String(s % 60).padStart(2, '0')
  return `${mm}:${ss}`
}

export function pct(n: number | null | undefined): number {
  return Math.round((n ?? 0) * 100)
}

export function initials(name: string): string {
  const parts = name.replace(/^Dr\.?\s+/i, '').split(/\s+/).filter(Boolean)
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1]![0] : '')).toUpperCase()
}

export function sexLetter(sex: string | null | undefined): string {
  const s = (sex ?? '').toLowerCase()
  if (s.startsWith('f')) return 'F'
  if (s.startsWith('m')) return 'M'
  return s ? s[0]!.toUpperCase() : '?'
}

export function fmtBytes(n: number | null | undefined): string {
  if (!n) return ''
  if (n > 1_000_000) return `${(n / 1_000_000).toFixed(1)} MB`
  return `${Math.max(1, Math.round(n / 1000))} KB`
}

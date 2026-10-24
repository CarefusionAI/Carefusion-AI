import type { DateKind } from '@carefusion/shared/dist/citizen-app.js'

const KIND_BY_TYPE: Record<string, DateKind> = {
  appointment: 'appt',
  follow_up: 'appt',
  checkup_due: 'appt',
  treatment_session: 'appt',
  refill_due: 'med',
  medicine_dose: 'med',
  prescription_expiry: 'med',
  test_due: 'test',
  vaccination_due: 'vac',
  blood_donation_eligible: 'give',
  past_visit: 'visit',
  personal_reminder: 'personal',
}

/** records.dated_event_type -> the colour/kind the Dates screen uses. */
export function kindOfType(type: string): DateKind {
  return KIND_BY_TYPE[type] ?? 'other'
}

/** Start and end (UTC instants) of a YYYY-MM month in Indian Standard Time. */
export function monthRangeIst(month: string): { start: Date; end: Date } {
  const m = /^(\d{4})-(\d{2})$/.exec(month)
  if (!m) throw new Error('month must be YYYY-MM')
  const y = Number(m[1])
  const mo = Number(m[2])
  const IST_MS = 5.5 * 3600_000
  const start = new Date(Date.UTC(y, mo - 1, 1) - IST_MS)
  const end = new Date(Date.UTC(y, mo, 1) - IST_MS)
  return { start, end }
}

/** Whole calendar days between two instants, counted in IST (so 23:00 and 01:00 next day = 1). */
export function daysBetweenIst(from: Date, to: Date): number {
  const IST_MS = 5.5 * 3600_000
  const a = Math.floor((from.getTime() + IST_MS) / 86_400_000)
  const b = Math.floor((to.getTime() + IST_MS) / 86_400_000)
  return b - a
}

function icsDate(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
}

function icsEscape(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')
}

const RRULE: Record<string, string> = { daily: 'DAILY', weekly: 'WEEKLY', monthly: 'MONTHLY', yearly: 'YEARLY' }

export interface IcsEvent {
  id: string
  title: string
  startsAt: Date
  endsAt: Date | null
  notes: string | null
  repeatRule: string
}

/** Minimal iCalendar feed for "sync with my phone calendar". */
export function buildIcs(events: IcsEvent[], now: Date = new Date()): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//CareFusion AI//Citizen dates (synthetic demo)//EN',
    'CALSCALE:GREGORIAN',
    'X-WR-CALNAME:CareFusion dates (demo)',
  ]
  for (const e of events) {
    const end = e.endsAt ?? new Date(e.startsAt.getTime() + 30 * 60_000)
    lines.push(
      'BEGIN:VEVENT',
      `UID:${e.id}@carefusion.demo`,
      `DTSTAMP:${icsDate(now)}`,
      `DTSTART:${icsDate(e.startsAt)}`,
      `DTEND:${icsDate(end)}`,
      `SUMMARY:${icsEscape(e.title)}`,
    )
    if (e.notes) lines.push(`DESCRIPTION:${icsEscape(e.notes)}`)
    const rr = RRULE[e.repeatRule]
    if (rr) lines.push(`RRULE:FREQ=${rr}`)
    lines.push('END:VEVENT')
  }
  lines.push('END:VCALENDAR')
  return lines.join('\r\n') + '\r\n'
}

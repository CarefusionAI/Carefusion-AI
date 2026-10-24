/**
 * "Now" for the citizen screens. The demo data is written for Saturday 17 October 2026 (about 15:00 IST).
 * Set DEMO_NOW=2026-10-17T09:30:00Z in .env to freeze the clock there; otherwise the real time is used.
 */
export function demoNow(): Date {
  const fixed = process.env.DEMO_NOW
  if (fixed) {
    const d = new Date(fixed)
    if (!Number.isNaN(d.getTime())) return d
  }
  return new Date()
}

/** YYYY-MM-DD in Indian Standard Time. */
export function istDate(d: Date): string {
  return new Date(d.getTime() + 5.5 * 3600_000).toISOString().slice(0, 10)
}

export function iso(v: Date | string | null | undefined): string | null {
  if (v === null || v === undefined) return null
  return new Date(v).toISOString()
}

export function isoReq(v: Date | string): string {
  return new Date(v).toISOString()
}

/** Postgres interval text like "1 day" or "02:00:00" -> minutes. */
export function intervalToMinutes(v: unknown): number | null {
  if (v === null || v === undefined) return null
  if (typeof v === 'object') {
    const o = v as { days?: number; hours?: number; minutes?: number; seconds?: number; months?: number; years?: number }
    return (
      (o.years ?? 0) * 525600 +
      (o.months ?? 0) * 43200 +
      (o.days ?? 0) * 1440 +
      (o.hours ?? 0) * 60 +
      (o.minutes ?? 0) +
      Math.round((o.seconds ?? 0) / 60)
    )
  }
  const s = String(v)
  let total = 0
  let matched = false
  const day = /(\d+)\s+days?/.exec(s)
  if (day) {
    total += Number(day[1]) * 1440
    matched = true
  }
  const hms = /(\d+):(\d+):(\d+)/.exec(s)
  if (hms) {
    total += Number(hms[1]) * 60 + Number(hms[2])
    matched = true
  }
  return matched ? total : null
}

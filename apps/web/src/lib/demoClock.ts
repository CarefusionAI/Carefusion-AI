// The demo data is dated 17 Oct 2026. The API publishes the demo clock at /api/v1/clock; screens use
// demoNow() instead of the real clock so waiting times and "today" match the data. If the API says
// the clock is not frozen (or cannot be reached) the offset stays 0 and this is just the real time.
let offsetMs = 0

export function demoNow(): number {
  return Date.now() + offsetMs
}

export function demoDate(): Date {
  return new Date(demoNow())
}

export async function syncDemoClock(timeoutMs = 1500): Promise<void> {
  try {
    const ctl = new AbortController()
    const t = setTimeout(() => ctl.abort(), timeoutMs)
    const res = await fetch('/api/v1/clock', { signal: ctl.signal })
    clearTimeout(t)
    if (!res.ok) return
    const body = (await res.json()) as { now: string; frozen: boolean }
    if (body.frozen) offsetMs = Date.parse(body.now) - Date.now()
  } catch {
    // keep the real clock
  }
}

/** The "now" of the demo. Set DEMO_NOW (ISO timestamp) to freeze it; otherwise the real time is used. */
export function demoNowMs(): number {
  const fixed = process.env.DEMO_NOW
  const t = fixed ? Date.parse(fixed) : NaN
  return Number.isFinite(t) ? t : Date.now()
}

export function demoNowIso(): string | null {
  const t = process.env.DEMO_NOW ? Date.parse(process.env.DEMO_NOW) : NaN
  return Number.isFinite(t) ? new Date(t).toISOString() : null
}

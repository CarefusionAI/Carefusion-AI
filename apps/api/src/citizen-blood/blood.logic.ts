/** Pure helpers for the citizen blood-donation screens. */

export const ALL_GROUPS = ['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'] as const

/** Blood groups a donor of this group can give red cells to. Unknown group: no restriction is applied. */
export function compatibleRecipients(donorGroup: string): string[] {
  switch (donorGroup) {
    case 'O-':
      return [...ALL_GROUPS]
    case 'O+':
      return ['O+', 'A+', 'B+', 'AB+']
    case 'A-':
      return ['A-', 'A+', 'AB-', 'AB+']
    case 'A+':
      return ['A+', 'AB+']
    case 'B-':
      return ['B-', 'B+', 'AB-', 'AB+']
    case 'B+':
      return ['B+', 'AB+']
    case 'AB-':
      return ['AB-', 'AB+']
    case 'AB+':
      return ['AB+']
    default:
      return [...ALL_GROUPS]
  }
}

export type DonorTier = 'new' | 'bronze' | 'silver' | 'gold'

const TIER_STEPS: { tier: Exclude<DonorTier, 'new'>; min: number }[] = [
  { tier: 'bronze', min: 3 },
  { tier: 'silver', min: 10 },
  { tier: 'gold', min: 25 },
]

export function tierOf(donations: number): DonorTier {
  let t: DonorTier = 'new'
  for (const s of TIER_STEPS) if (donations >= s.min) t = s.tier
  return t
}

export function nextTier(donations: number): { tier: Exclude<DonorTier, 'new'>; remaining: number } | null {
  const s = TIER_STEPS.find((x) => donations < x.min)
  return s ? { tier: s.tier, remaining: s.min - donations } : null
}

/** Stock level from days of cover (design thresholds: under 4 days critical, under 7 low); by units when use is unknown. */
export function stockLevel(units: number, dailyUse: number): 'critical' | 'low' | 'good' {
  if (dailyUse > 0) {
    const cover = units / dailyUse
    return cover < 4 ? 'critical' : cover < 7 ? 'low' : 'good'
  }
  return units < 5 ? 'critical' : units < 15 ? 'low' : 'good'
}

export function ageOn(dob: string, today: string): number {
  const [y1, m1, d1] = dob.split('-').map(Number) as [number, number, number]
  const [y2, m2, d2] = today.split('-').map(Number) as [number, number, number]
  let a = y2 - y1
  if (m2 < m1 || (m2 === m1 && d2 < d1)) a--
  return a
}

export const TYPE_LABEL: Record<string, string> = {
  whole: 'Whole blood',
  platelets: 'Platelets',
  plasma: 'Plasma',
  double_red: 'Double red cells',
}

/** "today 18:00", "tomorrow 08:00" or "by 23 Oct" in India time. */
export function neededBy(closesAt: Date, now: Date): string {
  const ist = (d: Date) => new Date(d.getTime() + 5.5 * 3600_000)
  const c = ist(closesAt)
  const n = ist(now)
  const dayKey = (x: Date) => x.toISOString().slice(0, 10)
  const hhmm = c.toISOString().slice(11, 16)
  const diff = Math.round((Date.parse(dayKey(c)) - Date.parse(dayKey(n))) / 86_400_000)
  if (diff === 0) return `today ${hhmm}`
  if (diff === 1) return `tomorrow ${hhmm}`
  return `by ${c.getUTCDate()} ${c.toLocaleString('en-GB', { month: 'short', timeZone: 'UTC' })}`
}

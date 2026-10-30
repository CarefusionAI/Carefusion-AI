import type { ReactNode } from 'react'
import { Alert, Button, EmptyState, Skeleton } from '../../../components/ui'
import type { Acuity } from '../../../api/nurse'
import { errMessage } from '../../../api/nurse'
import './nurse.css'
import { demoDate, demoNow } from '../../../lib/demoClock'

/** All nurse screens show wall-clock times in India time. */
const TZ = 'Asia/Kolkata'

export function fmtTime(iso: string | null | undefined): string {
  if (!iso) return '--:--'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '--:--'
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: TZ })
}

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const date = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: TZ })
  return `${date}, ${fmtTime(iso)}`
}

export function fmtDay(d: Date = demoDate()): string {
  return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: TZ })
}

export function minutesAgo(iso: string | null | undefined): string {
  if (!iso) return ''
  const m = Math.round((demoNow() - new Date(iso).getTime()) / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m} min ago`
  const h = Math.floor(m / 60)
  return h < 24 ? `${h} h ${m % 60} min ago` : `${Math.floor(h / 24)} d ago`
}

// ---------------------------------------------------------------- NEWS2 (mirrors inpatient.news2_parts in the database)
export interface NewsInput {
  respRate: number
  spo2: number
  onOxygen: boolean
  systolic: number
  pulse: number
  tempC: number
  avpu: string
}

export const NEWS_PART_LABELS = ['Resp. rate', 'SpO2', 'Oxygen', 'Systolic BP', 'Pulse', 'Consciousness', 'Temperature'] as const

export function newsParts(v: NewsInput): number[] {
  const { respRate: rr, spo2, onOxygen, systolic: sbp, pulse, tempC: t, avpu } = v
  return [
    rr <= 8 ? 3 : rr <= 11 ? 1 : rr <= 20 ? 0 : rr <= 24 ? 2 : 3,
    spo2 <= 91 ? 3 : spo2 <= 93 ? 2 : spo2 <= 95 ? 1 : 0,
    onOxygen ? 2 : 0,
    sbp <= 90 ? 3 : sbp <= 100 ? 2 : sbp <= 110 ? 1 : sbp <= 219 ? 0 : 3,
    pulse <= 40 ? 3 : pulse <= 50 ? 1 : pulse <= 90 ? 0 : pulse <= 110 ? 1 : pulse <= 130 ? 2 : 3,
    avpu === 'A' ? 0 : 3,
    t <= 35 ? 3 : t <= 36 ? 1 : t <= 38 ? 0 : t <= 39 ? 1 : 2,
  ]
}

export type NewsBand = 'low' | 'low_medium' | 'medium' | 'high'

export function newsBand(parts: number[]): NewsBand {
  const total = parts.reduce((a, b) => a + b, 0)
  if (total >= 7) return 'high'
  if (total >= 5) return 'medium'
  if (Math.max(...parts) === 3) return 'low_medium'
  return 'low'
}

export function newsTone(score: number | null | undefined, band?: string): 'lo' | 'mid' | 'hi' {
  if (band === 'high' || band === 'medium') return 'hi'
  if (band === 'low_medium') return 'mid'
  if (score == null) return 'lo'
  return score >= 5 ? 'hi' : score >= 3 ? 'mid' : 'lo'
}

const NEWS_WORD = { lo: 'Low', mid: 'Medium', hi: 'High' } as const
const NEWS_ICON = { lo: '✓', mid: '!', hi: '‼' } as const

/** Score chip. Shows the number, a word and an icon so colour is never the only signal. */
export function NewsChip({ score, band }: { score: number | null | undefined; band?: string }) {
  if (score == null) return <span className="nu-muted">No score yet</span>
  const tone = newsTone(score, band)
  return (
    <span className={`nu-news is-${tone}`}>
      <span aria-hidden="true">{NEWS_ICON[tone]}</span>
      NEWS {score} · {NEWS_WORD[tone]}
    </span>
  )
}

export const ACUITY_LABEL: Record<Acuity, string> = { free: 'Free', stable: 'Stable', watch: 'Watch', critical: 'Critical' }
export const ACUITY_ICON: Record<Acuity, string> = { free: '○', stable: '✓', watch: '!', critical: '‼' }

// ---------------------------------------------------------------- shared states
export function Loading({ rows = 3, label = 'Loading' }: { rows?: number; label?: string }) {
  return (
    <div role="status" aria-label={label} className="nu-skel-box">
      <Skeleton width="45%" height={20} />
      <Skeleton lines={rows} />
    </div>
  )
}

export function PageLoading({ title }: { title: string }) {
  return (
    <div className="nu-pg" role="status" aria-label={`Loading ${title}`}>
      <Skeleton width="35%" height={34} />
      <div className="nu-grid nu-g4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} height={92} radius={20} />
        ))}
      </div>
      <Skeleton height={220} radius={20} />
    </div>
  )
}

export function ErrorBlock({ error, onRetry, title = 'Could not load this' }: { error: unknown; onRetry?: () => void; title?: string }) {
  return (
    <Alert tone="danger" title={title} action={onRetry ? <Button size="sm" variant="outline" onClick={onRetry}>Try again</Button> : undefined}>
      {errMessage(error, 'The nurse service did not answer.')}
    </Alert>
  )
}

export function Empty({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <EmptyState title={title} action={action}>
      {children}
    </EmptyState>
  )
}

export function BoxHead({ title, right }: { title: ReactNode; right?: ReactNode }) {
  return (
    <div className="nu-bh">
      <h2 className="nu-bt">{title}</h2>
      {right}
    </div>
  )
}

export const PRIORITY: Record<string, { label: string; icon: string }> = {
  stat: { label: 'STAT', icon: '‼' },
  urgent: { label: 'Urgent', icon: '!' },
  routine: { label: 'Routine', icon: '·' },
}

export function orderTypeLabel(t: string): string {
  return t === 'medication' ? 'Medicine' : t === 'nursing' ? 'Nursing' : t === 'vitals' ? 'Vitals' : t === 'lab' ? 'Lab' : t === 'imaging' || t === 'radiology' ? 'Imaging' : t
}

export function orderStatusLabel(s: string): string {
  return s === 'open' ? 'Waiting' : s === 'accepted' ? 'Accepted' : s === 'in_progress' ? 'In progress' : s === 'done' ? 'Done' : s === 'rejected' ? 'Rejected' : s
}

import type { ReactNode } from 'react'
import { Alert, Button, EmptyState, Skeleton } from '../../../components/ui'
import { errMessage } from '../../../api/nurse'
import type { LabStage, ResultFlag } from '../../../api/lab'
import './lab.css'

export { fmtTime, fmtDateTime, fmtDay, minutesAgo } from '../nurse/common'

export function Loading({ rows = 3, label = 'Loading' }: { rows?: number; label?: string }) {
  return (
    <div role="status" aria-label={label} className="lb-skel-box">
      <Skeleton width="45%" height={20} />
      <Skeleton lines={rows} />
    </div>
  )
}

export function PageLoading({ title }: { title: string }) {
  return (
    <div className="lb-pg" role="status" aria-label={`Loading ${title}`}>
      <Skeleton width="35%" height={34} />
      <div className="lb-grid lb-g4">
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
      {errMessage(error, 'The lab service did not answer.')}
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
    <div className="lb-bh">
      <h2 className="lb-bt">{title}</h2>
      {right}
    </div>
  )
}

export const PRIORITY: Record<string, { label: string; icon: string }> = {
  stat: { label: 'STAT', icon: '‼' },
  urgent: { label: 'Urgent', icon: '!' },
  routine: { label: 'Routine', icon: '·' },
}

export const STAGE: Record<LabStage, { label: string; icon: string; tone: 'warning' | 'info' | 'ai' | 'success' | 'neutral' }> = {
  new: { label: 'New order', icon: '…', tone: 'warning' },
  awaiting_sample: { label: 'Awaiting sample', icon: '…', tone: 'warning' },
  running: { label: 'Running', icon: '▶', tone: 'info' },
  to_verify: { label: 'To verify', icon: '✎', tone: 'ai' },
  to_release: { label: 'To release', icon: '✓', tone: 'success' },
}

export function waitText(min: number): string {
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  return `${h} h ${String(min % 60).padStart(2, '0')}`
}

export type FlagKind = 'normal' | 'low' | 'high' | 'crit-low' | 'crit-high' | 'abnormal' | 'none'

/** Flag from a typed value against reference and critical limits (the server's flag is authoritative after saving). */
export function flagFor(value: number, t: { refLow: number | null; refHigh: number | null; criticalLow: number | null; criticalHigh: number | null }): FlagKind {
  if (Number.isNaN(value)) return 'none'
  if (t.criticalLow != null && value <= t.criticalLow) return 'crit-low'
  if (t.criticalHigh != null && value >= t.criticalHigh) return 'crit-high'
  if (t.refLow != null && value < t.refLow) return 'low'
  if (t.refHigh != null && value > t.refHigh) return 'high'
  return 'normal'
}

export const FLAG_TEXT: Record<FlagKind, { text: string; icon: string; cls: string }> = {
  normal: { text: 'Normal', icon: '✓', cls: '' },
  low: { text: 'Low', icon: '↓', cls: ' is-bad' },
  high: { text: 'High', icon: '↑', cls: ' is-bad' },
  'crit-low': { text: 'Critical low', icon: '‼', cls: ' is-crit' },
  'crit-high': { text: 'Critical high', icon: '‼', cls: ' is-crit' },
  abnormal: { text: 'Abnormal', icon: '!', cls: ' is-bad' },
  none: { text: '', icon: '', cls: '' },
}

export function flagFromServer(f: ResultFlag): FlagKind {
  return f === 'N' ? 'normal' : f === 'L' ? 'low' : f === 'H' ? 'high' : f === 'LL' ? 'crit-low' : f === 'HH' ? 'crit-high' : f === 'A' ? 'abnormal' : 'none'
}

export function FlagBadge({ kind }: { kind: FlagKind }) {
  const f = FLAG_TEXT[kind]
  if (!f.text) return <span className="lb-muted">-</span>
  return (
    <span className={`lb-flag${f.cls}`}>
      <span aria-hidden="true">{f.icon}</span>
      {f.text}
    </span>
  )
}

export function refText(t: { refLow: number | null; refHigh: number | null; refText: string | null; unit?: string | null }): string {
  if (t.refText) return t.refText
  if (t.refLow != null && t.refHigh != null) return `${t.refLow}–${t.refHigh}`
  if (t.refHigh != null) return `< ${t.refHigh}`
  if (t.refLow != null) return `> ${t.refLow}`
  return 'No range'
}

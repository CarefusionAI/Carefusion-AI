import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import clsx from 'clsx'
import type { UseQueryResult } from '@tanstack/react-query'
import { Alert, Button, EmptyState, Modal, Skeleton } from '../../../components/ui'
import type { AlertTone, BadgeTone } from '../../../components/ui'
import { errorMessage } from '../../../api/adminHttp'
import './ops.css'

// ---------------------------------------------------------------- formatting

const TZ = 'Asia/Kolkata'

function toDate(iso: string | null | undefined): Date | null {
  if (!iso) return null
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00+05:30` : iso)
  return Number.isNaN(d.getTime()) ? null : d
}

export function fmtDate(iso: string | null | undefined, withYear = true): string {
  const d = toDate(iso)
  if (!d) return '-'
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', ...(withYear ? { year: 'numeric' } : {}), timeZone: TZ })
}

export function fmtTime(iso: string | null | undefined): string {
  const d = toDate(iso)
  if (!d) return '-'
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: TZ })
}

export function fmtDateTime(iso: string | null | undefined): string {
  const d = toDate(iso)
  if (!d) return '-'
  return `${fmtDate(iso, false)}, ${fmtTime(iso)}`
}

/** 1,24,300 style (Indian digit grouping) with the rupee sign. */
export function inr(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '-'
  return `₹${Math.round(n).toLocaleString('en-IN')}`
}

export function num(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '-'
  return n.toLocaleString('en-IN')
}

export function humanise(value: string | null | undefined): string {
  if (!value) return ''
  const t = value.replace(/_/g, ' ')
  return t.charAt(0).toUpperCase() + t.slice(1)
}

export function initialsOf(name: string): string {
  return name.replace(/^(Dr\.?|Mr\.?|Ms\.?|Mrs\.?)\s+/i, '').trim()
}

/** Short role label for the "from" tag on the connected-apps feed. */
export function roleLabelOf(key: string): string {
  const map: Record<string, string> = {
    citizen: 'Citizen',
    doctor: 'Doctor',
    nurse: 'Nurse',
    labtech: 'Lab',
    radiology: 'Radiology',
    pharmacist: 'Pharmacist',
    pharmacyadmin: 'Pharmacy admin',
    hospitaladmin: 'Hospital admin',
    district: 'District',
    state: 'State',
    zonal: 'Zonal',
    central: 'Central',
  }
  return map[key] ?? humanise(key)
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// ---------------------------------------------------------------- small pieces

export function Box({
  title,
  titleSize,
  actions,
  className,
  children,
  label,
}: {
  title?: ReactNode
  titleSize?: 'sm' | 'lg'
  actions?: ReactNode
  className?: string
  children?: ReactNode
  label?: string
}) {
  return (
    <section className={clsx('ak-box', className)} aria-label={!title ? label : undefined}>
      {title || actions ? (
        <div className="ak-bh">
          {title ? <h2 className={clsx('ak-bt', titleSize && `is-${titleSize}`)}>{title}</h2> : <span />}
          {actions}
        </div>
      ) : null}
      {children}
    </section>
  )
}

export function Row({ icon, tone, children, trailing, top }: { icon?: ReactNode; tone?: 'teal' | 'blue' | 'peach' | 'sage' | 'warn' | 'danger'; children: ReactNode; trailing?: ReactNode; top?: boolean }) {
  return (
    <div className={clsx('ak-row', top && 'is-top')}>
      {icon ? (
        <span className={clsx('ak-ico', `ak-t-${tone ?? 'teal'}`)} aria-hidden="true">
          {icon}
        </span>
      ) : null}
      <div className="ak-row-main">{children}</div>
      {trailing}
    </div>
  )
}

export function RowText({ title, sub }: { title: ReactNode; sub?: ReactNode }) {
  return (
    <>
      <strong className="ak-strong">{title}</strong>
      {sub ? <div className="ak-muted">{sub}</div> : null}
    </>
  )
}

export function KV({ items, cols }: { items: { label: string; value: ReactNode }[]; cols?: 3 }) {
  return (
    <dl className={clsx('ak-kv', cols === 3 && 'is-3')}>
      {items.map((it) => (
        <div key={it.label}>
          <dt>{it.label}</dt>
          <dd>{it.value}</dd>
        </div>
      ))}
    </dl>
  )
}

export function Bar({ pct, tone }: { pct: number; tone?: 'low' | 'mid' | 'gold' }) {
  const w = Math.max(0, Math.min(100, Math.round(pct)))
  return (
    <div className="ak-bar" role="img" aria-label={`${w} percent`}>
      <span className={tone ? `is-${tone}` : undefined} style={{ width: `${w}%` }} />
    </div>
  )
}

export function Chips<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string
  options: { id: T; label: string; count?: number | null }[]
  value: T
  onChange: (id: T) => void
}) {
  return (
    <div className="ak-chips" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.id} type="button" className="ak-chip" aria-pressed={value === o.id} onClick={() => onChange(o.id)}>
          {o.label}
          {o.count != null ? <span className="ak-chip-count">{o.count}</span> : null}
        </button>
      ))}
    </div>
  )
}

export function Stars({ n, label }: { n: number; label?: string }) {
  const full = Math.max(0, Math.min(5, Math.round(n)))
  return (
    <span className="ak-stars" role="img" aria-label={label ?? `${n} out of 5 stars`}>
      {'★'.repeat(full)}
      {'☆'.repeat(5 - full)}
    </span>
  )
}

export function Icon({ d, size = 18, sw = 1.8 }: { d: string; size?: number; sw?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d={d} />
    </svg>
  )
}

export const ICONS = {
  users: 'M9 11a4 4 0 1 0 0-8a4 4 0 0 0 0 8zM2 21c1-4 3.5-6 7-6s6 2 7 6M17 11a3 3 0 1 0 0-6M22 21c-.6-2.6-2-4.3-4-5',
  bed: 'M3 18V7M3 13h18v5M21 18v-3a3 3 0 0 0-3-3h-8v1M7 11a2 2 0 1 0 0-4a2 2 0 0 0 0 4z',
  key: 'M15 7a4 4 0 1 1-3.9 4.9L4 19v2h3v-2h2v-2h2l1.1-1.1A4 4 0 0 1 15 7z',
  check: 'M9 11l3 3l8-8M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9',
  tick: 'M5 12l5 5L20 7',
  warn: 'M12 9v4M12 17h.01M10.3 3.9L2 18a2 2 0 0 0 1.7 3h16.6a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
  cog: 'M12 15a3 3 0 1 0 0-6a3 3 0 0 0 0 6zM4 12h2M18 12h2M12 4v2M12 18v2',
  chat: 'M4 5h16v11H8l-4 4z',
  doc: 'M6 3h8l4 4v14H6zM14 3v4h4',
  clipboard: 'M6 3h12v18H6zM9 8h6M9 12h6M9 16h4',
  mail: 'M3 6h18v12H3zM3 7l9 7l9-7',
  shield: 'M12 3l8 3v6c0 4.5-3.4 8.3-8 9c-4.6-.7-8-4.5-8-9V6z',
  box: 'M3 7l9-4l9 4v10l-9 4l-9-4zM3 7l9 4l9-4M12 11v10',
  cal: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4',
  rx: 'M8.5 3.5a5 5 0 0 1 7 7l-5 5a5 5 0 0 1-7-7zM6 11l7 7',
  rupee: 'M6 5h12M6 9h12M9 5c5 0 6 5 0 6l6 8',
  truck: 'M2 7h11v9H2zM13 10h4l3 3v3h-7zM6 19a1.5 1.5 0 1 0 0-.01M17 19a1.5 1.5 0 1 0 0-.01',
  search: 'M11 4a7 7 0 1 0 0 14a7 7 0 0 0 0-14zM21 21l-5-5',
  plus: 'M12 5v14M5 12h14',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
} as const

/** Big translucent cross used on the hero cards. */
export function HeroCross() {
  return (
    <svg className="ak-hero-cross" aria-hidden="true" viewBox="0 0 64 64" width="200" height="200">
      <rect x="21" y="5" width="18" height="50" rx="9" fill="#faf5ef" />
      <rect x="9" y="25" width="50" height="18" rx="9" fill="#faf5ef" />
    </svg>
  )
}

// ---------------------------------------------------------------- async states

export function PanelSkeleton({ rows = 4, title = true }: { rows?: number; title?: boolean }) {
  return (
    <div className="ak-box" aria-hidden="true">
      {title ? <Skeleton width="40%" height={20} /> : null}
      <Skeleton lines={rows} height={14} />
    </div>
  )
}

export function PageSkeleton({ stats = true, boxes = 2 }: { stats?: boolean; boxes?: number }) {
  return (
    <div className="ak-page" role="status" aria-label="Loading">
      <Skeleton width="38%" height={34} />
      {stats ? (
        <div className="ak-grid ak-g4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="ak-box" aria-hidden="true">
              <Skeleton width="55%" height={12} />
              <Skeleton width="35%" height={28} />
            </div>
          ))}
        </div>
      ) : null}
      {Array.from({ length: boxes }, (_, i) => (
        <PanelSkeleton key={i} />
      ))}
      <span className="cf-sr">Loading</span>
    </div>
  )
}

export function ErrorPanel({ error, onRetry, title = 'This section could not load' }: { error: unknown; onRetry?: () => void; title?: string }) {
  return (
    <Alert
      tone="danger"
      title={title}
      action={
        onRetry ? (
          <Button variant="outline" size="sm" onClick={onRetry}>
            Try again
          </Button>
        ) : undefined
      }
    >
      {errorMessage(error, 'Unknown error.')}
    </Alert>
  )
}

/** Renders loading skeleton, error with retry, or the data. */
export function Async<T>({
  query,
  skeleton,
  children,
}: {
  query: UseQueryResult<T>
  skeleton?: ReactNode
  children: (data: T) => ReactNode
}) {
  if (query.isPending) return <>{skeleton ?? <PageSkeleton />}</>
  if (query.isError) return <ErrorPanel error={query.error} onRetry={() => void query.refetch()} />
  return <>{children(query.data)}</>
}

// ---------------------------------------------------------------- flash messages

export interface Flash {
  tone: AlertTone
  text: string
}

/** One dismissible message line (success or error of the last action). Announced to screen readers. */
export function useFlash(): { flash: Flash | null; show: (tone: AlertTone, text: string) => void; clear: () => void; node: ReactNode } {
  const [flash, setFlash] = useState<Flash | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const clear = useCallback(() => {
    clearTimeout(timer.current)
    setFlash(null)
  }, [])
  const show = useCallback((tone: AlertTone, text: string) => {
    clearTimeout(timer.current)
    setFlash({ tone, text })
    if (tone === 'success') timer.current = setTimeout(() => setFlash(null), 8000)
  }, [])
  useEffect(() => () => clearTimeout(timer.current), [])
  const node = flash ? (
    <Alert tone={flash.tone} onDismiss={clear}>
      {flash.text}
    </Alert>
  ) : null
  return { flash, show, clear, node }
}

// ---------------------------------------------------------------- confirm modal

/**
 * Confirmation for actions that change something other people rely on. The caller states the consequences
 * in `children`; the footer always has an explicit Cancel and a labelled confirm button.
 */
export function ConfirmModal({
  open,
  title,
  confirmLabel,
  cancelLabel = 'Cancel',
  danger,
  busy,
  error,
  disabled,
  onConfirm,
  onClose,
  children,
  size = 'md',
}: {
  open: boolean
  title: string
  confirmLabel: string
  cancelLabel?: string
  danger?: boolean
  busy?: boolean
  error?: string | null
  disabled?: boolean
  onConfirm: () => void
  onClose: () => void
  children: ReactNode
  size?: 'sm' | 'md' | 'lg'
}) {
  return (
    <Modal
      open={open}
      title={title}
      size={size}
      onClose={busy ? undefined : onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} loading={busy} disabled={disabled}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="ak-stack">
        {children}
        {error ? (
          <Alert tone="danger" title="That did not work">
            {error}
          </Alert>
        ) : null}
      </div>
    </Modal>
  )
}

export type { BadgeTone }

/** Badge tone for common status words. */
export function toneOfStatus(status: string): BadgeTone {
  switch (status) {
    case 'pending':
    case 'new':
    case 'pending_approval':
    case 'review_due':
    case 'under_review':
    case 'upcoming':
    case 'renew_soon':
    case 'watch':
    case 'low':
    case 'review':
      return 'warning'
    case 'approved':
    case 'verified':
    case 'resolved':
    case 'justified':
    case 'active':
    case 'ok':
    case 'received':
    case 'stable':
    case 'confirmed_off_shelf':
    case 'sent':
      return 'success'
    case 'rejected':
    case 'escalated':
    case 'critical':
    case 'blocked':
    case 'expired':
    case 'action_needed':
    case 'deactivated':
    case 'cancelled':
      return 'danger'
    case 'in_transit':
    case 'discharge_today':
    case 'held':
      return 'info'
    default:
      return 'neutral'
  }
}

export function EmptyBox({ title, children, action }: { title: ReactNode; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="ak-box">
      <EmptyState title={title} action={action}>
        {children}
      </EmptyState>
    </div>
  )
}

/** Client-side CSV download of rows already on screen. */
export function downloadCsv(filename: string, header: string[], rows: (string | number | null | undefined)[][]) {
  const esc = (v: string | number | null | undefined) => {
    const t = v === null || v === undefined ? '' : String(v)
    return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t
  }
  const csv = [header, ...rows].map((r) => r.map(esc).join(',')).join('\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

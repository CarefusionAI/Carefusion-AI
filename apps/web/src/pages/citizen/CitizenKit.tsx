import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { UseQueryResult } from '@tanstack/react-query'
import clsx from 'clsx'
import { Alert, Button, Skeleton } from '../../components/ui'
import { errorMessage } from '../../api/citizen1'
import './CitizenKit.css'

// Shared building blocks for the Citizen pages (part 1). Styles: CitizenKit.css (c1- prefix).

export function Page({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <div className="c1-pg" aria-label={label}>
      {children}
    </div>
  )
}

export function Head({
  eyebrow,
  title,
  sub,
  actions,
}: {
  eyebrow: string
  title: string
  sub?: ReactNode
  actions?: ReactNode
}) {
  return (
    <header className="c1-head c1-in">
      <div>
        <p className="c1-eyb">{eyebrow}</p>
        <h1 className="c1-ttl">{title}</h1>
        {sub ? <p>{sub}</p> : null}
      </div>
      {actions ? <div className="c1-flt">{actions}</div> : null}
    </header>
  )
}

export function Box({
  title,
  actions,
  tone,
  className,
  delay,
  label,
  children,
  as: Tag = 'div',
}: {
  title?: ReactNode
  actions?: ReactNode
  tone?: 'sage' | 'lav' | 'peach'
  className?: string
  delay?: number
  label?: string
  as?: 'div' | 'section' | 'form'
  children?: ReactNode
}) {
  return (
    <Tag
      className={clsx('c1-box', tone && `is-${tone}`, delay !== undefined && 'c1-in', className)}
      style={delay ? { animationDelay: `${delay}ms` } : undefined}
      aria-label={label}
    >
      {title || actions ? (
        <div className="c1-bh">
          {title ? <h2 className="c1-bt">{title}</h2> : <span />}
          {actions}
        </div>
      ) : null}
      {children}
    </Tag>
  )
}

export function LinkBtn({
  children,
  onClick,
  bad,
  disabled,
  ariaLabel,
}: {
  children: ReactNode
  onClick?: () => void
  bad?: boolean
  disabled?: boolean
  ariaLabel?: string
}) {
  return (
    <button type="button" className={clsx('c1-lk', bad && 'is-bad')} onClick={onClick} disabled={disabled} aria-label={ariaLabel}>
      {children}
    </button>
  )
}

export function Muted({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={clsx('c1-muted', className)}>{children}</span>
}

// ---------------------------------------------------------------------------------------------
// Loading / error states
// ---------------------------------------------------------------------------------------------

export function LoadingBlock({ label = 'Loading', lines = 4 }: { label?: string; lines?: number }) {
  return (
    <div role="status" aria-label={label} className="c1-skel-stack">
      <Skeleton width="45%" height={20} />
      <Skeleton lines={lines} height={14} />
    </div>
  )
}

export function LoadFailed({ error, onRetry, what }: { error: unknown; onRetry?: () => void; what: string }) {
  return (
    <Alert
      tone="warning"
      title={`Could not load ${what}`}
      action={
        onRetry ? (
          <Button variant="outline" size="sm" onClick={onRetry}>
            Try again
          </Button>
        ) : undefined
      }
    >
      {errorMessage(error, 'The server did not answer.')}
    </Alert>
  )
}

/** Skeleton while loading, a retryable warning on error, children once data is there. */
export function Async<T>({
  query,
  what,
  skeleton,
  children,
}: {
  query: Pick<UseQueryResult<T>, 'data' | 'isPending' | 'isError' | 'error' | 'refetch'>
  what: string
  skeleton?: ReactNode
  children: (data: T) => ReactNode
}) {
  if (query.isPending) return <>{skeleton ?? <LoadingBlock label={`Loading ${what}`} />}</>
  if (query.isError || query.data === undefined) {
    return <LoadFailed error={query.error} what={what} onRetry={() => void query.refetch()} />
  }
  return <>{children(query.data)}</>
}

export function MutationError({ error }: { error: unknown }) {
  if (!error) return null
  return (
    <Alert tone="danger" title="That did not work">
      {errorMessage(error)}
    </Alert>
  )
}

// ---------------------------------------------------------------------------------------------
// Time and number formatting (the demo runs on India time)
// ---------------------------------------------------------------------------------------------

const TZ = 'Asia/Kolkata'

function parts(iso: string | Date, opts: Intl.DateTimeFormatOptions): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso
  if (Number.isNaN(d.getTime())) return ''
  return new Intl.DateTimeFormat('en-GB', { timeZone: TZ, ...opts }).format(d)
}

export const fmt = {
  day: (iso: string) => parts(iso, { day: '2-digit' }),
  mon: (iso: string) => parts(iso, { month: 'short' }),
  dayMon: (iso: string) => parts(iso, { day: 'numeric', month: 'short' }),
  date: (iso: string) => parts(iso, { day: '2-digit', month: 'short', year: 'numeric' }),
  dateLong: (iso: string) => parts(iso, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
  weekdayShort: (iso: string) => parts(iso, { weekday: 'short' }),
  time: (iso: string) => parts(iso, { hour: '2-digit', minute: '2-digit', hour12: false }),
  dateTime: (iso: string) => parts(iso, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }),
  hour: (iso: Date) => Number(parts(iso, { hour: '2-digit', hour12: false })),
}

/** "Today 14:24", "Yesterday 09:10", or "17 Oct 14:24". `today` is the API's "today" (YYYY-MM-DD). */
export function whenLabel(iso: string, today: string): string {
  const day = ymd(iso)
  const t = new Date(`${today}T00:00:00Z`).getTime()
  const d = new Date(`${day}T00:00:00Z`).getTime()
  const diff = Math.round((t - d) / 86_400_000)
  if (diff === 0) return `Today ${fmt.time(iso)}`
  if (diff === 1) return `Yesterday ${fmt.time(iso)}`
  return fmt.dateTime(iso)
}

/** YYYY-MM-DD of an ISO instant in India time. */
export function ymd(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
  return p
}

export function fmtSize(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined) return '-'
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

export function humanise(value: string): string {
  const text = value.replace(/_/g, ' ')
  return text.charAt(0).toUpperCase() + text.slice(1)
}

export function plural(n: number, one: string, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`
}

export function clock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** Re-renders every `ms` so countdowns stay live. */
export function useTick(ms = 1000): number {
  const [n, setN] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setN((v) => v + 1), ms)
    return () => clearInterval(id)
  }, [ms])
  return n
}

export function KIND_TONE(kind: string): string {
  switch (kind) {
    case 'appt':
      return 't-appt'
    case 'med':
      return 't-med'
    case 'test':
      return 't-test'
    case 'give':
      return 't-give'
    case 'vac':
      return 't-vac'
    case 'personal':
      return 't-alert'
    case 'visit':
      return 't-visit'
    default:
      return 't-other'
  }
}

export const KIND_LABEL: Record<string, string> = {
  appt: 'Appointment',
  med: 'Refill',
  test: 'Test',
  give: 'Donation',
  vac: 'Vaccine',
  visit: 'Past visit',
  personal: 'Reminder',
  other: 'Other',
}

export const KIND_BADGE: Record<string, 'success' | 'teal' | 'warning' | 'ai' | 'info' | 'neutral' | 'peach'> = {
  appt: 'info',
  med: 'teal',
  test: 'warning',
  give: 'success',
  vac: 'ai',
  visit: 'neutral',
  personal: 'peach',
  other: 'neutral',
}

export function DateTile({ iso, tone }: { iso: string; tone: string }) {
  return (
    <span className={clsx('c1-dt', tone)}>
      <b>{fmt.day(iso)}</b>
      <i>{fmt.mon(iso)}</i>
    </span>
  )
}

/** Decorative QR-style pattern drawn from the key digits (the demo has no real QR encoder). */
export function KeyQr({ code, size = 78, label = 'QR code for the same key (demo drawing)' }: { code: string; size?: number; label?: string }) {
  const seed = Number(code.replace(/\D/g, '')) || 482913
  const cells: string[] = []
  for (let i = 0; i < 40; i++) {
    const v = (seed * (i + 11) * 40503) % 9973
    const x = v % 21
    const y = Math.floor(v / 21) % 21
    if (!((x < 8 && y < 8) || (x > 12 && y < 8) || (x < 8 && y > 12))) cells.push(`M${x} ${y}h1v1h-1z`)
  }
  return (
    <svg width={size} height={size} viewBox="0 0 21 21" role="img" aria-label={label} style={{ flex: 'none', background: '#faf5ef', borderRadius: 12, padding: size > 100 ? 0 : 7 }}>
      <g fill="#3f5263">
        <path d="M0 0h7v7H0zM14 0h7v7h-7zM0 14h7v7H0z" />
      </g>
      <g fill="#faf5ef">
        <path d="M1 1h5v5H1zM15 1h5v5h-5zM1 15h5v5H1z" />
      </g>
      <g fill="#3f5263">
        <path d="M2 2h3v3H2zM16 2h3v3h-3zM2 16h3v3H2z" />
        <path d={cells.join('')} />
      </g>
    </svg>
  )
}

export function Icon({ d, size = 20, stroke = 1.8 }: { d: string; size?: number; stroke?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d={d} />
    </svg>
  )
}

export const ICONS = {
  qr: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 18h2v2h-2zM14 18h2M18 14h2',
  ai: 'M10.5 3h3a1.5 1.5 0 0 1 1.5 1.5v15a1.5 1.5 0 0 1-1.5 1.5h-3A1.5 1.5 0 0 1 9 19.5v-15A1.5 1.5 0 0 1 10.5 3zM4.5 9h15A1.5 1.5 0 0 1 21 10.5v3a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 13.5v-3A1.5 1.5 0 0 1 4.5 9z',
  calAdd: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4M12 13v4M10 15h4',
  cal: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4',
  upload: 'M12 16V4M7 9l5-5l5 5M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3',
  pill: 'M8.5 3.5a5 5 0 0 1 7 7l-5 5a5 5 0 0 1-7-7zM6 11l7 7',
  pulse: 'M3 12h4l3-7l4 14l3-7h4',
  doc: 'M6 3h8l4 4v14H6zM14 3v4h4',
  docTick: 'M6 3h8l4 4v14H6zM14 3v4h4M9 13l2 2l4-4',
  drop: 'M12 3c3 4 6 7.5 6 11a6 6 0 0 1-12 0c0-3.5 3-7 6-11z',
  heart: 'M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z',
  search: 'M11 4a7 7 0 1 0 0 14a7 7 0 0 0 0-14zM21 21l-5-5',
  folder: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  folderAdd: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM12 11v5M9.5 13.5h5',
  scale: 'M5 4h14l-2 16H7zM9 9a3 3 0 0 1 6 0',
  lung: 'M12 4v8M8 8c-3 2-4 6-4 10h6V10M16 8c3 2 4 6 4 10h-6V10',
  clock: 'M12 7v5l3 2M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18z',
  bell: 'M6 16V11a6 6 0 0 1 12 0v5l2 2H4zM10 21h4',
  phone: 'M5 4h4l2 5l-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2',
  send: 'M5 12h14M13 6l6 6l-6 6',
  warn: 'M12 3l9 16H3z',
  heartLine: 'M3 12h4l3-7l4 14l3-7h4',
}

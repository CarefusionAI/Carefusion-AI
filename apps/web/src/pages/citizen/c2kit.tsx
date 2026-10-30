import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Alert, Button, Skeleton } from '../../components/ui'
import { useEvents } from '../../hooks/useEvents'
import './citizen2.css'

// Small shared pieces for the second batch of citizen screens (page header, boxes, toast, live feed, date helpers).

export const IST = 'Asia/Kolkata'

const dtf = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-GB', { timeZone: IST, ...o })
const F_TIME = dtf({ hour: '2-digit', minute: '2-digit', hour12: false })
const F_DAY = dtf({ day: '2-digit' })
const F_MON = dtf({ month: 'short' })
const F_WD = dtf({ weekday: 'short' })
const F_LONG = dtf({ day: 'numeric', month: 'short', year: 'numeric' })
const F_SHORT = dtf({ day: 'numeric', month: 'short' })
const F_YMD = new Intl.DateTimeFormat('en-CA', { timeZone: IST, year: 'numeric', month: '2-digit', day: '2-digit' })

export const fmtTime = (iso: string | Date) => F_TIME.format(new Date(iso))
export const fmtDD = (iso: string | Date) => F_DAY.format(new Date(iso))
export const fmtMon = (iso: string | Date) => F_MON.format(new Date(iso))
export const fmtWd = (iso: string | Date) => F_WD.format(new Date(iso))
export const fmtLong = (iso: string | Date) => F_LONG.format(new Date(iso))
export const fmtShort = (iso: string | Date) => F_SHORT.format(new Date(iso))
/** YYYY-MM-DD in India time. */
export const ymd = (iso: string | Date) => F_YMD.format(new Date(iso))
/** "21 Oct" from a YYYY-MM-DD string. */
export const fmtYmdShort = (d: string) => F_SHORT.format(new Date(`${d}T12:00:00+05:30`))
export const fmtYmdLong = (d: string) => F_LONG.format(new Date(`${d}T12:00:00+05:30`))
export const fmtWhen = (iso: string) => `${fmtWd(iso)} ${fmtShort(iso)}, ${fmtTime(iso)}`

export const pluralize = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

// ---------------------------------------------------------------------------------------------
export function C2Head({
  eyebrow,
  title,
  lead,
  actions,
  gold,
}: {
  eyebrow: string
  title: string
  lead?: string
  actions?: ReactNode
  gold?: boolean
}) {
  return (
    <header className="c2-head c2-in">
      <div>
        <p className={gold ? 'c2-eyb-gold' : 'c2-eyb'}>{eyebrow}</p>
        <h1 className="c2-h1">{title}</h1>
        {lead ? <p className="c2-lead">{lead}</p> : null}
      </div>
      {actions ? <div className="c2-actions">{actions}</div> : null}
    </header>
  )
}

export function Box({
  title,
  titleId,
  actions,
  label,
  className = '',
  children,
}: {
  title?: ReactNode
  titleId?: string
  actions?: ReactNode
  label?: string
  className?: string
  children: ReactNode
}) {
  return (
    <section className={`c2-box ${className}`.trim()} aria-label={label} aria-labelledby={title && titleId ? titleId : undefined}>
      {title || actions ? (
        <div className="c2-bh">
          {title ? (
            <h2 className="c2-bt" id={titleId}>
              {title}
            </h2>
          ) : (
            <span />
          )}
          {actions}
        </div>
      ) : null}
      {children}
    </section>
  )
}

export function Ic({ tone = 'teal', d, size = 20 }: { tone?: 'teal' | 'blue' | 'peach' | 'sage' | 'lav' | 'red' | 'gold'; d: string; size?: number }) {
  return (
    <span className={`c2-ic c2-t-${tone}`} aria-hidden="true">
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" focusable="false">
        <path d={d} />
      </svg>
    </span>
  )
}

export const PATHS = {
  pill: 'M8.5 3.5a5 5 0 0 1 7 7l-5 5a5 5 0 0 1-7-7zM6 11l7 7',
  bottle: 'M9 3h6v4l2 3v10a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V10l2-3z',
  tube: 'M7 21h10M9 21V9h6v12M10 9V5h4v4',
  store: 'M4 10h16v10H4zM3 6h18l-1 4H4zM10 14h4M12 12v4',
  storeTick: 'M4 10h16v10H4zM3 6h18l-1 4H4zM9 15l2 2l4-4',
  lock: 'M7 11V8a5 5 0 0 1 10 0v3M5 11h14v10H5z',
  warn: 'M12 3l9 16H3zM12 10v4M12 17h.01',
  bell: 'M6 16V11a6 6 0 0 1 12 0v5l2 2H4zM10 20h4',
  doc: 'M6 3h8l4 4v14H6zM14 3v4h4',
  eye: 'M2 12s4-7 10-7s10 7 10 7s-4 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 0 6a3 3 0 0 0 0-6z',
  cal: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4',
  shield: 'M12 3l8 3v6c0 5-3.5 8-8 9c-4.5-1-8-4-8-9V6z',
  drop: 'M12 3c3 4 6 7.5 6 11a6 6 0 0 1-12 0c0-3.5 3-7 6-11z',
  check: 'M5 12l4 4l10-10',
  plus: 'M12 3v18M3 12h18',
  arrow: 'M4 12h16M12 4l8 8l-8 8',
  phone: 'M7 3h10v18H7zM11 18h2',
  laptop: 'M4 5h16v11H4zM2 19h20',
  heart: 'M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z',
  pin: 'M12 21s7-6 7-11a7 7 0 0 0-14 0c0 5 7 11 7 11z',
} as const

// ---------------------------------------------------------------------------------------------
export function CardSkeleton({ lines = 3, label = 'Loading' }: { lines?: number; label?: string }) {
  return (
    <div className="c2-skel-box" role="status" aria-label={label}>
      <Skeleton width="45%" height={18} />
      <Skeleton lines={lines} />
    </div>
  )
}

export function ErrorBox({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const message = error instanceof Error ? error.message : 'Please try again.'
  return (
    <Alert tone="danger" title="Could not load this" action={onRetry ? <Button size="sm" variant="secondary" onClick={onRetry}>Try again</Button> : undefined}>
      {message}
    </Alert>
  )
}

// ---------------------------------------------------------------------------------------------
/** Polite confirmation message at the bottom of the screen. */
export function useToast(ms = 4000) {
  const [msg, setMsg] = useState<{ title: string; text?: string } | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const show = useCallback(
    (title: string, text?: string) => {
      setMsg({ title, text })
      clearTimeout(timer.current)
      timer.current = setTimeout(() => setMsg(null), ms)
    },
    [ms],
  )
  useEffect(() => () => clearTimeout(timer.current), [])
  const node = (
    <div aria-live="polite" role="status">
      {msg ? (
        <div className="c2-toast">
          <strong>{msg.title}</strong>
          {msg.text ? <span>{msg.text}</span> : null}
        </div>
      ) : null}
    </div>
  )
  return { show, node }
}

// ---------------------------------------------------------------------------------------------
const FROM_LABEL: Record<string, string> = {
  citizen: 'Citizen',
  doctor: 'Doctor',
  nurse: 'Nurse',
  labtech: 'Lab',
  radiology: 'Radiology',
  pharmacist: 'Pharmacy',
  pharmacyadmin: 'Pharmacy admin',
  hospitaladmin: 'Hospital admin',
  district: 'District',
  state: 'State',
  zonal: 'Zonal',
  central: 'MoHFW',
}
const FROM_TONE: Record<string, string> = {
  doctor: 'c2-f-blue',
  nurse: 'c2-f-teal',
  labtech: 'c2-f-teal',
  radiology: 'c2-f-lav',
  pharmacist: 'c2-f-sage',
  pharmacyadmin: 'c2-f-sage',
  hospitaladmin: 'c2-f-peach',
  district: 'c2-f-red',
  state: 'c2-f-red',
  zonal: 'c2-f-red',
  central: 'c2-f-red',
  citizen: 'c2-f-gold',
}
export const fromLabel = (f: string) => FROM_LABEL[f] ?? f
export const fromTone = (f: string) => FROM_TONE[f] ?? ''

function linkLabel(href: string): string {
  if (href.startsWith('/doctor')) return 'Open in Doctor app'
  if (href.startsWith('/pharmacist')) return 'Track at pharmacy'
  if (href.startsWith('/lab')) return 'Open in Lab'
  if (href.startsWith('/hospital-admin')) return 'Open in Hospital admin'
  if (href.startsWith('/district')) return 'Open in District console'
  if (href.startsWith('/citizen/medicines')) return 'See in Medicines'
  if (href.startsWith('/citizen/blood')) return 'See in Blood donation'
  if (href.startsWith('/citizen/alerts')) return 'See in Alerts'
  if (href.startsWith('/citizen/documents')) return 'See in Documents'
  return 'Open'
}

/** "Live from other apps": the newest events addressed to the citizen role (from the shared event feed). */
export function LiveFeed({ types, note, max = 3, title = 'Live from other apps', min = 2 }: { types?: string[]; note: string; max?: number; title?: string; min?: number }) {
  const { events, unavailable } = useEvents('CITIZEN')
  const mine = events.filter((e) => e.from !== 'citizen')
  let pick = mine.filter((e) => !types || types.includes(e.type))
  if (pick.length < min) pick = pick.concat(mine.filter((e) => !pick.includes(e)))
  pick = pick.slice(0, max)
  if (unavailable || pick.length === 0) return null
  return (
    <Box title={<><span className="c2-live" aria-hidden="true" style={{ marginRight: 8 }} />{title}</>} titleId="c2-live-t" actions={<span className="c2-muted">{note}</span>} className="c2-in c2-d2">
      <div className="c2-conn-l">
        {pick.map((e) => {
          const internal = e.href?.startsWith('/')
          const body = (
            <>
              <span className="c2-ev-top">
                <span className={`c2-from ${fromTone(e.from)}`}>{fromLabel(e.from)}</span>
                <span className="c2-muted c2-num">{e.at ? fmtTime(e.at) : ''}</span>
              </span>
              <strong>{e.title}</strong>
              {e.text ? <span>{e.text}</span> : null}
              <span className="c2-ev-go">{linkLabel(e.href ?? '')} →</span>
            </>
          )
          return internal ? (
            <Link key={e.id} to={e.href!} className="c2-ev">
              {body}
            </Link>
          ) : (
            <div key={e.id} className="c2-ev">
              {body}
            </div>
          )
        })}
      </div>
    </Box>
  )
}

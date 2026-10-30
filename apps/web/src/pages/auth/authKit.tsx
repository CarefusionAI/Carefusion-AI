import { useEffect, useRef, useState } from 'react'
import type { ClipboardEvent, CSSProperties, KeyboardEvent, ReactNode } from 'react'
import { Link } from 'react-router-dom'
import clsx from 'clsx'
import type { Role } from '@carefusion/shared'
import CfBackground from '../../components/CfBackground'
import type { CfTheme } from '../../components/CfBackground'
import { Alert } from '../../components/ui'
import './auth.css'

// Shared building blocks for the public sign-in, registration and error screens.

/** Set the browser tab title for a screen. */
export function usePageTitle(title: string) {
  useEffect(() => {
    const previous = document.title
    document.title = title
    return () => {
      document.title = previous
    }
  }, [title])
}

/** True when the visitor asked the OS for reduced motion. Used to stop JS-driven rotation. */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false,
  )
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const onChange = () => setReduced(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return reduced
}

/** Run a callback after a delay and cancel it automatically when the screen closes. */
export function useTimers() {
  const ids = useRef<number[]>([])
  useEffect(
    () => () => {
      ids.current.forEach((id) => window.clearTimeout(id))
    },
    [],
  )
  return (fn: () => void, ms: number) => {
    ids.current.push(window.setTimeout(fn, ms))
  }
}

/** Page frame: animated background, skip link, and the "synthetic demo data" banner for this screen. */
export function AuthRoot({
  children,
  bannerText,
  theme = 'pub',
  title,
  main = true,
}: {
  children: ReactNode
  /** Screen-specific line that follows the "Synthetic demo data" banner title. */
  bannerText: ReactNode
  theme?: CfTheme
  title: string
  /** When false the screen provides its own <main>. */
  main?: boolean
}) {
  usePageTitle(title)
  return (
    <div className="cf-root au-root">
      <CfBackground theme={theme} />
      {main ? (
        <a className="au-skip" href="#au-main">
          Skip to main content
        </a>
      ) : null}
      <Alert tone="warning" banner title="Synthetic demo data">
        {bannerText}
      </Alert>
      {children}
    </div>
  )
}

/** Router link drawn as a design-system button. */
export function LinkButton({
  to,
  variant = 'secondary',
  size = 'md',
  full,
  className,
  style,
  children,
  onClick,
}: {
  to: string
  variant?: 'primary' | 'secondary' | 'soft' | 'ghost'
  size?: 'sm' | 'md' | 'lg'
  full?: boolean
  className?: string
  style?: CSSProperties
  children: ReactNode
  onClick?: () => void
}) {
  return (
    <Link
      to={to}
      onClick={onClick}
      style={style}
      className={clsx('cf-btn', `cf-btn-${variant}`, `cf-btn-${size}`, full && 'cf-btn-full', className)}
    >
      <span className="cf-btn-label" style={{ whiteSpace: 'inherit' }}>
        {children}
      </span>
    </Link>
  )
}

export function Logo({ height = 34, label = 'CareFusion AI home', to = '/', style }: { height?: number; label?: string; to?: string; style?: CSSProperties }) {
  return (
    <Link to={to} aria-label={label} style={{ display: 'inline-flex', ...style }}>
      <img src="/logo.svg" alt="CareFusion AI" style={{ height, width: 'auto', display: 'block' }} />
    </Link>
  )
}

/** Small stroke icon on the 24px grid, as used throughout the design. */
export function Icon({ d, size = 20, stroke = 'currentColor', strokeWidth = 1.8, children }: { d?: string; size?: number; stroke?: string; strokeWidth?: number; children?: ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {d ? <path d={d} /> : children}
    </svg>
  )
}

export const ICON = {
  arrowRight: 'M5 12h14M13 6l6 6l-6 6',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  shield: 'M12 3l8 3v6c0 4.5-3.4 8.3-8 9c-4.6-.7-8-4.5-8-9V6zM9 12l2 2l4-4',
  user: 'M12 12a4 4 0 1 0 0-8a4 4 0 0 0 0 8zM4 21c1-4 4-6 8-6s7 2 8 6',
  doc: 'M6 3h8l4 4v14H6zM14 3v4h4M9 13h6M9 17h4',
  docPlain: 'M6 3h8l4 4v14H6zM14 3v4h4',
  doctor: 'M6 3v6a4 4 0 0 0 8 0V3M10 13v2a5 5 0 0 0 10 0v-2M20 11a2 2 0 1 0 0-.01M6 3h2M12 3h2',
  face: 'M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2M9 10v1M15 10v1M12 10v4h-1M9.5 16.5c1.5 1 3.5 1 5 0',
  idCard: 'M3 5h18v14H3zM7 15c.6-1.6 1.8-2.4 3-2.4s2.4.8 3 2.4M10 10.5a1.5 1.5 0 1 0 0-.01M15 10h3M15 13h3',
} as const

/** The CareFusion cross, filled. */
export function CrossMark({ size, style, className, colors = ['#86bdb8', '#d2b277'] }: { size: number; style?: CSSProperties; className?: string; colors?: [string, string] }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 64 64" width={size} height={size} style={style} className={className}>
      <rect x="21" y="5" width="18" height="50" rx="9" fill={colors[0]} />
      <rect x="9" y="25" width="50" height="18" rx="9" fill={colors[1]} />
    </svg>
  )
}

/** Decorative rings, orbit and dot grid behind a coloured side panel. */
export function PanelFx() {
  return (
    <div className="cf-pfx" aria-hidden="true">
      <span className="pfx-dots" />
      <span className="pfx-ring" />
      <span className="pfx-ring r2" />
      <span className="pfx-ring r3" />
      <span className="pfx-orbit">
        <i />
        <i />
        <i />
      </span>
      <svg className="pfx-mark" viewBox="0 0 64 64">
        <rect x="21" y="5" width="18" height="50" rx="9" />
        <rect x="9" y="25" width="50" height="18" rx="9" />
      </svg>
    </div>
  )
}

/** Large soft blurred colour blob (decoration only). */
export function Blob({ size, color, style }: { size: number; color: string; style: CSSProperties }) {
  return (
    <span
      aria-hidden="true"
      style={{ position: 'absolute', width: size, height: size, borderRadius: 9999, background: color, filter: 'blur(80px)', ...style }}
    />
  )
}

export function Eyebrow({ color, children, style }: { color: string; children: ReactNode; style?: CSSProperties }) {
  return (
    <p className="au-eyebrow" style={{ color, ...style }}>
      {children}
    </p>
  )
}

/** Six single-digit boxes with auto-advance, backspace and paste. Demo only: the code is never checked. */
export function OtpInput({ value, onChange, legend = '6-digit code', length = 6 }: { value: string; onChange: (v: string) => void; legend?: string; length?: number }) {
  const refs = useRef<(HTMLInputElement | null)[]>([])
  const digits = Array.from({ length }, (_, i) => value[i] ?? '')

  function setAt(i: number, ch: string) {
    const next = digits.slice()
    next[i] = ch
    onChange(next.join('').slice(0, length))
  }
  function onInput(i: number, raw: string) {
    const ch = raw.replace(/\D/g, '').slice(-1)
    setAt(i, ch)
    if (ch && i < length - 1) refs.current[i + 1]?.focus()
  }
  function onKeyDown(i: number, e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && !digits[i] && i > 0) {
      e.preventDefault()
      setAt(i - 1, '')
      refs.current[i - 1]?.focus()
    } else if (e.key === 'ArrowLeft' && i > 0) {
      refs.current[i - 1]?.focus()
    } else if (e.key === 'ArrowRight' && i < length - 1) {
      refs.current[i + 1]?.focus()
    }
  }
  function onPaste(e: ClipboardEvent<HTMLInputElement>) {
    const text = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, length)
    if (!text) return
    e.preventDefault()
    onChange(text)
    refs.current[Math.min(text.length, length - 1)]?.focus()
  }

  return (
    <fieldset style={{ margin: 0, padding: 0, border: 0 }}>
      <legend className="cf-sr">{legend}</legend>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {digits.map((d, i) => (
          <input
            key={i}
            ref={(n) => {
              refs.current[i] = n
            }}
            className="au-otp"
            inputMode="numeric"
            autoComplete={i === 0 ? 'one-time-code' : 'off'}
            maxLength={1}
            aria-label={`Digit ${i + 1}`}
            value={d}
            onChange={(e) => onInput(i, e.target.value)}
            onKeyDown={(e) => onKeyDown(i, e)}
            onPaste={onPaste}
          />
        ))}
      </div>
    </fieldset>
  )
}

/** A two-row mark used in the sign-in panels: label text plus a small coloured code. */
export function RoleCode({ code, bg, color }: { code: string; bg: string; color: string }) {
  return (
    <span className="au-code" style={{ background: bg, color }}>
      {code}
    </span>
  )
}

/** The 12 demo roles in the order of the design, with the colour of their group. */
export interface DemoRole {
  role: Role
  code: string
  label: string
  who: string
  path: string
  bg: string
  color: string
  group: 'Citizens' | 'Medical staff' | 'Pharmacy' | 'Administrators'
}

const PEACH = { bg: 'var(--tint-peach)', color: 'var(--peach-text)' }
const TEAL = { bg: 'var(--tint-teal)', color: 'var(--primary-text)' }
const SAGE = { bg: 'var(--tint-sage)', color: 'var(--success)' }
const BLUE = { bg: 'var(--tint-blue)', color: 'var(--info)' }
const LAV = { bg: 'var(--tint-lavender)', color: 'var(--ai)' }

export const DEMO_ROLES: DemoRole[] = [
  { role: 'CITIZEN', code: 'CIT', label: 'Citizen', who: 'Anjali Menon · Pathanamthitta', path: '/citizen', group: 'Citizens', ...PEACH },
  { role: 'DOCTOR', code: 'DOC', label: 'Doctor', who: 'Dr. Arun Nair · General medicine', path: '/doctor', group: 'Medical staff', ...TEAL },
  { role: 'NURSE', code: 'NUR', label: 'Nurse', who: 'Lekha Pillai · Ward 3', path: '/nurse', group: 'Medical staff', ...TEAL },
  { role: 'LAB_TECH', code: 'LAB', label: 'Lab technician', who: 'Rahul Varghese · Pathology', path: '/lab-tech', group: 'Medical staff', ...TEAL },
  { role: 'RADIOLOGY_TECH', code: 'RAD', label: 'Radiology technician', who: 'Fathima Beevi · Imaging', path: '/radiology-tech', group: 'Medical staff', ...TEAL },
  { role: 'PHARMACIST', code: 'PHA', label: 'Pharmacist', who: 'Joseph Mathew · Hospital pharmacy', path: '/pharmacist', group: 'Pharmacy', ...SAGE },
  { role: 'PHARMACY_ADMIN', code: 'PAD', label: 'Pharmacy admin', who: 'Suma Thomas · Licence DEMO-DL-2041', path: '/pharmacy-admin', group: 'Pharmacy', ...SAGE },
  { role: 'HOSPITAL_ADMIN', code: 'HAD', label: 'Hospital admin', who: 'Dr. Meera Krishnan · Demo General Hospital', path: '/hospital-admin', group: 'Administrators', ...BLUE },
  { role: 'DISTRICT_ADMIN', code: 'DAD', label: 'District admin', who: 'Ajay Kumar · Pathanamthitta', path: '/district-admin', group: 'Administrators', ...LAV },
  { role: 'STATE_ADMIN', code: 'SAD', label: 'State admin', who: 'Latha Nair · Kerala', path: '/state-admin', group: 'Administrators', ...LAV },
  { role: 'ZONAL_ADMIN', code: 'ZAD', label: 'Zonal admin', who: 'R. Venkatesh · South zone', path: '/zonal-admin', group: 'Administrators', ...LAV },
  { role: 'CENTRAL_ADMIN', code: 'CAD', label: 'Central admin', who: 'S. Banerjee · National', path: '/central-admin', group: 'Administrators', ...LAV },
]

export function demoRole(role: Role): DemoRole {
  const found = DEMO_ROLES.find((r) => r.role === role)
  if (!found) throw new Error(`Unknown demo role: ${role}`)
  return found
}

/** Which sign-in page a signed-out role should use. */
export function loginPathFor(role: Role | null | undefined): string {
  switch (role) {
    case 'NURSE':
    case 'LAB_TECH':
    case 'RADIOLOGY_TECH':
    case 'PHARMACIST':
      return '/login/staff'
    case 'PHARMACY_ADMIN':
    case 'HOSPITAL_ADMIN':
    case 'DISTRICT_ADMIN':
    case 'STATE_ADMIN':
    case 'ZONAL_ADMIN':
    case 'CENTRAL_ADMIN':
      return '/login/admin'
    default:
      return '/login'
  }
}

/** "17 Oct 2026" style date. */
export function formatDay(d: Date): string {
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

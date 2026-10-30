import { Link } from 'react-router-dom'
import type { ReactNode } from 'react'

export type PharmacySection = 'overview' | 'staff' | 'inventory' | 'orders' | 'expiry' | 'compliance' | 'audit' | 'profile'

export const PHARMACY_PATH = '/pharmacy-admin'

export function sectionHref(id: PharmacySection): string {
  return id === 'overview' ? PHARMACY_PATH : `${PHARMACY_PATH}?section=${id}`
}

export function SectionLink({ to, children, className = 'ak-lk' }: { to: PharmacySection; children: ReactNode; className?: string }) {
  return (
    <Link className={className} to={sectionHref(to)}>
      {children}
    </Link>
  )
}

export function greeting(iso: string): string {
  const h = Number(new Date(iso).toLocaleString('en-GB', { hour: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' }))
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

export function weekdayLong(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' })
}

export function firstName(name: string): string {
  const parts = name.replace(/^(Dr|Mr|Ms|Mrs)\.?\s+/i, '').split(/\s+/)
  return parts[0] ?? name
}

export function shortDay(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString('en-IN', { weekday: 'short', timeZone: 'UTC' })
}

/** A pill switch for tables; the visible label lives in aria-label. */
export function MiniSwitch({ on, label, disabled, onChange, title }: { on: boolean; label: string; disabled?: boolean; onChange: (next: boolean) => void; title?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      title={title}
      disabled={disabled}
      className={`cf-switch${on ? ' is-on' : ''}`}
      onClick={() => onChange(!on)}
    >
      <span className="cf-switch-thumb" aria-hidden="true" />
    </button>
  )
}

import { Link } from 'react-router-dom'
import type { ReactNode } from 'react'
import type { BadgeTone } from '../../../components/ui'
import type { HospitalComplaintState } from '../../../api/hospitalAdmin'

export type HospitalSection =
  | 'overview'
  | 'approvals'
  | 'staff'
  | 'admissions'
  | 'roster'
  | 'beds'
  | 'roles'
  | 'profile'
  | 'complaints'
  | 'reviews'
  | 'breakglass'
  | 'audit'

export const HOSPITAL_PATH = '/hospital-admin'

export function sectionHref(id: HospitalSection): string {
  return id === 'overview' ? HOSPITAL_PATH : `${HOSPITAL_PATH}?section=${id}`
}

/** In-page link to another section (keeps the SPA route, adds the ?section= query). */
export function SectionLink({ to, children, className = 'ak-lk' }: { to: HospitalSection; children: ReactNode; className?: string }) {
  return (
    <Link className={className} to={sectionHref(to)}>
      {children}
    </Link>
  )
}

export const COMPLAINT_STATE: Record<HospitalComplaintState, { label: string; tone: BadgeTone }> = {
  new: { label: 'New', tone: 'warning' },
  under_review: { label: 'Under review', tone: 'info' },
  resolved: { label: 'Resolved', tone: 'success' },
  escalated: { label: 'Escalated', tone: 'danger' },
}

const CATEGORY_TONES: BadgeTone[] = ['teal', 'peach', 'info', 'gold', 'ai']
export function categoryTone(key: string): BadgeTone {
  let sum = 0
  for (let i = 0; i < key.length; i++) sum += key.charCodeAt(i)
  return CATEGORY_TONES[sum % CATEGORY_TONES.length] ?? 'teal'
}

const DEPT_COLOURS = ['#86bdb8', '#d99a96', '#b7a6d4', '#e7c58e', '#8eb4d6', '#8ebba5']
/** Department colour square + name (the colour is a hint only; the name is always shown). */
export function DeptTag({ name }: { name: string | null }) {
  if (!name) return <span className="ak-muted">-</span>
  let sum = 0
  for (let i = 0; i < name.length; i++) sum += name.charCodeAt(i)
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>
      <i aria-hidden="true" style={{ width: 10, height: 10, borderRadius: 3, display: 'inline-block', background: DEPT_COLOURS[sum % DEPT_COLOURS.length] }} />
      {name}
    </span>
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

/** "Dr. Meera Krishnan" -> "Dr. Meera" */
export function shortGreetingName(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean)
  if (parts.length <= 2) return name
  return /^(dr|mr|ms|mrs)\.?$/i.test(parts[0] ?? '') ? `${parts[0]} ${parts[1]}` : (parts[0] ?? name)
}

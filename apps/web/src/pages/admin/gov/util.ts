import type { BadgeTone } from '../../../components/ui'

const IN = new Intl.NumberFormat('en-IN')
const IN1 = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 1 })

/** 1,23,456 style numbers. null becomes a dash. */
export function fmtNum(n: number | null | undefined, dash = '–'): string {
  return n === null || n === undefined || Number.isNaN(n) ? dash : IN.format(n)
}

export function fmtNum1(n: number | null | undefined, dash = '–'): string {
  return n === null || n === undefined || Number.isNaN(n) ? dash : IN1.format(n)
}

/** Percent that may be tiny (demo data): keep up to 2 decimals under 1 percent. */
export function fmtPct(n: number | null | undefined, dash = '–'): string {
  if (n === null || n === undefined || Number.isNaN(n)) return dash
  if (n !== 0 && Math.abs(n) < 1) return `${n.toFixed(2)}%`
  return `${IN1.format(n)}%`
}

export function parseDate(iso: string | null | undefined): Date | null {
  if (!iso) return null
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : d
}

const TZ = 'Asia/Kolkata'

export function fmtDate(iso: string | null | undefined): string {
  const d = parseDate(iso)
  return d ? d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: TZ }) : '–'
}

export function fmtDay(iso: string | null | undefined): string {
  const d = parseDate(iso)
  return d ? d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: TZ }) : '–'
}

export function fmtDateTime(iso: string | null | undefined): string {
  const d = parseDate(iso)
  return d
    ? `${d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: TZ })}, ${d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: TZ })}`
    : '–'
}

/** "2 days ago" for a number of whole days. */
export function ageText(days: number): string {
  if (days <= 0) return 'Today'
  if (days === 1) return '1 day ago'
  return `${days} days ago`
}

export function humanise(value: string | null | undefined): string {
  if (!value) return ''
  const t = value.replace(/[_-]+/g, ' ').trim()
  return t.charAt(0).toUpperCase() + t.slice(1)
}

/** ISO week start (Monday) to "Wk 42". */
export function isoWeekLabel(isoWeek: number): string {
  return `Wk ${isoWeek}`
}

export const LEVEL_LABEL: Record<string, string> = {
  district: 'District',
  state: 'State',
  zonal: 'Zonal',
  central: 'Central',
}

export const LEVEL_NAME: Record<string, string> = {
  district: 'district admin',
  state: 'state admin',
  zonal: 'zonal admin',
  central: 'central admin',
}

export function statusTone(status: string): BadgeTone {
  switch (status) {
    case 'approved':
    case 'sent':
    case 'active':
    case 'done':
    case 'justified':
    case 'reviewed':
    case 'closed':
    case 'released':
      return 'success'
    case 'waiting':
    case 'pending':
    case 'pending_second_approval':
    case 'draft':
    case 'planned':
    case 'requested':
    case 'reviewing':
    case 'more_info':
      return 'warning'
    case 'rejected':
    case 'suspended':
    case 'escalated':
    case 'open':
    case 'cancelled':
      return 'danger'
    case 'scheduled':
    case 'in_progress':
    case 'assigned':
      return 'info'
    default:
      return 'neutral'
  }
}

export function severityTone(sev: string | null | undefined): BadgeTone {
  if (sev === 'high' || sev === 'alert') return 'danger'
  if (sev === 'medium' || sev === 'notice') return 'warning'
  if (sev === 'ok') return 'success'
  return 'info'
}

export function downloadText(filename: string, text: string, mime = 'text/csv;charset=utf-8'): void {
  const blob = new Blob([text], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}

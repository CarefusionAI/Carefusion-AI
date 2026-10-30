import type { BadgeTone } from '../../../components/ui'
import { demoNow } from '../../../lib/demoClock'

const TZ = 'Asia/Kolkata'

export function fmtTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: TZ })
}

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: TZ })
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = iso.length === 10 ? new Date(`${iso}T00:00:00+05:30`) : new Date(iso)
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: TZ })
}

/** 38 -> "38 min", 130 -> "2 h 10 min", 9636 -> "6 d 16 h". */
export function fmtMinutes(min: number | null | undefined): string {
  if (min === null || min === undefined) return '—'
  if (min < 60) return `${min} min`
  if (min < 60 * 48) return `${Math.floor(min / 60)} h ${min % 60} min`
  return `${Math.floor(min / 1440)} d ${Math.floor((min % 1440) / 60)} h`
}

export function fmtBytes(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—'
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`
}

export const PRIORITY_LABEL: Record<string, string> = { routine: 'Routine', urgent: 'Urgent', stat: 'STAT' }
export const PRIORITY_TONE: Record<string, BadgeTone> = { routine: 'neutral', urgent: 'warning', stat: 'danger' }

export const STATUS_LABEL: Record<string, string> = {
  waiting: 'Waiting',
  scheduled: 'Scheduled',
  in_progress: 'Scanning',
  uploaded: 'Images uploaded',
  awaiting_report: 'Awaiting report',
  reported: 'Reported',
  withdrawn: 'Withdrawn',
}
export const STATUS_TONE: Record<string, BadgeTone> = {
  waiting: 'warning',
  scheduled: 'info',
  in_progress: 'info',
  uploaded: 'success',
  awaiting_report: 'ai',
  reported: 'success',
  withdrawn: 'neutral',
}

export function modClass(mod: string): string {
  switch (mod) {
    case 'CT':
      return 'rt-m-ct'
    case 'MRI':
      return 'rt-m-mri'
    case 'USG':
    case 'ECHO':
      return 'rt-m-usg'
    default:
      return 'rt-m-xr'
  }
}

export const MODALITY_LABEL: Record<string, string> = { XR: 'X-ray', PORTABLE: 'Portable', CT: 'CT', MRI: 'MRI', USG: 'USG', ECHO: 'Echo', MAMMO: 'Mammo', FLUORO: 'Fluoro' }

export function fileKind(name: string, mime: string): 'dicom' | 'zip' | 'image' | 'report' {
  const n = name.toLowerCase()
  if (n.endsWith('.dcm') || mime === 'application/dicom') return 'dicom'
  if (n.endsWith('.zip') || mime.includes('zip')) return 'zip'
  if (n.endsWith('.pdf')) return 'report'
  return 'image'
}

/** Hex SHA-256 of a file, or undefined when it is too large to hash in the browser quickly. */
export async function sha256Hex(file: File, maxBytes = 64 * 1024 * 1024): Promise<string | undefined> {
  if (file.size > maxBytes || !globalThis.crypto?.subtle) return undefined
  const buf = await file.arrayBuffer()
  const digest = await crypto.subtle.digest('SHA-256', buf)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export function todayIst(): string {
  return new Date(demoNow()).toLocaleDateString('en-CA', { timeZone: TZ })
}

/** "2026-10-17T14:30" in IST -> ISO with offset. */
export function istLocalToIso(local: string): string {
  return new Date(`${local}:00+05:30`).toISOString()
}

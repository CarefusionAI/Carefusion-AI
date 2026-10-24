import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common'
import type { ZodType, ZodTypeDef } from 'zod'

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function parseBody<T>(schema: ZodType<T, ZodTypeDef, unknown>, body: unknown): T {
  const result = schema.safeParse(body ?? {})
  if (!result.success) {
    throw new BadRequestException({
      success: false,
      errorMessage: 'Invalid request',
      issues: result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    })
  }
  return result.data
}

/** Decode a demo "encrypted" column (alpha convention: plain UTF-8 bytes with enc_key_id 'demo-none'). */
export function decodeDemoBytes(value: Buffer | null | undefined): string {
  return value ? value.toString('utf8') : ''
}

export function num(v: unknown): number | null {
  if (v === null || v === undefined) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

export function iso(v: unknown): string | null {
  if (!v) return null
  return v instanceof Date ? v.toISOString() : new Date(String(v)).toISOString()
}

export function ageYears(dob: string | Date | null | undefined): number | null {
  if (!dob) return null
  const d = new Date(dob)
  if (Number.isNaN(d.getTime())) return null
  const now = new Date()
  let age = now.getFullYear() - d.getFullYear()
  const m = now.getMonth() - d.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--
  return age
}

/** Map the database rule codes (CFnnn raised as check_violation) to a clean HTTP error. */
export function mapDbError(err: unknown): never {
  const e = err as { code?: string; message?: string; constraint?: string }
  const msg = e?.message ?? 'Database error'
  const rule = /CF\d{3}/.exec(msg)?.[0]
  if (e?.code === '23505') throw new ConflictException({ success: false, errorMessage: 'Already exists', constraint: e.constraint })
  if (e?.code === '23P01') throw new ConflictException({ success: false, errorMessage: 'That time slot is already taken', constraint: e.constraint })
  if (e?.code === '23514' || rule) {
    throw new ConflictException({ success: false, errorMessage: msg.replace(/^.*?(CF\d{3}:)/, '$1'), rule: rule ?? null, constraint: e?.constraint ?? null })
  }
  if (e?.code === '23503') throw new BadRequestException({ success: false, errorMessage: 'A referenced record does not exist', constraint: e.constraint })
  throw err
}

export function notFound(what: string): never {
  throw new NotFoundException({ success: false, errorMessage: `${what} not found` })
}

export function forbidden(message: string): never {
  throw new ForbiddenException({ success: false, errorMessage: message })
}

/** Start of the given day in India time (the demo runs on IST wall-clock times). */
export const IST_DAY_SQL = `(date_trunc('day', now() AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'Asia/Kolkata')`

/** pg returns DATE columns as local-midnight Date objects; format them as YYYY-MM-DD without a time-zone shift. */
export function dateStr(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null
  if (v instanceof Date) return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}-${String(v.getDate()).padStart(2, '0')}`
  return String(v).slice(0, 10)
}

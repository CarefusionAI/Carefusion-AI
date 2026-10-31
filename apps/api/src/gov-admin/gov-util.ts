import { BadRequestException } from '@nestjs/common'
import type { ZodType, ZodTypeDef } from 'zod'
import type { Widget } from '@carefusion/shared/dist/gov-admin'
import { neutraliseCsvText } from '../csv'

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function parseInput<T>(schema: ZodType<T, ZodTypeDef, unknown>, input: unknown): T {
  const result = schema.safeParse(input ?? {})
  if (!result.success) {
    throw new BadRequestException({
      success: false,
      errorMessage: 'Invalid request',
      issues: result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    })
  }
  return result.data
}

export function available<T>(data: T): Widget<T> {
  return { available: true, data }
}

export function unavailable<T = never>(reason: string): Widget<T> {
  return { available: false, reason }
}

/** Number or null from a pg value (bigint and numeric come back as strings). */
export function num(v: unknown): number | null {
  if (v === null || v === undefined) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

export function numOr0(v: unknown): number {
  return num(v) ?? 0
}

export function iso(v: unknown): string | null {
  if (v === null || v === undefined) return null
  return new Date(v as string | Date).toISOString()
}

export function round1(n: number): number {
  return Math.round(n * 10) / 10
}

export function median(values: number[]): number | null {
  if (!values.length) return null
  const s = [...values].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2
}

/** Small-cell rule: a count below `min` is hidden. */
export function suppress(count: number, min: number): number | null {
  return count < min ? null : count
}

export function csvCell(v: unknown): string {
  if (v === null || v === undefined) return ''
  const s = typeof v === 'string' ? neutraliseCsvText(v) : String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function toCsv(header: string[], rows: unknown[][]): string {
  return [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\n') + '\n'
}

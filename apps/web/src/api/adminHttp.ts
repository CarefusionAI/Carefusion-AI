// Small JSON client shared by the hospital admin and pharmacy admin hooks.
// The API answers failures as { success: false, errorMessage } (domain rules) or { message } (validation).
import { apiFetch } from '../lib/api'

export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

function messageFrom(body: unknown, status: number): string {
  if (body && typeof body === 'object') {
    const b = body as { errorMessage?: unknown; message?: unknown }
    if (typeof b.errorMessage === 'string' && b.errorMessage) return b.errorMessage
    if (typeof b.message === 'string' && b.message) return b.message
    if (Array.isArray(b.message) && b.message.length) return b.message.map(String).join('; ')
  }
  if (status === 401 || status === 403) return 'You do not have access to this area. Sign in again with the right role.'
  if (status === 404) return 'Not found.'
  if (status >= 500) return 'The server had a problem. Try again in a moment.'
  return `Request failed (${status})`
}

/** Query string from a plain object; empty / undefined values are skipped. */
export function qs(params: Record<string, string | number | boolean | undefined | null>): string {
  const usp = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue
    usp.set(k, String(v))
  }
  const s = usp.toString()
  return s ? `?${s}` : ''
}

export async function adminRequest<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  let res: Response
  try {
    res = await apiFetch(path, {
      method: init?.method ?? 'GET',
      headers: init?.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
    })
  } catch {
    throw new ApiError('Could not reach the server. Check that the API is running.', 0)
  }
  const body: unknown = await res.json().catch(() => null)
  if (!res.ok || (body && typeof body === 'object' && (body as { success?: unknown }).success === false)) {
    throw new ApiError(messageFrom(body, res.status), res.status)
  }
  return body as T
}

export function errorMessage(e: unknown, fallback = 'Something went wrong.'): string {
  return e instanceof Error && e.message ? e.message : fallback
}

/** Result of a write call. `message` is a human sentence when the API sent one. */
export interface WriteResult {
  success?: boolean
  message?: string
  [key: string]: unknown
}

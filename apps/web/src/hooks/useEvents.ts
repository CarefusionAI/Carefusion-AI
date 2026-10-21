import { useCallback, useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { z } from 'zod'
import type { Role } from '@carefusion/shared'
import { apiJson } from '../lib/api'
import { EVENT_ROLE_KEY } from '../config/nav'

// Cross-role event feed (booking -> doctor, prescription -> pharmacist, ...).
// In the design this was a localStorage "bus"; here it is GET /api/v1/events?role=<role>.
// The endpoint may not exist yet, so every failure is swallowed and the feed stays empty.

export const EventSchema = z.object({
  id: z.string(),
  type: z.string(),
  from: z.string(),
  to: z.array(z.string()),
  title: z.string(),
  text: z.string().default(''),
  href: z.string().optional(),
  at: z.string().default(''),
})

export type CfEvent = z.infer<typeof EventSchema>

const EMPTY: CfEvent[] = []
const POLL_MS = 3000
const POLL_AFTER_ERROR_MS = 15000
const TOAST_MS = 4000

/** Accepts either a bare array or { events: [...] }. Bad rows are dropped, not thrown. */
function parseEvents(payload: unknown): CfEvent[] {
  const list = Array.isArray(payload)
    ? payload
    : payload && typeof payload === 'object' && Array.isArray((payload as { events?: unknown }).events)
      ? (payload as { events: unknown[] }).events
      : []
  const out: CfEvent[] = []
  for (const row of list) {
    const parsed = EventSchema.safeParse(row)
    if (parsed.success) out.push(parsed.data)
  }
  return out
}

export interface UseEventsResult {
  /** Events addressed to this role, newest first as the API returns them. */
  events: CfEvent[]
  /** True when the last request failed (for example the endpoint is not built yet). */
  unavailable: boolean
  /** Newest unseen event from another role, shown for a few seconds. */
  toast: CfEvent | null
  dismissToast: () => void
}

export function useEvents(role: Role | null | undefined): UseEventsResult {
  const roleKey = role ? EVENT_ROLE_KEY[role] : null

  const query = useQuery({
    queryKey: ['events', roleKey],
    enabled: roleKey !== null,
    retry: false,
    refetchInterval: (q) => (q.state.status === 'error' ? POLL_AFTER_ERROR_MS : POLL_MS),
    queryFn: async () => parseEvents(await apiJson<unknown>(`/v1/events?role=${encodeURIComponent(roleKey ?? '')}`)),
  })

  const events = query.data ?? EMPTY
  const [toast, setToast] = useState<CfEvent | null>(null)
  const seen = useRef<Set<string> | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  // New role -> forget what we have seen so the first load never fires a toast.
  useEffect(() => {
    seen.current = null
    setToast(null)
  }, [roleKey])

  useEffect(() => {
    if (!query.data || roleKey === null) return
    if (seen.current === null) {
      seen.current = new Set(query.data.map((e) => e.id))
      return
    }
    let fresh: CfEvent | null = null
    for (const e of query.data) {
      if (seen.current.has(e.id)) continue
      seen.current.add(e.id)
      if (!fresh && e.from !== roleKey && e.to.includes(roleKey)) fresh = e
    }
    if (fresh) {
      setToast(fresh)
      clearTimeout(timer.current)
      timer.current = setTimeout(() => setToast(null), TOAST_MS)
    }
  }, [query.data, roleKey])

  useEffect(() => () => clearTimeout(timer.current), [])

  const dismissToast = useCallback(() => {
    clearTimeout(timer.current)
    setToast(null)
  }, [])

  return { events, unavailable: query.isError, toast, dismissToast }
}

/** Short tag and tint shown in the toast and feed, per event type (from the design). */
export const EVENT_TAGS: Record<string, { tag: string; tone: 'blue' | 'teal' | 'peach' | 'sage' | 'lav' | 'cream' }> = {
  booking: { tag: 'BK', tone: 'blue' },
  prescription: { tag: 'Rx', tone: 'teal' },
  'lab-order': { tag: 'LAB', tone: 'blue' },
  'radiology-order': { tag: 'RAD', tone: 'lav' },
  'lab-result': { tag: 'RES', tone: 'sage' },
  'imaging-result': { tag: 'IMG', tone: 'lav' },
  'break-glass': { tag: '!', tone: 'peach' },
  alert: { tag: 'ALR', tone: 'peach' },
  'vitals-critical': { tag: 'EWS', tone: 'peach' },
  dispensed: { tag: 'OK', tone: 'sage' },
  complaint: { tag: 'CMP', tone: 'cream' },
  'blood-request': { tag: 'B+', tone: 'peach' },
  message: { tag: 'MSG', tone: 'teal' },
  referral: { tag: 'REF', tone: 'lav' },
  handover: { tag: 'HO', tone: 'cream' },
}

export function eventTag(type: string) {
  return EVENT_TAGS[type] ?? { tag: 'EVT', tone: 'cream' as const }
}

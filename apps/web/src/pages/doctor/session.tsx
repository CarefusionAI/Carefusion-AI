import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { dk, useSessions } from '../../api/doctor'
import type { DoctorSessionInfo } from '../../api/doctor'

// Which patient session the doctor is working in. The server is the source of truth (GET /sessions -> live),
// the chosen one is remembered per browser tab, and the countdown is computed from expiresAt every second.

const KEY = 'cf-doctor-active-session'

function readStored(): string | null {
  try {
    return window.sessionStorage.getItem(KEY)
  } catch {
    return null
  }
}

export interface DoctorSessionState {
  live: DoctorSessionInfo[]
  active: DoctorSessionInfo | null
  loading: boolean
  setActiveId: (id: string | null) => void
  /** Seconds left in the active session, counted down locally. */
  secondsLeft: number
  /** Total session length in seconds (30 min for a key session, 15 for break-glass). */
  totalSeconds: number
}

const Ctx = createContext<DoctorSessionState | null>(null)

export function DoctorSessionProvider({ children }: { children: ReactNode }) {
  const q = useSessions()
  const qc = useQueryClient()
  const [chosen, setChosen] = useState<string | null>(readStored)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  const live = useMemo(() => (q.data?.live ?? []).filter((s) => s.live), [q.data])
  const active = useMemo(() => live.find((s) => s.sessionId === chosen) ?? live[0] ?? null, [live, chosen])

  const setActiveId = useCallback((id: string | null) => {
    setChosen(id)
    try {
      if (id) window.sessionStorage.setItem(KEY, id)
      else window.sessionStorage.removeItem(KEY)
    } catch {
      /* storage unavailable */
    }
  }, [])

  const expiresMs = active ? new Date(active.expiresAt).getTime() : 0
  const secondsLeft = active ? Math.max(0, Math.round((expiresMs - now) / 1000)) : 0
  const totalSeconds = active ? Math.max(1, Math.round((expiresMs - new Date(active.startedAt).getTime()) / 1000)) : 1800

  // When the countdown reaches zero, ask the server for the new truth.
  useEffect(() => {
    if (active && secondsLeft === 0) void qc.invalidateQueries({ queryKey: dk.sessions })
  }, [active, secondsLeft, qc])

  const value = useMemo<DoctorSessionState>(
    () => ({ live, active, loading: q.isLoading, setActiveId, secondsLeft, totalSeconds }),
    [live, active, q.isLoading, setActiveId, secondsLeft, totalSeconds],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useDoctorSession(): DoctorSessionState {
  const v = useContext(Ctx)
  if (!v) throw new Error('useDoctorSession must be used inside <DoctorSessionProvider>')
  return v
}

/** Seconds left until `expiresAt`, counted down every second (for sessions that are not the active one). */
export function useCountdown(expiresAt: string | null | undefined): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])
  return expiresAt ? Math.max(0, Math.round((new Date(expiresAt).getTime() - now) / 1000)) : 0
}

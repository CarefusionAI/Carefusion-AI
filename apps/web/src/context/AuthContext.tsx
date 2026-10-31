import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Role } from '@carefusion/shared'
import { getRoleConfig } from '../config/roles'
import { setAuthToken } from '../lib/api'
import ReviewerPasswordPrompt from '../components/ReviewerPasswordPrompt'

export interface DemoUser {
  username: string
  displayName: string
  role: Role
  personId?: string
  userId?: string
}

interface AuthContextValue {
  user: DemoUser | null
  role: Role | null
  /** Resolves true once signed in. Asks for the reviewer password first when the API says the role needs one. */
  login: (role: Role) => Promise<boolean>
  logout: () => void
}

const ROLE_KEY = 'cf-demo-role'
const TOKEN_KEY = 'cf-demo-token'
const PERSON_KEY = 'cf-demo-person-id'
const USER_KEY = 'cf-demo-user-id'

function buildDemoUser(role: Role, personId?: string, userId?: string): DemoUser {
  const cfg = getRoleConfig(role)
  return {
    username: `demo-${role.toLowerCase().replace(/_/g, '-')}`,
    displayName: `Demo ${cfg.label}`,
    role,
    personId,
    userId,
  }
}

function readStoredUser(): DemoUser | null {
  try {
    const stored = window.sessionStorage.getItem(ROLE_KEY)
    if (!stored) return null
    const token = window.sessionStorage.getItem(TOKEN_KEY)
    if (token) setAuthToken(token)
    const personId = window.sessionStorage.getItem(PERSON_KEY) ?? undefined
    const userId = window.sessionStorage.getItem(USER_KEY) ?? undefined
    return buildDemoUser(stored as Role, personId, userId)
  } catch {
    return null
  }
}

function writeStorage(
  role: Role | null,
  token: string | null,
  personId?: string | null,
  userId?: string | null,
) {
  try {
    if (personId) window.sessionStorage.setItem(PERSON_KEY, personId)
    else window.sessionStorage.removeItem(PERSON_KEY)
    if (userId) window.sessionStorage.setItem(USER_KEY, userId)
    else window.sessionStorage.removeItem(USER_KEY)
    if (role) window.sessionStorage.setItem(ROLE_KEY, role)
    else window.sessionStorage.removeItem(ROLE_KEY)
    if (token) window.sessionStorage.setItem(TOKEN_KEY, token)
    else window.sessionStorage.removeItem(TOKEN_KEY)
  } catch {
    // Storage unavailable — app works without it.
  }
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<DemoUser | null>(readStoredUser)

  const [prompt, setPrompt] = useState<{ role: Role; error: string | null; busy: boolean; askPassword: boolean } | null>(null)
  const waiting = useRef<{ role: Role; resolve: (ok: boolean) => void } | null>(null)

  type Attempt = { ok: true } | { ok: false; passwordRequired: boolean; message: string }

  const attempt = useCallback(async (role: Role, password?: string): Promise<Attempt> => {
    try {
      const res = await fetch('/api/v1/auth/demo-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(password ? { role, password } : { role }),
      })
      if (res.ok) {
        const data = (await res.json()) as { token?: string; user?: { personId?: string | null; userId?: string | null } }
        const token = data.token ?? `demo:${role}`
        const personId = data.user?.personId ?? undefined
        const userId = data.user?.userId ?? undefined
        setAuthToken(token)
        setUser(buildDemoUser(role, personId, userId))
        writeStorage(role, token, personId, userId)
        return { ok: true }
      }
      const body = (await res.json().catch(() => null)) as { message?: string; passwordRequired?: boolean } | null
      return { ok: false, passwordRequired: body?.passwordRequired === true, message: body?.message ?? 'Sign-in failed.' }
    } catch {
      // The API is not reachable (for example, not started yet): keep the old offline demo behaviour.
      const token = `demo:${role}`
      setAuthToken(token)
      setUser(buildDemoUser(role))
      writeStorage(role, token)
      return { ok: true }
    }
  }, [])

  const login = useCallback(
    async (role: Role): Promise<boolean> => {
      const first = await attempt(role)
      if (first.ok) return true
      if (!first.passwordRequired) {
        setPrompt({ role, error: first.message, busy: false, askPassword: false })
        return false
      }
      return new Promise<boolean>((resolve) => {
        waiting.current = { role, resolve }
        setPrompt({ role, error: null, busy: false, askPassword: true })
      })
    },
    [attempt],
  )

  const submitPassword = useCallback(
    async (password: string) => {
      const w = waiting.current
      if (!w) return
      setPrompt((p) => (p ? { ...p, busy: true, error: null } : p))
      const r = await attempt(w.role, password)
      if (r.ok) {
        waiting.current = null
        setPrompt(null)
        w.resolve(true)
      } else {
        setPrompt((p) => (p ? { ...p, busy: false, error: r.message } : p))
      }
    },
    [attempt],
  )

  const cancelPrompt = useCallback(() => {
    waiting.current?.resolve(false)
    waiting.current = null
    setPrompt(null)
  }, [])

  const logout = useCallback(() => {
    setAuthToken(null)
    setUser(null)
    writeStorage(null, null)
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({ user, role: user?.role ?? null, login, logout }),
    [user, login, logout],
  )

  return (
    <AuthContext.Provider value={value}>
      {children}
      {prompt ? (
        <ReviewerPasswordPrompt
          roleLabel={getRoleConfig(prompt.role).label}
          error={prompt.error}
          busy={prompt.busy}
          askPassword={prompt.askPassword}
          onSubmit={submitPassword}
          onCancel={cancelPrompt}
        />
      ) : null}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}

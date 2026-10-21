import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import type { Role } from '@carefusion/shared'
import { getRoleConfig } from '../config/roles'
import { setAuthToken } from '../lib/api'

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
  login: (role: Role) => void
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

  const login = useCallback((role: Role) => {
    const token = `demo:${role}`
    setAuthToken(token)
    setUser(buildDemoUser(role))
    writeStorage(role, token)

    // Ask the API for the real person/user ids (demo mode looks them up in the database).
    fetch('/api/v1/auth/demo-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role }),
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { user?: { personId?: string | null; userId?: string | null } } | null) => {
        const personId = data?.user?.personId ?? undefined
        const userId = data?.user?.userId ?? undefined
        if (!personId && !userId) return
        setUser((current) => (current && current.role === role ? buildDemoUser(role, personId, userId) : current))
        writeStorage(role, token, personId, userId)
      })
      .catch(() => {
        // API may not be running yet — the demo token still works.
      })
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

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}

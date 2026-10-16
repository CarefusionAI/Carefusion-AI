import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import type { Role } from '@carefusion/shared'
import { getRoleConfig } from '../config/roles'
import { setAuthToken } from '../lib/api'

export interface DemoUser {
  username: string
  displayName: string
  role: Role
}

interface AuthContextValue {
  user: DemoUser | null
  role: Role | null
  login: (role: Role) => void
  logout: () => void
}

const ROLE_KEY = 'cf-demo-role'
const TOKEN_KEY = 'cf-demo-token'

function buildDemoUser(role: Role): DemoUser {
  const cfg = getRoleConfig(role)
  return {
    username: `demo-${role.toLowerCase().replace(/_/g, '-')}`,
    displayName: `Demo ${cfg.label}`,
    role,
  }
}

function readStoredUser(): DemoUser | null {
  try {
    const stored = window.sessionStorage.getItem(ROLE_KEY)
    if (!stored) return null
    const token = window.sessionStorage.getItem(TOKEN_KEY)
    if (token) setAuthToken(token)
    return buildDemoUser(stored as Role)
  } catch {
    return null
  }
}

function writeStorage(role: Role | null, token: string | null) {
  try {
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

    fetch('/api/v1/auth/demo-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role }),
    }).catch(() => {
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

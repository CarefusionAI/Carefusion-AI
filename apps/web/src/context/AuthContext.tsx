import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import type { Role } from '@carefusion/shared'
import { getRoleConfig } from '../config/roles'

// Demo-only auth. There is no real authentication in the alpha: choosing a role in the
// role switcher "logs in" as the matching demo user. Real login (Keycloak) comes later; see docs/02.

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

const STORAGE_KEY = 'cf-demo-role'

// Assumption: demo usernames look like demo-lab-tech, demo-district-admin (see docs/02).
function buildDemoUser(role: Role): DemoUser {
  const cfg = getRoleConfig(role)
  return {
    username: `demo-${role.toLowerCase().replace(/_/g, '-')}`,
    displayName: `Demo ${cfg.label}`,
    role,
  }
}

// sessionStorage is only a convenience so a page refresh keeps the demo role.
// It can throw or be empty (private window, blocked storage), so every access is guarded.
function readStoredUser(): DemoUser | null {
  try {
    const stored = window.sessionStorage.getItem(STORAGE_KEY)
    if (!stored) return null
    return buildDemoUser(stored as Role)
  } catch {
    // Unknown stored role (getRoleConfig throws) or storage unavailable.
    return null
  }
}

function writeStoredRole(role: Role | null) {
  try {
    if (role) window.sessionStorage.setItem(STORAGE_KEY, role)
    else window.sessionStorage.removeItem(STORAGE_KEY)
  } catch {
    // Ignore: the app works without storage.
  }
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<DemoUser | null>(readStoredUser)

  const login = useCallback((role: Role) => {
    setUser(buildDemoUser(role))
    writeStoredRole(role)
  }, [])

  const logout = useCallback(() => {
    setUser(null)
    writeStoredRole(null)
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

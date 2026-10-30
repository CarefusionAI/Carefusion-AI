import type { Role } from '@carefusion/shared'

export interface JwtPayload {
  sub: string
  preferred_username: string
  email?: string
  given_name?: string
  family_name?: string
  realm_access?: { roles: string[] }
  resource_access?: Record<string, { roles: string[] }>
}

export interface AuthenticatedUser {
  id: string
  username: string
  email?: string
  firstName?: string
  lastName?: string
  role: Role
  isDemo: boolean
  personId?: string // identity.person.id
  userId?: string // identity.app_user.id
}

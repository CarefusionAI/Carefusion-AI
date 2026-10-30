import type { Role } from '@carefusion/shared'
import type { DatabaseService } from '../database/database.service'

export interface DemoIdentity {
  personId: string
  userId: string
}

const ACCOUNT_TYPE_BY_ROLE: Record<string, string> = {
  CITIZEN: 'citizen',
  DOCTOR: 'doctor',
  NURSE: 'staff',
  LAB_TECH: 'staff',
  RADIOLOGY_TECH: 'staff',
  PHARMACIST: 'pharmacist',
  PHARMACY_ADMIN: 'pharmacy_admin',
  HOSPITAL_ADMIN: 'hospital_admin',
  DISTRICT_ADMIN: 'district_admin',
  STATE_ADMIN: 'state_admin',
  ZONAL_ADMIN: 'zonal_admin',
  CENTRAL_ADMIN: 'central_admin',
}

const STAFF_ROLE_BY_ROLE: Record<string, string> = {
  NURSE: 'nurse',
  LAB_TECH: 'lab',
  RADIOLOGY_TECH: 'radiology',
}

// One DB lookup per role per process lifetime (only successful lookups are cached).
const cache = new Map<string, DemoIdentity>()

/** Demo mode only: find the first active app_user for a role so demo requests have a real person_id / user_id. */
export async function lookupDemoIdentity(db: DatabaseService, role: Role | string): Promise<DemoIdentity | undefined> {
  const cached = cache.get(role)
  if (cached) return cached

  const accountType = ACCOUNT_TYPE_BY_ROLE[role]
  if (!accountType) return undefined
  const staffRole = STAFF_ROLE_BY_ROLE[role]

  try {
    const rows = await db.query<{ user_id: string; person_id: string }>(
      `SELECT au.id AS user_id, au.person_id, p.full_name
         FROM identity.app_user au
         JOIN identity.person p ON p.id = au.person_id
        WHERE au.account_type = $1::identity.account_type
          AND au.status = 'active'
          AND ($2::text IS NULL OR EXISTS (
                SELECT 1 FROM identity.staff_profile sp
                 WHERE sp.user_id = au.id AND sp.staff_role = $2::identity.staff_role))
        ORDER BY au.created_at
        LIMIT 1`,
      [accountType, staffRole ?? null],
    )
    const row = rows[0]
    if (!row) return undefined
    const identity: DemoIdentity = { personId: row.person_id, userId: row.user_id }
    cache.set(role, identity)
    return identity
  } catch {
    // Database not ready yet — demo auth still works without ids.
    return undefined
  }
}

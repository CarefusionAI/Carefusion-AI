import { Role } from '@carefusion/shared'
import type { EventRole } from '@carefusion/shared/dist/events.js'

/** Platform role -> event-feed role (same table as the web: EVENT_ROLE_KEY in config/nav.ts). */
export const EVENT_ROLE_BY_ROLE: Record<string, EventRole> = {
  [Role.CITIZEN]: 'citizen',
  [Role.DOCTOR]: 'doctor',
  [Role.NURSE]: 'nurse',
  [Role.LAB_TECH]: 'labtech',
  [Role.RADIOLOGY_TECH]: 'radiology',
  [Role.PHARMACIST]: 'pharmacist',
  [Role.PHARMACY_ADMIN]: 'pharmacyadmin',
  [Role.HOSPITAL_ADMIN]: 'hospitaladmin',
  [Role.DISTRICT_ADMIN]: 'district',
  [Role.STATE_ADMIN]: 'state',
  [Role.ZONAL_ADMIN]: 'zonal',
  [Role.CENTRAL_ADMIN]: 'central',
}

/** Platform role -> identity.account_type (what util.ctx_account_type() returns in the database). */
export const ACCOUNT_TYPE_BY_ROLE: Record<string, string> = {
  [Role.CITIZEN]: 'citizen',
  [Role.DOCTOR]: 'doctor',
  [Role.NURSE]: 'staff',
  [Role.LAB_TECH]: 'staff',
  [Role.RADIOLOGY_TECH]: 'staff',
  [Role.PHARMACIST]: 'pharmacist',
  [Role.PHARMACY_ADMIN]: 'pharmacy_admin',
  [Role.HOSPITAL_ADMIN]: 'hospital_admin',
  [Role.DISTRICT_ADMIN]: 'district_admin',
  [Role.STATE_ADMIN]: 'state_admin',
  [Role.ZONAL_ADMIN]: 'zonal_admin',
  [Role.CENTRAL_ADMIN]: 'central_admin',
}

export function eventRoleOf(role: string): EventRole | undefined {
  return EVENT_ROLE_BY_ROLE[role]
}

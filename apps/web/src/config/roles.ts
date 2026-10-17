// Role metadata for routing, navigation and the demo role switcher.
// Type-only import: the web app has no runtime alias to packages/shared yet.
import type { Role } from '@carefusion/shared'

export type RoleGroup = 'Citizens' | 'Medical Staff' | 'Pharmacy' | 'Administrators'

export interface RoleConfig {
  role: Role
  path: string
  label: string
  title: string
  badge: string
  group: RoleGroup
  comingSoon: string
}

export const ROLE_GROUPS: RoleGroup[] = ['Citizens', 'Medical Staff', 'Pharmacy', 'Administrators']

export const ROLES: RoleConfig[] = [
  { role: 'CITIZEN', path: '/citizen', label: 'Citizen', title: 'Citizen Dashboard', badge: 'CIT', group: 'Citizens', comingSoon: 'Coming in W2-W6' },
  { role: 'DOCTOR', path: '/doctor', label: 'Doctor', title: 'Doctor Dashboard', badge: 'DOC', group: 'Medical Staff', comingSoon: 'Coming in W2-W8' },
  { role: 'NURSE', path: '/nurse', label: 'Nurse', title: 'Nurse Dashboard', badge: 'NUR', group: 'Medical Staff', comingSoon: 'Coming in a later week (see docs/13)' },
  { role: 'LAB_TECH', path: '/lab-tech', label: 'Lab Technician', title: 'Lab Technician Dashboard', badge: 'LAB', group: 'Medical Staff', comingSoon: 'Coming in a later week (see docs/13)' },
  { role: 'RADIOLOGY_TECH', path: '/radiology-tech', label: 'Radiology Technician', title: 'Radiology Technician Dashboard', badge: 'RAD', group: 'Medical Staff', comingSoon: 'Coming in a later week (see docs/13)' },
  { role: 'PHARMACIST', path: '/pharmacist', label: 'Pharmacist', title: 'Pharmacist Dashboard', badge: 'PHA', group: 'Pharmacy', comingSoon: 'Coming in a later week (see docs/13)' },
  { role: 'PHARMACY_ADMIN', path: '/pharmacy-admin', label: 'Pharmacy Admin', title: 'Pharmacy Admin Dashboard', badge: 'PAD', group: 'Pharmacy', comingSoon: 'Coming in a later week (see docs/13)' },
  { role: 'HOSPITAL_ADMIN', path: '/hospital-admin', label: 'Hospital Admin', title: 'Hospital Admin Dashboard', badge: 'HAD', group: 'Administrators', comingSoon: 'Coming in a later week (see docs/13)' },
  { role: 'DISTRICT_ADMIN', path: '/district-admin', label: 'District Admin', title: 'District Admin Dashboard', badge: 'DAD', group: 'Administrators', comingSoon: 'Coming in a later week (see docs/13)' },
  { role: 'STATE_ADMIN', path: '/state-admin', label: 'State Admin', title: 'State Admin Dashboard', badge: 'SAD', group: 'Administrators', comingSoon: 'Coming in a later week (see docs/13)' },
  { role: 'ZONAL_ADMIN', path: '/zonal-admin', label: 'Zonal Admin', title: 'Zonal Admin Dashboard', badge: 'ZAD', group: 'Administrators', comingSoon: 'Coming in a later week (see docs/13)' },
  { role: 'CENTRAL_ADMIN', path: '/central-admin', label: 'Central Admin', title: 'Central Admin Dashboard', badge: 'CAD', group: 'Administrators', comingSoon: 'Coming in a later week (see docs/13)' },
]

export function getRoleConfig(role: Role): RoleConfig {
  const found = ROLES.find((r) => r.role === role)
  if (!found) throw new Error(`Unknown role: ${role}`)
  return found
}

/** Banner shown on every screen (CLAUDE.md rule 1). */
export const DEMO_BANNER_TEXT = 'SYNTHETIC DEMO DATA — NOT FOR CLINICAL USE'

/** All platform roles. Admin chain: Central -> Zonal -> State -> District -> Hospital/Pharmacy. */
export const Role = {
  CITIZEN: 'CITIZEN',
  DOCTOR: 'DOCTOR',
  NURSE: 'NURSE',
  LAB_TECH: 'LAB_TECH',
  RADIOLOGY_TECH: 'RADIOLOGY_TECH',
  PHARMACIST: 'PHARMACIST',
  PHARMACY_ADMIN: 'PHARMACY_ADMIN',
  HOSPITAL_ADMIN: 'HOSPITAL_ADMIN',
  DISTRICT_ADMIN: 'DISTRICT_ADMIN',
  STATE_ADMIN: 'STATE_ADMIN',
  ZONAL_ADMIN: 'ZONAL_ADMIN',
  CENTRAL_ADMIN: 'CENTRAL_ADMIN',
} as const

export type Role = (typeof Role)[keyof typeof Role]

/**
 * Confidence label on every AI output (decision support only, never autonomous diagnosis).
 * Values must match the Python side (apps/ai). In the alpha all AI output is simulated.
 */
export const AIConfidence = {
  VERIFIED: 'VERIFIED',
  SUPPORTED_WITH_CAUTION: 'SUPPORTED_WITH_CAUTION',
  UNCERTAIN: 'UNCERTAIN',
} as const

export type AIConfidence = (typeof AIConfidence)[keyof typeof AIConfidence]

export * from './registration.js'

export * from './citizen.js'

export * from './events.js'

export * from './citizen-app.js'

export * from './doctor.js'

export * from './staff.js'

export * from './hospital-admin.js'

export * from './pharmacy-admin.js'

export * from './gov-admin.js'

export * from './citizen-extras.js'

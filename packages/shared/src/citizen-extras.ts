import { z } from 'zod'

// Shared request schemas (Zod) and response types for the citizen screens Medicines, Blood donation
// and Organ donation. Routes: /api/v1/citizen/{medicines,blood,organ} (see apps/api/src/citizen-medicines,
// citizen-blood, citizen-organ). All data is synthetic. Medicine stock shown to citizens is the published
// stock only, as a level (in / low / out), never an exact count.

const uuid = z.string().uuid()

const boolish = z
  .union([z.boolean(), z.enum(['true', 'false'])])
  .transform((v) => v === true || v === 'true')

// =====================================================================
// Medicines
// =====================================================================
export type CitizenDoseSlotKey = 'morning' | 'afternoon' | 'evening' | 'night'

export const CitizenDoseToggleRequestSchema = z.object({
  /** true = I took it, false = undo. */
  taken: z.boolean(),
})
export type CitizenDoseToggleRequest = z.infer<typeof CitizenDoseToggleRequestSchema>

export const CitizenFinderQuerySchema = z.object({
  q: z.string().trim().min(1).max(100),
  /** Omit for the whole district. */
  radiusKm: z.coerce.number().int().min(1).max(500).optional(),
  govtOnly: boolish.optional(),
  openNow: boolish.optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
})
export type CitizenFinderQuery = z.infer<typeof CitizenFinderQuerySchema>

export interface CitizenDoseDto {
  id: string
  prescriptionItemId: string
  medicine: string
  /** "500 mg · after food" */
  how: string
  scheduledFor: string
  /** HH:MM in India time. */
  time: string
  slot: CitizenDoseSlotKey
  status: 'taken' | 'skipped' | 'pending'
  takenAt: string | null
  /** False for doses scheduled on a later day. */
  canToggle: boolean
}

export interface CitizenDoseSlotDto {
  key: CitizenDoseSlotKey
  label: string
  /** Earliest dose time in the slot (HH:MM). */
  time: string
  doses: CitizenDoseDto[]
}

export interface CitizenMedicinesTodayResponse {
  /** YYYY-MM-DD (India time) used as "today". */
  date: string
  takenCount: number
  totalCount: number
  nextDose: { medicine: string; time: string } | null
  slots: CitizenDoseSlotDto[]
}

export interface CitizenMedicinesSummaryResponse {
  activePrescriptions: number
  doctors: number
  nextRefill: { medicine: string; date: string; daysLeft: number } | null
  adherence: {
    /** null when nothing was due yet. */
    percent: number | null
    due: number
    taken: number
    windowDays: number
    /** Percentage-point change against the 30 days before; null when there is not enough history. */
    trendPoints: number | null
  }
  readyToCollect: {
    rxNumber: string
    pharmacyName: string
    pharmacyId: string
    pharmacistName: string | null
    medicines: string
    readyAt: string
  } | null
}

export interface CitizenPrescriptionItemDto {
  id: string
  /** "Metformin 500 mg tablet" */
  medicine: string
  dose: string
  /** "1-0-1 (twice daily)" */
  frequency: string
  withFood: string | null
  instructions: string | null
  durationDays: number
  /** Doses left from the quantity prescribed (never negative); null when it cannot be worked out. */
  unitsLeft: number | null
  /** Last day of the course, YYYY-MM-DD. */
  endsOn: string
  ended: boolean
  endingSoon: boolean
}

export interface CitizenJourneyStepDto {
  key: 'signed' | 'verified' | 'ready' | 'next'
  label: string
  /** ISO time the step happened; null when it has not happened yet. */
  at: string | null
  done: boolean
  /** Short note such as "Dr. Arun Nair" or "24 Oct". */
  detail: string | null
}

export interface CitizenPrescriptionDto {
  id: string
  rxNumber: string
  doctorName: string
  specialisation: string | null
  hospitalName: string
  issuedAt: string
  validUntil: string
  status: string
  fulfilment: 'none' | 'sent' | 'verified' | 'ready' | 'collected'
  fulfilmentLabel: string
  fulfilmentAt: string | null
  pharmacyName: string | null
  items: CitizenPrescriptionItemDto[]
  journey: CitizenJourneyStepDto[]
  allergyNote: string
  interactionNote: string
  /** True when every course in this prescription has finished. */
  courseEnded: boolean
}

export interface CitizenPastPrescriptionDto {
  id: string
  rxNumber: string
  issuedAt: string
  doctorName: string
  medicines: string
  status: 'Completed' | 'Replaced' | 'Expired' | 'Cancelled'
}

export interface CitizenPrescriptionsResponse {
  active: CitizenPrescriptionDto[]
  past: CitizenPastPrescriptionDto[]
}

export interface CitizenRefillDto {
  prescriptionItemId: string
  medicine: string
  daysLeft: number
  /** YYYY-MM-DD */
  refillBy: string
  /** 0 to 1: share of the course still left (drives the ring). */
  fractionLeft: number
  unitsLeft: number | null
  urgent: boolean
  source: 'doctor' | 'schedule'
}

export interface CitizenPharmacyQueueDto {
  pharmacyId: string
  pharmacyName: string
  pharmacistName: string | null
  counter: string | null
  /** "P-042"; null when you have no token today. */
  tokenLabel: string | null
  tokenState: 'waiting' | 'called' | 'served' | null
  ahead: number
  waitMinutes: number | null
  openNow: boolean
  /** "Open till 20:00" / "Closed" */
  openText: string
  distanceKm: number | null
  rxNumber: string | null
}

export interface CitizenFinderResultDto {
  pharmacyId: string
  pharmacyName: string
  medicineId: string
  /** "Metformin 500 mg tablet" */
  medicineName: string
  ownership: 'govt' | 'private'
  isJanAushadhi: boolean
  distanceKm: number | null
  openNow: boolean
  hoursText: string
  stockLevel: 'in' | 'low' | 'out'
  minPrice: number | null
  lat: number | null
  lon: number | null
}

export interface CitizenFinderResponse {
  query: string
  districtName: string | null
  results: CitizenFinderResultDto[]
  note: string
}

// =====================================================================
// Blood donation
// =====================================================================
export const CitizenBloodAvailabilityRequestSchema = z.object({
  ready: z.boolean(),
})
export type CitizenBloodAvailabilityRequest = z.infer<typeof CitizenBloodAvailabilityRequestSchema>

export const CitizenBloodRespondRequestSchema = z.object({
  response: z.enum(['will_donate', 'cannot']),
  /** Only with "cannot": ask the app to tell your circle. */
  notifyCircle: z.boolean().optional(),
})
export type CitizenBloodRespondRequest = z.infer<typeof CitizenBloodRespondRequestSchema>

export const CitizenBloodChecklistRequestSchema = z.object({
  weightKg: z.number().min(20).max(250),
  hasDiabetes: z.boolean().default(false),
  recentIllness: z.boolean().default(false),
  onMedication: z.boolean().default(false),
  mealAndWater: z.boolean().default(true),
  abhaReady: z.boolean().default(true),
})
export type CitizenBloodChecklistRequest = z.infer<typeof CitizenBloodChecklistRequestSchema>

export interface CitizenBloodDonorDto {
  registered: boolean
  donorCode: string | null
  bloodGroup: string
  /** The "available for requests" switch as stored. */
  ready: boolean
  /** YYYY-MM-DD; null when the donor can give now. */
  eligibleFrom: string | null
  /** ISO time the rest period ends (last donation plus the gap); null when not resting. Drives the countdown. */
  eligibleAt: string | null
  lastDonationAt: string | null
  /** True while the rest period is running. */
  resting: boolean
  restDaysTotal: number
  restDaysDone: number
  /** Whole days left; 0 when not resting. */
  daysUntilEligible: number
  tier: 'new' | 'bronze' | 'silver' | 'gold'
  nextTier: 'bronze' | 'silver' | 'gold' | null
  donationsToNextTier: number | null
  donations: number
  livesHelped: number
  litres: number
  sinceYear: number | null
  lastHb: number | null
  minHb: number
  notifyCircle: boolean
  /** Why the switch cannot be turned on, or null. */
  switchNote: string | null
}

export interface CitizenBloodRequestDto {
  id: string
  hospitalId: string
  hospitalName: string
  bloodGroup: string
  units: number
  urgency: 'normal' | 'urgent' | 'critical'
  createdAt: string
  closesAt: string
  distanceKm: number | null
  /** "surgery today 18:00" style note is not stored; this is a short generated line. */
  meta: string
  myResponse: 'will_donate' | 'cannot' | null
  respondedAt: string | null
  /** False when the donor cannot give (resting or switched off). */
  canDonate: boolean
}

export interface CitizenBloodCampDto {
  id: string
  name: string
  venue: string
  hostName: string | null
  startsAt: string
  endsAt: string
  distanceKm: number | null
  status: string
  pledged: boolean
  /** True when you will be eligible by the camp date. */
  eligibleOnDay: boolean
  targetUnits: number | null
}

export interface CitizenBloodRequestsResponse {
  radiusKm: number
  /** Blood groups this donor can give to. */
  compatibleGroups: string[]
  requests: CitizenBloodRequestDto[]
  camps: CitizenBloodCampDto[]
}

export interface CitizenBloodStockGroupDto {
  group: string
  units: number
  daysCover: number | null
  level: 'critical' | 'low' | 'good'
  mine: boolean
}

export interface CitizenBloodBanksResponse {
  districtName: string | null
  bankCount: number
  asOf: string | null
  groups: CitizenBloodStockGroupDto[]
  /** Groups that are critical or low. */
  shortGroups: string[]
  banks: { id: string; name: string; kind: string; phone: string | null; address: string | null }[]
}

export interface CitizenBloodDonationDto {
  id: string
  donatedAt: string
  type: string
  place: string
  isCamp: boolean
  hb: number | null
  volumeMl: number | null
}

export interface CitizenBloodHistoryResponse {
  donations: CitizenBloodDonationDto[]
  count: number
  litres: number
  livesHelped: number
  tier: CitizenBloodDonorDto['tier']
  nextTier: CitizenBloodDonorDto['nextTier']
  donationsToNextTier: number | null
  sinceYear: number | null
}

export interface CitizenBloodChecklistResponse {
  age: number | null
  minAge: number
  maxAge: number
  weightKg: number | null
  minWeightKg: number
  hasDiabetes: boolean | null
  onMedication: boolean | null
  recentIllness: boolean | null
  /** "Allowed on tablets" style note for the diabetes row. */
  diabetesNote: string
  illnessNote: string
  eligible: boolean | null
  reasons: string[]
  answeredAt: string | null
  tips: { mealAndWater: boolean; abhaReady: boolean }
}

// =====================================================================
// Organ donation
// =====================================================================
export const CitizenOrganSelectionRequestSchema = z.object({
  organs: z.array(z.string().trim().min(1).max(40)).min(1).max(12),
})
export type CitizenOrganSelectionRequest = z.infer<typeof CitizenOrganSelectionRequestSchema>

export const CitizenNextOfKinRequestSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  relation: z.string().trim().min(2).max(40),
  channel: z.enum(['sms', 'app', 'email', 'in_person']).default('sms'),
  /** Set when the person is already a registered citizen (for example from your emergency contacts). */
  personId: uuid.optional(),
})
export type CitizenNextOfKinRequest = z.infer<typeof CitizenNextOfKinRequestSchema>

export const CitizenWitnessInviteRequestSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  relation: z.string().trim().min(2).max(40),
  isRelative: z.boolean(),
  personId: uuid.optional(),
})
export type CitizenWitnessInviteRequest = z.infer<typeof CitizenWitnessInviteRequestSchema>

export const CitizenSigningDeskRequestSchema = z.object({
  hospitalId: uuid,
})
export type CitizenSigningDeskRequest = z.infer<typeof CitizenSigningDeskRequestSchema>

export type CitizenPledgeStatus = 'none' | 'intent' | 'family_informed' | 'signing' | 'registered' | 'withdrawn'

export interface CitizenOrganTypeDto {
  code: string
  name: string
  kind: 'organ' | 'tissue'
  /** Short helper line under the name. */
  note: string
}

export interface CitizenWitnessDto {
  id: string
  fullName: string
  relation: string
  isRelative: boolean
  status: 'signed' | 'pending' | 'expired'
  signedAt: string | null
  linkExpiresAt: string | null
}

export interface CitizenNextOfKinDto {
  id: string
  fullName: string
  relation: string
  channel: string
  notifiedAt: string | null
  acknowledgedAt: string | null
  status: 'acknowledged' | 'informed' | 'not_sent'
}

export interface CitizenOrganOverviewResponse {
  pledge: {
    id: string
    status: CitizenPledgeStatus
    /** 0-based index of the current step in the four-step stepper (4 = all done). */
    currentStep: number
    stepLabel: string
    organs: string[]
    pledgedAt: string
    familyInformedAt: string | null
    hospital: { id: string; name: string } | null
    knosStatus: string
    knosRef: string | null
    verificationStatus: string
  } | null
  steps: string[]
  organTypes: CitizenOrganTypeDto[]
  witnesses: CitizenWitnessDto[]
  nextOfKin: CitizenNextOfKinDto[]
  signedWitnesses: number
  hasRelativeWitness: boolean
  card: {
    name: string
    abhaNumber: string | null
    bloodGroup: string
    pledged: string[]
    callFamily: string | null
  }
  signingDesk: { hospitalId: string; hospitalName: string; hours: string; where: string } | null
  hospitals: { id: string; name: string }[]
  stateName: string
  statePledges: number
  statePledgesIsDemoFigure: true
  /** Replaces the pledge: false once registered (organs can no longer be changed). */
  canEditOrgans: boolean
}

export interface CitizenWitnessInviteResponse {
  witness: CitizenWitnessDto
  /** Signing link shown once in the demo (only the hash is stored). */
  signingLink: string
  simulated: true
}

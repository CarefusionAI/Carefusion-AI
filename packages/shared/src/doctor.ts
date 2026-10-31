import { z } from 'zod'

// =====================================================================
// Doctor app (Phase 3b). Request schemas (validated by the API) and response shapes (used by the web app).
// NOT yet exported from index.ts: import with `@carefusion/shared/dist/doctor.js` until the coordinator adds
//   export * from './doctor.js'
// Everything an AI produces here is SIMULATED (alpha rule 3) and carries `simulated: true`.
// =====================================================================

// ---------- Common enums ----------
export const AiStatusSchema = z.enum(['VERIFIED', 'SUPPORTED_WITH_CAUTION', 'UNCERTAIN'])
export type AiStatus = z.infer<typeof AiStatusSchema>

export const AiModuleSchema = z.enum(['Summary', 'Chat', 'Image analysis', 'Genomic', 'Temporal'])
export type AiModule = z.infer<typeof AiModuleSchema>

export const AiReviewStateSchema = z.enum(['pending', 'accepted', 'edited', 'rejected'])
export type AiReviewState = z.infer<typeof AiReviewStateSchema>

export const OrderPrioritySchema = z.enum(['routine', 'urgent', 'stat'])
export type OrderPriority = z.infer<typeof OrderPrioritySchema>

// ---------- Opening a patient ----------
export const OpenSessionRequestSchema = z.object({
  /** The citizen's rotating 6-digit key (spaces allowed), or the scanned QR payload `cfkey:v1:<handle>:<code>`. */
  key: z.string().trim().min(6).max(80),
  /** Needed with a typed 6-digit key: the patient's ABHA number, so the key is checked against that one patient. Not needed for the QR text. */
  patientAbha: z.string().trim().min(4).max(40).optional(),
  /** Optional: the OP visit this session belongs to (otherwise today's matching visit is linked). */
  visitId: z.string().uuid().optional(),
  /** Optional device location, used for the geofence check. */
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  /** Needed when the doctor is outside the hospital geofence. */
  reason: z.string().trim().min(10).max(500).optional(),
})
export type OpenSessionRequest = z.infer<typeof OpenSessionRequestSchema>

export const BreakGlassRequestSchema = z.object({
  patientPersonId: z.string().uuid(),
  reasonCategory: z.enum(['unconscious', 'accident', 'key_unavailable', 'family_unreachable', 'transfer', 'other']),
  /** At least 20 characters (database rule CF162). */
  reason: z.string().trim().min(20).max(1000),
  /** A different doctor who confirms the emergency (database rule CF161). */
  secondDoctorUserId: z.string().uuid(),
  matchMethod: z.enum(['face', 'fingerprint', 'face_and_fingerprint', 'aadhaar_biometric', 'manual']).optional(),
  evidenceNote: z.string().trim().max(1000).optional(),
})
export type BreakGlassRequest = z.infer<typeof BreakGlassRequestSchema>

// ---------- OP queue ----------
export const QueueStatusUpdateSchema = z.object({
  status: z.enum(['waiting', 'no_show', 'done']),
})
export type QueueStatusUpdate = z.infer<typeof QueueStatusUpdateSchema>

// ---------- AI ----------
export const AiChatRequestSchema = z.object({
  message: z.string().trim().min(1).max(2000),
  chatSessionId: z.string().uuid().optional(),
})
export type AiChatRequest = z.infer<typeof AiChatRequestSchema>

export const AiImageRequestSchema = z.object({
  /** A scan document or imaging study of this patient. If omitted the latest imaging document is used. */
  documentId: z.string().uuid().optional(),
})
export type AiImageRequest = z.infer<typeof AiImageRequestSchema>

export const AiReviewRequestSchema = z
  .object({
    decision: z.enum(['accept', 'edit', 'reject']),
    /** Reason / note; required for edit and reject. */
    note: z.string().trim().max(1000).optional(),
    /** The doctor's edited text (required when decision = edit). */
    editedText: z.string().trim().max(4000).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.decision === 'edit' && !v.editedText) ctx.addIssue({ code: 'custom', path: ['editedText'], message: 'editedText is required to edit' })
    if (v.decision !== 'accept' && !v.note && !v.editedText) ctx.addIssue({ code: 'custom', path: ['note'], message: 'A note is required' })
  })
export type AiReviewRequest = z.infer<typeof AiReviewRequestSchema>

// ---------- Prescriptions ----------
export const PrescriptionLineSchema = z.object({
  medicineId: z.string().uuid(),
  dose: z.string().trim().min(1).max(200),
  frequency: z.string().trim().min(1).max(100),
  durationDays: z.number().int().min(1).max(365),
  quantity: z.number().positive().max(10000),
  instructions: z.string().trim().max(300).optional(),
  withFood: z.enum(['before', 'with', 'after', 'any']).optional(),
})
export type PrescriptionLine = z.infer<typeof PrescriptionLineSchema>

export const PrescriptionCheckRequestSchema = z.object({
  lines: z.array(PrescriptionLineSchema).min(1).max(20),
})
export type PrescriptionCheckRequest = z.infer<typeof PrescriptionCheckRequestSchema>

export const PrescriptionDraftRequestSchema = z.object({
  draftId: z.string().uuid().optional(),
  lines: z.array(PrescriptionLineSchema).max(20),
  advice: z.string().trim().max(1000).optional(),
})
export type PrescriptionDraftRequest = z.infer<typeof PrescriptionDraftRequestSchema>

export const PrescriptionSignRequestSchema = z.object({
  draftId: z.string().uuid().optional(),
  lines: z.array(PrescriptionLineSchema).min(1).max(20).optional(),
  advice: z.string().trim().max(1000).optional(),
  /** Needed when an allergy or a major interaction is flagged. */
  overrideReason: z.string().trim().min(10).max(500).optional(),
  /** Send straight to the hospital's own pharmacy (the patient agreed by opening the session). Default true. */
  sendToHospitalPharmacy: z.boolean().optional(),
})
export type PrescriptionSignRequest = z.infer<typeof PrescriptionSignRequestSchema>

// ---------- Orders ----------
export const CreateOrderRequestSchema = z.object({
  kind: z.enum(['lab', 'imaging']),
  /** Lab: test codes or names (HbA1c, Lipid profile). Imaging: study names (Chest X-ray PA). */
  tests: z.array(z.string().trim().min(1).max(120)).min(1).max(12),
  priority: OrderPrioritySchema.default('routine'),
  note: z.string().trim().max(500).optional(),
})
export type CreateOrderRequest = z.infer<typeof CreateOrderRequestSchema>

export const AckResultRequestSchema = z.object({
  comment: z.string().trim().max(500).optional(),
})
export type AckResultRequest = z.infer<typeof AckResultRequestSchema>

// ---------- Referral and handover ----------
export const CreateReferralRequestSchema = z.object({
  toHospitalId: z.string().uuid(),
  toUserId: z.string().uuid().optional(),
  specialty: z.string().trim().min(2).max(100),
  urgency: z.enum(['routine', 'soon', 'urgent']).default('routine'),
  reason: z.string().trim().min(5).max(1500),
})
export type CreateReferralRequest = z.infer<typeof CreateReferralRequestSchema>

export const HandoverItemSchema = z.object({
  patientPersonId: z.string().uuid().optional(),
  flag: z.enum(['watch', 'pending', 'transfer', 'info']).default('info'),
  note: z.string().trim().min(1).max(500),
  fromAiDraft: z.boolean().optional(),
})
export type HandoverItem = z.infer<typeof HandoverItemSchema>

export const CreateHandoverRequestSchema = z.object({
  toUserId: z.string().uuid().optional(),
  summary: z.string().trim().max(2000).optional(),
  items: z.array(HandoverItemSchema).min(1).max(30),
})
export type CreateHandoverRequest = z.infer<typeof CreateHandoverRequestSchema>

// ---------- Messages ----------
export const ReplyMessageRequestSchema = z.object({
  text: z.string().trim().min(1).max(2000),
})
export type ReplyMessageRequest = z.infer<typeof ReplyMessageRequestSchema>

// ---------- Donors ----------
export const BloodGroupFilterSchema = z.enum(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'])
export type BloodGroupFilter = z.infer<typeof BloodGroupFilterSchema>

export const CreateBloodRequestSchema = z.object({
  bloodGroup: BloodGroupFilterSchema,
  units: z.number().int().min(1).max(20),
  urgency: z.enum(['normal', 'urgent', 'critical']).default('normal'),
  reason: z.string().trim().max(300).optional(),
  patientPersonId: z.string().uuid().optional(),
  closesInHours: z.number().int().min(1).max(168).default(24),
})
export type CreateBloodRequest = z.infer<typeof CreateBloodRequestSchema>

// ---------- Profile and settings ----------
export const UpdateDoctorProfileSchema = z.object({
  bio: z.string().trim().max(1000).optional(),
  languages: z.array(z.string().trim().min(1).max(40)).max(10).optional(),
  acceptsWalkin: z.boolean().optional(),
  offersTeleconsult: z.boolean().optional(),
})
export type UpdateDoctorProfile = z.infer<typeof UpdateDoctorProfileSchema>

export const ReplyReviewRequestSchema = z.object({
  body: z.string().trim().min(1).max(1000),
})
export type ReplyReviewRequest = z.infer<typeof ReplyReviewRequestSchema>

export const UpdateDoctorSettingsSchema = z.object({
  textSize: z.enum(['small', 'default', 'large', 'xlarge']).optional(),
  highContrast: z.boolean().optional(),
  reduceMotion: z.boolean().optional(),
  quietHours: z.object({ enabled: z.boolean(), from: z.string().regex(/^\d\d:\d\d$/), to: z.string().regex(/^\d\d:\d\d$/) }).optional(),
  notifications: z
    .array(
      z.object({
        category: z.enum(['health_dept', 'my_care', 'record_opened', 'blood_requests', 'appointment_reminders', 'medicine_reminders', 'monthly_summary', 'emergency']),
        channel: z.enum(['app', 'sms', 'email', 'whatsapp']),
        enabled: z.boolean(),
      }),
    )
    .max(40)
    .optional(),
})
export type UpdateDoctorSettings = z.infer<typeof UpdateDoctorSettingsSchema>

// =====================================================================
// RESPONSE SHAPES
// =====================================================================

export interface DoctorPatientHeader {
  personId: string
  name: string
  age: number | null
  sex: string
  bloodGroup: string
  abhaNumber: string | null
  district: string | null
  isUnidentified: boolean
  tempLabel: string | null
}

export interface DoctorSessionInfo {
  sessionId: string
  mode: 'key' | 'card_otp' | 'admission' | 'emergency_contact' | 'emergency_aadhaar_fallback' | 'break_glass'
  patient: DoctorPatientHeader
  startedAt: string
  expiresAt: string
  secondsLeft: number
  live: boolean
  endedAt: string | null
  endedBy: string | null
  /** Break-glass sessions are read-only. */
  readOnly: boolean
  isFamilyMember: boolean
  insideGeofence: boolean | null
  visitId: string | null
  /** Patient switches that hide a category from doctors (lab, rx, vitals, imaging, genomic, mental_health). */
  hiddenByPatient: string[]
}

/** The AI output shape shown in every AI card. Alpha: always simulated. */
export interface AIInsight {
  /** ai.ai_run id (null for on-the-fly summaries that are not stored). */
  runId: string | null
  tool: 'summary' | 'symptom_chat' | 'image' | 'genomic' | 'temporal'
  module: string
  status: AiStatus
  confidence: number
  headline: string
  text: string
  /** Short evidence lines shown under the card. */
  evidence: string[]
  hypotheses: { rank: number; label: string; confidence: number; evidenceStatus: AiStatus }[]
  sources: { type: string; ref: string; store: string; relevance: number }[]
  /** Disagreement reporting (paper Algorithm 1), simulated. */
  disagreement: { agree: boolean; agreement: number; models: { name: string; top: string; confidence: number }[]; note: string } | null
  review: {
    state: AiReviewState
    verdict: 'agree' | 'disagree' | 'edited' | null
    reason: string | null
    editedText: string | null
    reviewedAt: string | null
    reviewedBy: string | null
    /** The citizen sees this result only after a doctor has reviewed it (and not when rejected). */
    visibleToPatient: boolean
  }
  simulated: true
  label: 'Simulated AI output. Guidance only.'
  createdAt: string
}

export interface AiChatMessage {
  seq: number
  role: 'user' | 'assistant'
  text: string
  redFlag: boolean
  sources: { label: string; simulated: boolean }[]
  createdAt: string
}

export interface AiChatReply {
  chatSessionId: string
  messages: AiChatMessage[]
  insight: AIInsight
}

export interface PrescriptionCheckResult {
  lines: {
    medicineId: string
    name: string
    allergy: { blocked: boolean; message: string } | null
    interactions: { with: string; severity: string; note: string | null }[]
    stock: { pharmacy: string; level: 'in' | 'low' | 'out' | 'unknown'; quantity: number | null }
    schedule: string
  }[]
  summary: { allergyBlocked: boolean; hasMajorInteraction: boolean; needsOverrideReason: boolean; renal: string }
  simulated: true
}

export interface OrderRow {
  id: string
  orderRef: string
  kind: 'lab' | 'imaging' | 'other'
  patientName: string
  tests: string
  priority: OrderPriority
  status: string
  statusLabel: string
  assignedTo: string | null
  orderedAt: string
  critical: boolean
}

export interface QueueRow {
  visitId: string
  token: string
  patientPersonId: string
  patientName: string
  meta: string
  status: 'booked' | 'checked_in' | 'waiting' | 'in_consultation' | 'done' | 'no_show' | 'cancelled'
  statusLabel: string
  tone: string
  priority: 'normal' | 'priority' | 'emergency'
  isWalkIn: boolean
  checkedInAt: string | null
  waitingMinutes: number | null
  sessionId: string | null
  needsKey: boolean
}

export interface PastPatient {
  personId: string
  name: string
  sessions: number
  lastSessionAt: string | null
  lastSessionId: string
  lastMode: string
  lastMinutes: number
  lastEndedBy: string | null
  live: boolean
  myAdditions: { documents: number; prescriptions: number; orders: number; aiRuns: number }
}

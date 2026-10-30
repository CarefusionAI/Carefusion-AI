import { z } from 'zod'

// Shared request schemas (Zod) and response types for the citizen app screens:
// dates, vitals, AI chat, messages, care, alerts, settings, reviews, complaints, access.
// Routes live under /api/v1/citizen/<area> (see apps/api/src/citizen-app). All data is synthetic.
// Every AI output is SIMULATED in the alpha and carries isSimulated=true plus a label.

export const SIMULATED_AI_LABEL = 'Simulated AI output'

const uuid = z.string().uuid()
const isoDateTime = z.string().datetime({ offset: true })

// =====================================================================
// Dates (calendar + reminders)
// =====================================================================
export const DateKindSchema = z.enum(['appt', 'med', 'test', 'vac', 'give', 'visit', 'personal', 'other'])
export type DateKind = z.infer<typeof DateKindSchema>

export const ReminderRepeatSchema = z.enum(['none', 'daily', 'weekly', 'monthly', 'yearly'])
export type ReminderRepeat = z.infer<typeof ReminderRepeatSchema>

export const CreateReminderRequestSchema = z.object({
  title: z.string().trim().min(1).max(200),
  startsAt: isoDateTime,
  repeat: ReminderRepeatSchema.default('none'),
  /** Minutes before startsAt (for example 60 = 1 hour, 1440 = 1 day). */
  remindBeforeMinutes: z.number().int().min(0).max(60 * 24 * 14).optional(),
  notes: z.string().max(1000).optional(),
})
export type CreateReminderRequest = z.infer<typeof CreateReminderRequestSchema>

export const UpdateReminderRequestSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    startsAt: isoDateTime.optional(),
    repeat: ReminderRepeatSchema.optional(),
    remindBeforeMinutes: z.number().int().min(0).max(60 * 24 * 14).nullable().optional(),
    notes: z.string().max(1000).nullable().optional(),
    snoozedUntil: isoDateTime.nullable().optional(),
    status: z.enum(['scheduled', 'done', 'cancelled']).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Nothing to update' })
export type UpdateReminderRequest = z.infer<typeof UpdateReminderRequestSchema>

export interface DatedEventDto {
  id: string
  type: string // records.dated_event_type
  kind: DateKind
  title: string
  startsAt: string
  endsAt: string | null
  status: string // scheduled | done | missed | cancelled
  notes: string | null
  repeatRule: string
  remindBeforeMinutes: number | null
  snoozedUntil: string | null
  isPersonal: boolean
  sourceTable: string | null
  sourceId: string | null
}

export interface CalendarResponse {
  month: string // YYYY-MM
  today: string // ISO date used as "today" by the API
  events: DatedEventDto[]
  summary: { appointments: number; tests: number; refills: number; vaccines: number; personal: number; other: number }
}

export interface UpcomingResponse {
  today: string
  events: (DatedEventDto & { inDays: number })[]
}

export interface CalendarFeedStatus {
  active: boolean
  createdAt: string | null
  /** Only returned right after creating (the token is never stored in clear). */
  url?: string
}

// =====================================================================
// Vitals
// =====================================================================
export const VitalKindSchema = z.enum(['bp', 'sugar', 'weight', 'spo2', 'temperature'])
export type VitalKind = z.infer<typeof VitalKindSchema>

const readingBase = {
  /** When it was measured (defaults to now). */
  measuredAt: isoDateTime.optional(),
  note: z.string().max(300).optional(),
}
export const AddVitalReadingRequestSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('bp'),
    systolic: z.number().int().min(50).max(300),
    diastolic: z.number().int().min(30).max(200),
    pulse: z.number().int().min(20).max(250).optional(),
    ...readingBase,
  }),
  z.object({
    kind: z.literal('sugar'),
    value: z.number().min(20).max(800), // mg/dL
    context: z.enum(['fasting', 'before_meal', 'after_meal', 'random']).default('fasting'),
    ...readingBase,
  }),
  z.object({
    kind: z.literal('weight'),
    value: z.number().min(2).max(400), // kg
    ...readingBase,
  }),
  z.object({
    kind: z.literal('spo2'),
    value: z.number().min(50).max(100), // %
    pulse: z.number().int().min(20).max(250).optional(),
    ...readingBase,
  }),
  z.object({
    kind: z.literal('temperature'),
    value: z.number().min(30).max(45), // Celsius
    context: z.enum(['oral', 'ear', 'forehead', 'armpit']).default('oral'),
    ...readingBase,
  }),
])
export type AddVitalReadingRequest = z.infer<typeof AddVitalReadingRequestSchema>

export interface VitalReadingDto {
  /** For a BP pair this is the systolic row id. */
  id: string
  kind: VitalKind
  label: string
  measuredAt: string
  display: string // "118/76 mmHg"
  value: number | null
  systolic: number | null
  diastolic: number | null
  pulse: number | null
  unit: string
  context: string | null
  note: string | null
  source: string // self_reported | staff | doctor | device | import
  status: 'in_range' | 'above_target' | 'high' | 'low' | 'normal'
  flagged: boolean
}

export interface VitalTargetDto {
  code: string
  label: string
  low: number | null
  high: number | null
  goal: number | null
  unit: string
  note: string | null
}

export interface VitalsSummaryResponse {
  latest: Partial<Record<VitalKind, VitalReadingDto>>
  bp30: {
    days: number
    count: number
    inRange: number
    avgSystolic: number | null
    avgDiastolic: number | null
    highest: { systolic: number; diastolic: number; measuredAt: string } | null
    series: { measuredAt: string; systolic: number; diastolic: number }[]
  }
  sugar: { target: VitalTargetDto | null; series: { measuredAt: string; value: number }[] }
  weight: {
    heightCm: number | null
    goalKg: number | null
    bmi: number | null
    bmiBand: 'under' | 'healthy' | 'over' | 'high' | null
    series: { measuredAt: string; value: number }[]
  }
  hba1c: { value: number | null; unit: string; measuredAt: string | null; targetMax: number | null }
  targets: VitalTargetDto[]
  devices: { name: string; status: string; hint: string }[]
}

export interface AddVitalReadingResponse {
  readings: VitalReadingDto[]
  flagged: boolean
  /** True when the care team was told (event + clinical alert). */
  doctorNotified: boolean
}

// =====================================================================
// AI chat (simulated)
// =====================================================================
export const StartChatRequestSchema = z.object({
  text: z.string().trim().min(1).max(2000).optional(),
})
export type StartChatRequest = z.infer<typeof StartChatRequestSchema>

export const SendChatMessageRequestSchema = z.object({
  text: z.string().trim().min(1).max(2000),
})
export type SendChatMessageRequest = z.infer<typeof SendChatMessageRequestSchema>

export const ShareChatRequestSchema = z.object({
  doctorUserId: uuid.optional(),
})
export type ShareChatRequest = z.infer<typeof ShareChatRequestSchema>

export interface ChatSourceRef {
  label: string
  simulated: boolean
  document_id?: string
  [k: string]: unknown
}

export interface ChatMessageDto {
  id: string
  seq: number
  role: 'user' | 'assistant' | 'system'
  text: string
  sourceRefs: ChatSourceRef[]
  redFlag: boolean
  redFlagReason: string | null
  createdAt: string
  /** True for assistant messages: this is not a real model output. */
  isSimulated: boolean
}

export interface ChatSessionDto {
  id: string
  title: string | null
  messageCount: number
  startedAt: string
  isSimulated: true
  label: typeof SIMULATED_AI_LABEL
  sharedWithDoctorUserId: string | null
  sharedAt: string | null
}

export interface ChatSessionDetail extends ChatSessionDto {
  messages: ChatMessageDto[]
}

export interface SendChatMessageResponse {
  session: ChatSessionDto
  userMessage: ChatMessageDto
  assistantMessage: ChatMessageDto
  /** Set when a red flag was detected: show the stop banner and the 108 call button. */
  redFlag: boolean
  disclaimer: string
}

export interface ChatContextResponse {
  isSimulated: true
  label: typeof SIMULATED_AI_LABEL
  canSee: { label: string; enabled: boolean }[]
  suggestions: string[]
  disclaimer: string
}

// =====================================================================
// Messages
// =====================================================================
export const SendMessageRequestSchema = z.object({
  text: z.string().trim().min(1).max(4000),
})
export type SendMessageRequest = z.infer<typeof SendMessageRequestSchema>

export const StartThreadRequestSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('doctor_followup'),
    doctorUserId: uuid,
    subject: z.string().trim().max(200).optional(),
    text: z.string().trim().min(1).max(4000),
  }),
  z.object({
    type: z.literal('hospital_desk'),
    hospitalId: uuid,
    subject: z.string().trim().max(200).optional(),
    text: z.string().trim().min(1).max(4000),
  }),
])
export type StartThreadRequest = z.infer<typeof StartThreadRequestSchema>

export interface ThreadSummaryDto {
  id: string
  type: string // doctor_followup | hospital_desk | lab | radiology | health_dept | pharmacist
  subject: string | null
  counterpartName: string | null
  counterpartRole: string | null
  lastMessagePreview: string | null
  lastMessageAt: string | null
  unread: number
  canReply: boolean
  encrypted: true
}

export interface MessageDto {
  id: string
  threadId: string
  senderUserId: string
  senderName: string | null
  senderRole: string | null
  mine: boolean
  text: string
  sentAt: string
  attachments: { id: string; fileName: string; mimeType: string; sizeBytes: number }[]
}

export interface ThreadDetailDto extends ThreadSummaryDto {
  messages: MessageDto[]
}

// =====================================================================
// Care (find doctors, book, cancel)
// =====================================================================
export const ProvidersQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  type: z.enum(['govt', 'private']).optional(),
  telemedicine: z.coerce.boolean().optional(),
  walkIn: z.coerce.boolean().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
})
export type ProvidersQuery = z.infer<typeof ProvidersQuerySchema>

export const BookAppointmentRequestSchema = z.object({
  slotId: uuid,
  reason: z.string().trim().max(200).default('Follow-up visit'),
  visitType: z.enum(['new', 'follow_up', 'review', 'teleconsult']).default('new'),
  shareKeyAtCheckIn: z.boolean().default(true),
})
export type BookAppointmentRequest = z.infer<typeof BookAppointmentRequestSchema>

export const CancelAppointmentRequestSchema = z.object({
  reason: z.string().trim().max(300).optional(),
})
export type CancelAppointmentRequest = z.infer<typeof CancelAppointmentRequestSchema>

export interface ProviderDto {
  doctorUserId: string
  name: string
  specialisation: string | null
  hospitalId: string
  hospitalName: string
  ownership: string // govt | private | ...
  hospitalType: string
  languages: string[]
  feeAmount: number | null
  yearsExperience: number | null
  acceptsWalkIn: boolean
  offersTeleconsult: boolean
  distanceKm: number | null
  nextSlotAt: string | null
}

export interface SlotDto {
  slotId: string
  startsAt: string
  endsAt: string
  slotType: string
  capacity: number
  booked: number
  full: boolean
  /** Token the booking would get (design rule: 8 + 2 * position of the slot in that day). */
  tokenPreview: number
}

export interface AppointmentDto {
  id: string
  bookingRef: string
  status: string // requested | confirmed | rejected | cancelled | completed | no_show
  tokenNo: number | null
  startsAt: string
  endsAt: string
  doctorUserId: string | null
  doctorName: string | null
  hospitalId: string
  hospitalName: string
  reason: string | null
  visitType: string
  feeAmount: number
  cancelledReason: string | null
}

export interface BookAppointmentResponse {
  appointment: AppointmentDto
  message: string
  reminder: string
}

export interface PastVisitDto {
  id: string
  startsAt: string
  title: string
  sub: string | null
  status: string
}

// =====================================================================
// Alerts and notification preferences
// =====================================================================
export const AlertGroupSchema = z.enum(['emergency', 'health_dept', 'my_care', 'system'])
export type AlertGroup = z.infer<typeof AlertGroupSchema>

export const ListAlertsQuerySchema = z.object({
  group: AlertGroupSchema.optional(),
  unreadOnly: z
    .union([z.boolean(), z.enum(['true', 'false'])])
    .transform((v) => v === true || v === 'true')
    .optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
})
export type ListAlertsQuery = z.infer<typeof ListAlertsQuerySchema>

export const MarkAlertsReadRequestSchema = z.object({
  /** Ids from GET /alerts (item.id). Omit to mark everything read. */
  ids: z.array(z.string().min(1)).max(500).optional(),
})
export type MarkAlertsReadRequest = z.infer<typeof MarkAlertsReadRequestSchema>

export const PREF_CATEGORIES = [
  'health_dept',
  'my_care',
  'record_opened',
  'blood_requests',
  'appointment_reminders',
  'medicine_reminders',
  'monthly_summary',
  'emergency',
] as const
export const PrefCategorySchema = z.enum(PREF_CATEGORIES)
export const PrefChannelSchema = z.enum(['app', 'sms', 'email', 'whatsapp'])

export const UpdateNotificationPrefsRequestSchema = z.object({
  prefs: z
    .array(z.object({ category: PrefCategorySchema, channel: PrefChannelSchema, enabled: z.boolean() }))
    .min(1)
    .max(40),
  quietHours: z
    .object({
      enabled: z.boolean(),
      from: z.string().regex(/^\d{2}:\d{2}$/),
      to: z.string().regex(/^\d{2}:\d{2}$/),
    })
    .optional(),
})
export type UpdateNotificationPrefsRequest = z.infer<typeof UpdateNotificationPrefsRequestSchema>

export interface AlertItemDto {
  /** "alert:<uuid>" for health-department alerts, "event:<uuid>" for care events. */
  id: string
  source: 'alert' | 'event'
  group: AlertGroup
  /** Design tab: alerts | updates | reminders */
  tab: 'alerts' | 'updates' | 'reminders'
  severity: 'emergency' | 'normal'
  title: string
  body: string
  issuer: string | null
  at: string
  read: boolean
  href: string | null
}

export interface AlertsResponse {
  items: AlertItemDto[]
  unread: number
  counts: Record<AlertGroup, number>
}

export interface NotificationPrefsResponse {
  prefs: { category: string; channel: string; enabled: boolean; locked: boolean }[]
  quietHours: { enabled: boolean; from: string; to: string }
  emergencyNote: string
}

// =====================================================================
// Settings, devices, export, deletion
// =====================================================================
export const UpdatePreferencesRequestSchema = z
  .object({
    textSize: z.enum(['small', 'default', 'large', 'xlarge']).optional(),
    highContrast: z.boolean().optional(),
    reduceMotion: z.boolean().optional(),
    readAloud: z.boolean().optional(),
    showEnglishTerms: z.boolean().optional(),
    faceCheckNewDevice: z.boolean().optional(),
    quietHours: z
      .object({ enabled: z.boolean(), from: z.string().regex(/^\d{2}:\d{2}$/), to: z.string().regex(/^\d{2}:\d{2}$/) })
      .optional(),
    preferredLanguage: z.enum(['en', 'ml', 'hi']).optional(),
    /** Privacy and delivery switches kept in identity.user_preference.extra. */
    privacy: z
      .object({
        emergencyCardWithoutKey: z.boolean().optional(),
        researchUse: z.boolean().optional(),
        aiReadsDocuments: z.boolean().optional(),
        monthlySummaryEmail: z.boolean().optional(),
        sendBy: z.enum(['App + SMS', 'App only', 'App + SMS + WhatsApp', 'SMS only']).optional(),
        aiLanguage: z.enum(['en', 'ml', 'hi']).optional(),
        appLanguage: z.enum(['en', 'ml', 'hi']).optional(),
      })
      .optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Nothing to update' })
export type UpdatePreferencesRequest = z.infer<typeof UpdatePreferencesRequestSchema>

export const RevokeOtherDevicesRequestSchema = z.object({
  /** The device to keep. Defaults to the most recently seen one. */
  keepDeviceId: uuid.optional(),
})
export type RevokeOtherDevicesRequest = z.infer<typeof RevokeOtherDevicesRequestSchema>

export const ExportRequestSchema = z.object({
  format: z.enum(['zip', 'fhir']).default('zip'),
})
export type ExportRequest = z.infer<typeof ExportRequestSchema>

export const DeleteAccountRequestSchema = z.object({
  /** The user must type DELETE. */
  confirm: z.literal('DELETE'),
  reason: z.string().trim().max(500).optional(),
})
export type DeleteAccountRequest = z.infer<typeof DeleteAccountRequestSchema>

export interface DeviceDto {
  id: string
  name: string | null
  platform: string
  city: string | null
  userAgent: string | null
  lastSeenAt: string | null
  boundAt: string
  revoked: boolean
  current: boolean
}

export interface SettingsResponse {
  language: string
  preferences: {
    textSize: string
    highContrast: boolean
    reduceMotion: boolean
    readAloud: boolean
    showEnglishTerms: boolean
    faceCheckNewDevice: boolean
    quietHours: { enabled: boolean; from: string; to: string }
    privacy: Record<string, unknown>
  }
  devices: DeviceDto[]
  storage: { documents: number; bytes: number }
  lastExport: ExportRequestDto | null
  deletion: DeletionRequestDto | null
}

export interface ExportRequestDto {
  id: string
  format: string
  status: string
  requestedAt: string
  readyAt: string | null
  expiresAt: string | null
  sizeBytes: number | null
  note: string
}

export interface DeletionRequestDto {
  id: string
  requestedAt: string
  graceUntil: string
  cancelledAt: string | null
  completedAt: string | null
  note: string
}

// =====================================================================
// Reviews
// =====================================================================
export const ListReviewsQuerySchema = z.object({
  targetType: z.enum(['hospital', 'doctor', 'pharmacy']).optional(),
  targetId: uuid.optional(),
  stars: z.coerce.number().int().min(1).max(5).optional(),
  minStars: z.coerce.number().int().min(1).max(5).optional(),
  department: z.string().trim().max(100).optional(),
  location: z.string().trim().max(100).optional(),
  sort: z.enum(['recent', 'rating', 'helpful']).default('recent'),
  limit: z.coerce.number().int().min(1).max(100).default(20),
})
export type ListReviewsQuery = z.infer<typeof ListReviewsQuerySchema>

export const CreateReviewRequestSchema = z.object({
  targetType: z.enum(['hospital', 'doctor', 'pharmacy']),
  targetId: uuid,
  stars: z.number().int().min(1).max(5),
  comment: z.string().trim().max(1000).optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(8).default([]),
  /** A finished OP visit makes the review "verified". */
  opVisitId: uuid.optional(),
})
export type CreateReviewRequest = z.infer<typeof CreateReviewRequestSchema>

export const ReportReviewRequestSchema = z.object({
  reason: z.string().trim().min(3).max(500),
})
export type ReportReviewRequest = z.infer<typeof ReportReviewRequestSchema>

export interface ReviewDto {
  id: string
  targetType: string
  targetId: string
  targetName: string | null
  reviewerName: string // "Sreelatha K." (first name + initial only)
  location: string | null
  department: string | null
  stars: number
  comment: string | null
  tags: string[]
  verified: boolean
  createdAt: string
  helpful: number
  markedHelpful: boolean
  mine: boolean
  reply: { by: string | null; text: string; at: string } | null
}

export interface ReviewSummaryDto {
  average: number | null
  count: number
  verified: number
  replied: number
  distribution: Record<'1' | '2' | '3' | '4' | '5', number>
  tags: { tag: string; count: number }[]
}

export interface ReviewListResponse {
  summary: ReviewSummaryDto
  reviews: ReviewDto[]
}

export interface ReviewableVisitDto {
  opVisitId: string
  targetType: 'doctor' | 'hospital'
  targetId: string
  title: string
  sub: string
  visitDate: string
  alreadyReviewed: boolean
}

// =====================================================================
// Complaints
// =====================================================================
export const COMPLAINT_CATEGORIES = [
  'op_services',
  'pharmacy',
  'staff_conduct',
  'lab',
  'cleanliness',
  'billing',
  'app',
  'record_access',
  'other',
] as const
export const ComplaintCategorySchema = z.enum(COMPLAINT_CATEGORIES)

export const CreateComplaintRequestSchema = z
  .object({
    category: ComplaintCategorySchema,
    severity: z.enum(['normal', 'urgent', 'safety']).default('normal'),
    title: z.string().trim().min(3).max(200),
    body: z.string().trim().min(3).max(1000),
    hospitalId: uuid.optional(),
    pharmacyId: uuid.optional(),
    accessSessionId: uuid.optional(),
    visitDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    placeText: z.string().trim().max(200).optional(),
    mayCallMe: z.boolean().default(true),
  })
  .refine((v) => v.hospitalId || v.pharmacyId || v.accessSessionId || v.placeText, {
    message: 'Say where it happened (hospital, pharmacy, access session or place text)',
  })
export type CreateComplaintRequest = z.infer<typeof CreateComplaintRequestSchema>

export const ComplaintNoteRequestSchema = z.object({
  text: z.string().trim().min(1).max(1000),
})
export type ComplaintNoteRequest = z.infer<typeof ComplaintNoteRequestSchema>

export const ReopenComplaintRequestSchema = z.object({
  text: z.string().trim().min(3).max(1000),
})
export type ReopenComplaintRequest = z.infer<typeof ReopenComplaintRequestSchema>

export interface ComplaintTimelineEntryDto {
  id: string
  kind: string // filed | assigned | note | resolved | escalated | reopened | closed | citizen_notified
  actor: string // "You" for the citizen, else a name or role
  text: string | null
  at: string
}

export interface ComplaintDto {
  id: string
  ref: string // CMP-0412
  title: string | null
  body: string
  category: string
  severity: string
  status: string
  /** 0 Filed, 1 Under review, 2 Resolved (design stages). */
  stage: 0 | 1 | 2
  place: string | null
  hospitalId: string | null
  pharmacyId: string | null
  accessSessionId: string | null
  filedAt: string
  dueAt: string | null
  resolvedAt: string | null
  escalationLevel: number
  timeline: ComplaintTimelineEntryDto[]
}

export interface ComplaintOptionsResponse {
  categories: { value: string; label: string }[]
  severities: { value: string; label: string }[]
  places: { type: 'hospital' | 'pharmacy'; id: string; name: string }[]
  helpline: string
  process: string[]
}

// =====================================================================
// Access (rotating key, sessions, history, switches, family)
// =====================================================================
export const AccessHistoryQuerySchema = z.object({
  filter: z.enum(['all', 'doctors', 'staff']).default('all'),
  limit: z.coerce.number().int().min(1).max(200).default(50),
})
export type AccessHistoryQuery = z.infer<typeof AccessHistoryQuerySchema>

export const SHARE_CATEGORY_KEYS = ['lab', 'rx', 'vitals', 'imaging', 'genomic', 'mental_health'] as const
export const ShareCategoryKeySchema = z.enum(SHARE_CATEGORY_KEYS)

export const UpdateAccessCategoryRequestSchema = z.object({
  enabled: z.boolean(),
})
export type UpdateAccessCategoryRequest = z.infer<typeof UpdateAccessCategoryRequestSchema>

export const AddFamilyMemberRequestSchema = z.object({
  /** ABHA number or ABHA address of the adult you want to trust (demo values like DEMO-0000-1234). */
  abhaId: z.string().trim().min(3).max(100),
  relation: z.string().trim().min(2).max(40),
  canShowKey: z.boolean().default(false),
})
export type AddFamilyMemberRequest = z.infer<typeof AddFamilyMemberRequestSchema>

export const ReportOpenRequestSchema = z.object({
  text: z.string().trim().min(3).max(1000),
})
export type ReportOpenRequest = z.infer<typeof ReportOpenRequestSchema>

export interface AccessKeyResponse {
  /** "739 204" */
  display: string
  code: string
  /** Payload to put in the QR code. */
  qrPayload: string
  windowSeconds: number
  secondsLeft: number
  expiresAt: string
  nextRotationAt: string
  singleUse: true
  note: string
}

export interface LiveSessionDto {
  id: string
  mode: string
  doctorName: string
  doctorLine: string | null
  facility: string | null
  startedAt: string
  expiresAt: string
  secondsLeft: number
  progressPercent: number
  scopeChips: string[]
  openedInSession: { at: string; item: string; category: string; state: string }[]
}

export interface AccessCategoryDto {
  key: string // emg | lab | rx | vitals | imaging | genomic | mental_health
  label: string
  description: string
  enabled: boolean
  locked: boolean
}

export interface AccessHistoryRowDto {
  id: string
  at: string
  who: string
  role: string // Doctor | Lab tech | Radiology | Pharmacist | Nurse | Emergency | Staff
  how: string
  saw: string
  status: 'live' | 'done' | 'ended' | 'review'
  sessionId: string | null
}

export interface AccessHistoryResponse {
  rows: AccessHistoryRowDto[]
  total: number
  opensThisMonth: number
  note: string
}

export interface FamilyMemberDto {
  id: string
  personId: string
  name: string
  relation: string
  kind: 'adult' | 'minor_guardian'
  canShowKey: boolean
  status: 'active' | 'pending' | 'guardian'
  note: string
}

export interface AccessOverviewResponse {
  key: AccessKeyResponse
  liveSessions: LiveSessionDto[]
  categories: AccessCategoryDto[]
  sharedCount: number
  totalCategories: number
  opensThisMonth: number
  family: FamilyMemberDto[]
  emergencyNote: string
}

/**
 * Hospital admin console: response and request shapes of /api/v1/hospital-admin/*.
 * Types only (the API validates with its own zod schemas). Not yet exported from index.ts.
 * All data is synthetic demo data.
 */

export type HospitalApprovalFilter = 'pending' | 'doctors' | 'decided' | 'all'
export type HospitalRejectReasonCode =
  | 'registration_unverified'
  | 'registration_expired'
  | 'document_unreadable'
  | 'not_employed_here'
  | 'other'

export interface HospitalOverview {
  hospital: { id: string; name: string; hfrId: string; ownership: string; hospitalType: string; district: string; verifiedAt: string | null }
  admin: { userId: string; name: string }
  asOf: string
  kpis: {
    opVisitsToday: number
    opVisitsSameDayLastWeek: number
    opTrendPct: number | null
    bedsTotal: number
    bedsOccupied: number
    bedOccupancyPct: number | null
    icuBedsTotal: number
    icuBedsOccupied: number
    activeDoctorSessions: number
    pendingApprovals: number
  }
  occupancyByDepartment: { department: string; total: number; occupied: number; free: number; pctFull: number }[]
  breakGlass: { thisWeek: number; needReview: number; reviewWindowHours: number }
  approvalQueue: HospitalApplicant[]
  staffOnDuty: { doctors: number; nurses: number; lab: number; radiology: number; pharmacy: number; admin: number; total: number }
  recentActivity: HospitalAuditItem[]
  complaints: { openCount: number; items: { id: string; refNo: string; title: string; who: string; createdAt: string; state: HospitalComplaintState }[] }
  rating: HospitalRatingSummary
}

export interface HospitalApplicantDocument {
  index: number
  title: string
  meta: string
  checked: boolean
  expired: boolean
}

export interface HospitalApplicant {
  id: string
  userId: string | null
  name: string
  role: string | null
  department: string | null
  employment: string | null
  registry: string | null
  ekyc: string | null
  appliedAt: string
  dueAt: string
  status: string
  priority: string
  decidedAt: string | null
  decisionReason: string | null
  documents: HospitalApplicantDocument[]
  canApprove: boolean
  blockReason: string | null
}

export interface HospitalApprovalsResponse {
  counts: { pending: number; doctors: number; decided: number; total: number }
  rejectReasons: { code: HospitalRejectReasonCode; label: string }[]
  items: HospitalApplicant[]
}

export interface HospitalRejectRequest {
  reasonCode?: HospitalRejectReasonCode
  reason?: string
}

export interface HospitalStaffMember {
  userId: string
  name: string
  role: 'doctor' | 'nurse' | 'lab' | 'radiology' | 'pharmacist'
  roleLabel: string
  department: string | null
  registration: string | null
  status: 'on_duty' | 'off' | string
}

export interface HospitalStaffResponse {
  total: number
  limit: number
  offset: number
  items: HospitalStaffMember[]
  kpis: {
    activeAccounts: number
    departments: number
    doctors: number
    doctorsOnDuty: number
    nurses: number
    nursesOnDuty: number
    technicians: number
    labTechnicians: number
    radiologyTechnicians: number
    pharmacists: number
  }
  pendingInvites: { id: string; name: string; roleKind: string; sentAt: string; expiresAt: string }[]
}

export interface HospitalCreateStaffRequest {
  personId: string
  staffRole: 'nurse' | 'lab' | 'radiology'
  departmentId?: string
}

export interface HospitalPermissionMatrix {
  roles: { key: string; label: string }[]
  permissions: {
    code: string
    label: string
    note: string | null
    locked: boolean
    roles: Record<string, { allowed: boolean; base: boolean; overridden: boolean }>
  }[]
}

export interface HospitalPermissionChangesRequest {
  changes: { roleKey: string; permissionCode: string; allowed: boolean }[]
}

export interface HospitalDepartmentsResponse {
  totals: { total: number; occupied: number; free: number; pctFull: number }
  unassignedBeds: { total: number; occupied: number; free: number } | null
  items: {
    id: string
    name: string
    isActive: boolean
    totalBeds: number
    occupied: number
    free: number
    pctFull: number
    tone: 'danger' | 'warning' | 'success'
    staff: number
    head: string | null
  }[]
}

export interface HospitalBedsResponse {
  wards: { id: string; code: string; name: string; department: string | null; isActive: boolean; totalBeds: number; occupied: number; free: number }[]
  beds: {
    id: string
    bedNo: string
    bedType: string
    status: 'free' | 'occupied' | 'reserved' | 'cleaning' | 'out_of_service'
    wardId: string
    ward: string
    department: string | null
    patient: string | null
    admissionId: string | null
  }[]
}

export interface HospitalAdmissionsResponse {
  kpis: {
    admitted: number
    admittedSinceMidnight: number
    dischargesPlanned: number
    critical: number
    criticalIcu: number
    criticalOther: number
    avgStayDays: number | null
  }
  items: {
    id: string
    patient: string
    ipNumber: string | null
    bed: string | null
    department: string | null
    status: 'critical' | 'watch' | 'stable' | 'discharge_today'
    doctor: string | null
    admittedAt: string
    expectedDischarge: string | null
  }[]
}

export type RosterShift = 'op' | 'night' | 'off' | 'ward_round' | 'teleconsult'

export interface HospitalRoster {
  weekStart: string
  days: string[]
  rules: { minDoctorsPerDay: number; minNightOnCall: number }
  published: boolean
  publishedAt: string | null
  doctors: { userId: string; name: string; department: string | null; shifts: Record<string, RosterShift | null> }[]
  coverage: { date: string; weekday: string; doctorsOnDuty: number; doctorsTotal: number; nightOnCall: number; thinCover: boolean }[]
  warnings: string[]
}

export interface HospitalRosterUpdateRequest {
  weekStart: string
  cells: { doctorUserId: string; date: string; shift: RosterShift }[]
}

export interface HospitalBreakGlassItem {
  sessionId: string
  doctor: string
  patient: string
  department: string | null
  startedAt: string
  minutesOpen: number
  reasonCategory: string | null
  reason: string | null
  evidence: string | null
  matchMethod: string | null
  viewed: { kind: string; label: string | null }[]
  status: 'review_due' | 'justified' | 'escalated'
  reviewDueAt: string
  hoursLeft: number | null
  reviewedAt: string | null
  reviewNote: string | null
  districtStatus: string
}

export interface HospitalBreakGlassResponse {
  needReview: number
  items: HospitalBreakGlassItem[]
}

export interface HospitalAuditItem {
  seq: number
  at: string
  actor: string
  actorType?: string | null
  action: string
  summary: string
  group: 'access' | 'admin' | 'system'
}

export interface HospitalAuditResponse {
  items: HospitalAuditItem[]
  nextBeforeSeq: number | null
}

export type HospitalComplaintState = 'new' | 'under_review' | 'resolved' | 'escalated'

export interface HospitalComplaintsResponse {
  openCount: number
  resolvedCount: number
  escalatedCount: number
  avgResponseDays: number | null
  targetDays: number
  byCategoryLast30Days: { category: string; label: string; count: number }[]
  items: {
    id: string
    refNo: string
    title: string
    text: string
    who: string
    createdAt: string
    dueAt: string | null
    category: string
    categoryLabel: string
    urgent: boolean
    severity: string
    state: HospitalComplaintState
    assignee: string | null
    resolution: string | null
    resolvedAt: string | null
    escalationLevel: number
  }[]
}

export interface HospitalRatingSummary {
  average: number | null
  count: number
  verifiedCount: number
  distribution: { stars: number; count: number; pct: number }[]
  topTags: { tag: string; count: number }[]
  byDepartment: { department: string; avg: number; n: number }[]
  repliedPct: number
  repliedWithin3DaysPct: number
  avgReplyDays: number | null
  newThisMonth: number
  changeVsLastMonth: number | null
}

export interface HospitalReviewsResponse {
  summary: HospitalRatingSummary
  items: {
    id: string
    name: string
    stars: number
    text: string | null
    tags: string[]
    department: string | null
    visitVerified: boolean
    createdAt: string
    replies: { id: string; body: string; at: string; by: string }[]
  }[]
}

export interface HospitalProfile {
  id: string
  name: string
  hfrId: string
  licenceNo: string
  ownership: string
  hospitalType: string
  district: string
  status: string
  verifiedAt: string | null
  lockedFields: string[]
  editable: {
    phone: string | null
    address: string
    timings: { op?: string; casualty?: string; help_desk?: string }
    about: string | null
    services: string[]
    showInFindCare: boolean
    acceptsBookings: boolean
  }
  documents: { id: string; docType: string; title: string; referenceNo: string | null; validUntil: string | null; status: string }[]
  changeRequests: { id: string; status: string; submittedAt: string; decidedAt: string | null; decisionReason: string | null; changes: unknown }[]
}

/** A profile edit is sent to the district admin as an approval request. */
export interface HospitalProfileChangeRequest {
  phone?: string
  address?: string
  about?: string
  timings?: { op?: string; casualty?: string; help_desk?: string }
  services?: string[]
  showInFindCare?: boolean
  acceptsBookings?: boolean
  note?: string
}

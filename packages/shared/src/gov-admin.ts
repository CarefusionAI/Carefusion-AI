/**
 * Government console API types (district, state, zonal and central admin).
 * One console, parametrised by the signed-in admin's admin post. Served under /api/v1/gov.
 * Types only: no runtime code, so importing this file never adds weight to a bundle.
 *
 * `Widget<T>` is the explicit "not available" shape: when no table can supply a number, the API
 * returns { available: false, reason } instead of inventing one.
 * Everything here is aggregated and de-identified. Any count below the small-cell limit is null.
 */

export type GovLevel = 'district' | 'state' | 'zonal' | 'central'

export type Widget<T> = { available: true; data: T } | { available: false; reason: string }

export type GovUnitKind = 'block' | 'district' | 'state'

// ---------------------------------------------------------------- context, map, overview

export interface GovSection {
  id: string
  label: string
  group: string | null
  badge: number | null
}

export interface GovContext {
  level: GovLevel
  role: string
  person: { name: string }
  unit: { kind: 'district' | 'state' | 'zone' | 'national'; name: string }
  population: number | null
  child: { kind: GovUnitKind; label: string; plural: string }
  escalateTo: string
  createLevel: GovLevel | null
  hasAI: boolean
  sections: GovSection[]
  smallCellMin: number
  banner: string
}

export interface GovUnitDisease {
  reported: boolean
  /** null when hidden by the small-cell rule or not reported */
  cases: number | null
  suppressed: boolean
  perLakh: number | null
  aboveThreshold: boolean | null
}

export interface GovUnit {
  id: string
  code: string
  name: string
  kind: GovUnitKind
  population: number | null
  /** null for blocks: citizens record a district, not a block */
  registered: { count: number; abhaLinked: number; pctOfPopulation: number | null } | null
  diseases: Record<string, GovUnitDisease>
  blood: { units: number; daysCover: number | null; level: 'low' | 'watch' | 'good' | null; lowGroups: string[] } | null
  facilities: number | null
  doctors: number | null
  liveSessions: number | null
  admin: string | null
  hot: boolean
  status: 'outbreak_watch' | 'low_blood' | 'normal'
}

export interface GovMap {
  level: GovLevel
  metric: 'registered' | 'disease' | 'blood'
  disease: { code: string; name: string; thresholdPerLakh: number } | null
  week: string | null
  unitKind: GovUnitKind
  units: GovUnit[]
  ranking: { rank: number; id: string; name: string; value: number | null }[]
  needsAttention: { id: string; name: string; value: number | null }[]
  availability: Record<'registered' | 'disease' | 'blood' | 'facilities', Widget<null>>
  legend: { disease: { thresholdPerLakh: number } | null; blood: { lowBelowDays: number; watchBelowDays: number }; note: string }
  anomaly: { id: string; disease: string; title: string; hotUnits: string[] } | null
}

export interface GovKpi {
  key: string
  label: string
  value: number | null
  unit: string | null
  hint: string
  pctOfPopulation?: number | null
}

export interface GovOverview {
  level: GovLevel
  title: string
  week: string | null
  population: number | null
  kpis: GovKpi[]
  liveSessions: { now: number; peak: number; asOfDate: string | null; byHour: { hour: number; sessions: number }[] }
  waitingForYou: GovApprovalItem[]
  ranking: GovMap['ranking']
  rankingUnit: GovUnitKind
  citizensRegistered: { total: number; monthly: { month: string; label: string; newCitizens: number; cumulative: number }[] }
  registrationsByMonth: {
    months: { month: string; label: string; citizens: number; doctors: number; staff: number }[]
    thisMonth: { citizens: number; doctors: number; staff: number; total: number } | null
    byChannelThisMonth: { channel: string; count: number }[]
  }
  diseaseWatch: Widget<{ week: string; diseases: { code: string; name: string; weeks: { weekStart: string; cases: number | null }[] }[] }>
  facilityMix: { total: number; segments: { label: string; count: number }[] }
  anomaly: GovAnomaly | null
  blood: Widget<{ totalUnits: number; lowGroups: string[]; byGroup: { group: string; units: number; daysCover: number | null; level: 'low' | 'watch' | 'good' | null }[]; upcomingCamps: number }>
  flaggedForReview: GovFlaggedEvent[]
  connectedApps: { eventsToday: number; recent: { id: string; type: string; from: string; title: string; text: string; at: string }[] }
  preferredCard: 'grievances' | 'approvalFunnel'
  grievances: Widget<{ open: number; ageing: GovGrievances['ageing']; items: GovGrievances['items'] }>
  approvalFunnel: Widget<{ funnel: GovApprovalInbox['funnel90d']; stats: GovApprovals['stats']; daysToDecision: GovApprovalInbox['daysToDecision'] }>
  simulatedNotice: string
}

// ---------------------------------------------------------------- surveillance

export interface GovAnomaly {
  id: string
  disease: string
  diseaseName: string
  level: GovLevel
  weekStart: string
  hotUnits: string[]
  confidence: number
  title: string
  body: string
  evidence: string[]
  /** every alpha anomaly is a simulated AI output */
  simulated: boolean
  needsEpidemiologistReview: boolean
  status: 'open' | 'reviewed' | 'dismissed'
  reviewedAt: string | null
  createdAt: string
}

export interface GovResponseAction {
  id: string
  disease: string
  title: string
  meta: string | null
  status: 'planned' | 'in_progress' | 'done'
  tone: string | null
  createdAt: string
  updatedAt: string
}

export interface GovFieldRequest {
  id: string
  anomalyId: string
  anomalyTitle: string
  disease: string
  teamName: string
  status: 'requested' | 'assigned' | 'done' | 'cancelled'
  requestedBy: string
  createdAt: string
}

export interface GovSurveillance {
  diseases: { code: string; name: string }[]
  disease: { code: string; name: string; thresholdPerLakh: number; sdThreshold: number } | null
  week: string | null
  series: Widget<{ weekStart: string; isoWeek: number; cases: number | null; baseline: number | null; sd: number | null }[]>
  stats: Widget<{
    thisWeek: number | null
    baseline5y: number | null
    baselineNote: string
    ratePerLakh: number | null
    unitsAboveThreshold: number
    unitsReporting: number
    thresholdNote: string
    trend: { direction: 'up' | 'down'; pctVsBaseline: number } | null
  }>
  highestRates: Widget<{ unitId: string; code: string; name: string; kind: GovUnitKind; cases: number | null; casesLabel: string; perLakh: number | null; status: 'above_threshold' | 'normal' }[]>
  districts: Widget<{ districtId: string; name: string; cases: number | null; suppressed: boolean; perLakh: number | null; baseline: number | null; aboveBaseline: boolean | null }[]>
  anomalies: GovAnomaly[]
  insight: Widget<
    | { kind: 'anomaly'; anomaly: GovAnomaly }
    | { kind: 'none'; title: string; body: string; simulated: boolean }
  >
  responseActions: GovResponseAction[]
  fieldRequests: GovFieldRequest[]
  note: string
}

// ---------------------------------------------------------------- approvals

export type GovApprovalDecision = 'waiting' | 'approved' | 'rejected'

export interface GovApprovalItem {
  id: string
  subjectType: string
  step: number
  status: string
  decision: GovApprovalDecision
  priority: 'normal' | 'urgent'
  name: string
  role: string | null
  org: string | null
  ref: string | null
  summary: string | null
  flagged: boolean
  checks: { ok: boolean; text: string }[]
  submittedAt: string
  dueAt: string
  decidedAt: string | null
  ageDays: number
  overdue: boolean
  reminders: number
  moreInfo: { requestedAt: string; note: string | null } | null
  reason: string | null
  twoPerson: {
    required: boolean
    firstSigner: string | null
    state: 'not_required' | 'waiting_first_signature' | 'waiting_second_signature' | 'complete'
  }
  canEscalate: boolean
  decidedBy: string | null
}

export interface GovApprovals {
  level: GovLevel
  filter: 'all' | 'waiting' | 'decided'
  items: GovApprovalItem[]
  stats: {
    waiting: number
    oldestWaitingDays: number | null
    approvedThisMonth: number
    rejectedThisMonth: number
    mostCommonRejectionReason: string | null
    avgDecisionDays: number | null
    avgDecisionDaysVsLastMonth: number | null
    decidedWithinSlaPct: number | null
    escalatedUp: number
    remindersSent: number
  }
  escalateTo: GovLevel | null
}

export interface GovApprovalInbox {
  level: GovLevel
  total: number
  doctorApplications: GovApprovalItem[]
  adminApplications: GovApprovalItem[]
  flaggedUsers: GovApprovalItem[]
  funnel90d: { label: string; count: number }[]
  daysToDecision: { month: string; label: string; medianDays: number | null }[]
}

// ---------------------------------------------------------------- health alerts

export type GovAlertTargetScope = 'national' | 'zone' | 'state' | 'district'

export interface GovAlertTarget {
  scope: GovAlertTargetScope
  id: string | null
  name: string
}

export interface GovAlert {
  id: string
  title: string
  body: string
  category: string
  type: 'advisory' | 'emergency'
  status: 'draft' | 'pending_second_approval' | 'scheduled' | 'sent' | 'cancelled'
  target: GovAlertTarget
  scheduledAt: string | null
  sentAt: string | null
  startsAt: string
  sms: boolean
  translate: boolean
  /** app recipients counted when the alert was sent */
  reach: number | null
  issuer: string | null
  issuedBy: string | null
  secondApprover: string | null
  secondApprovedAt: string | null
  issuedAtMyLevel: boolean
  needsSecondApproval: boolean
}

export interface GovAlertList {
  level: GovLevel
  items: GovAlert[]
  stats: { thisMonth: number; awaitingSecondApproval: number; scheduled: number; drafts: number }
  targets: GovAlertTarget[]
  sender: string
  secondApprovalRule: string
}

// ---------------------------------------------------------------- blood and organ

export interface GovBlood {
  level: GovLevel
  stock: Widget<{
    totalUnits: number
    byGroup: { group: string; units: number; daysCover: number | null; level: 'low' | 'watch' | 'good' | null }[]
    lowGroups: string[]
    thresholds: { lowBelowDays: number; watchBelowDays: number }
  }>
  banks: { id: string; name: string; kind: string; district: string; units: number; daysCover: number | null; level: 'low' | 'watch' | 'good' | null }[]
  camps: { id: string; name: string; venue: string; district: string; startsAt: string; targetUnits: number | null; pledges: number; status: string }[]
  donors: { registered: number; ready: number }
  organPledges: { registered: number; inProgress: number }
  transplantsThisYear: Widget<number>
  waitingList: Widget<{ asOf: string; organs: { organ: string; waiting: number }[]; medianWaitKidneyDays: number | null; medianNote: string; certifiedTransplantCentres: number }>
  requests: { id: string; bloodGroup: string; units: number; urgency: string; hospital: string; district: string; createdAt: string; closesAt: string | null }[]
  callForDonors: { title: string; body: string; category: string; lowGroups: string[] } | null
}

// ---------------------------------------------------------------- directory, admins, grievances

export interface GovDirectory {
  level: GovLevel
  kind: 'doctors' | 'facilities' | 'staff'
  status: 'all' | 'active' | 'pending' | 'suspended'
  stats: { doctors: number; facilities: number; staff: number; needsAttention: number; suspended: number }
  total: number
  items: { id: string; name: string; detail: string | null; ref: string | null; organisation: string | null; district: string; status: string; verifiedAt: string | null }[]
  facilityMix: { type: string; count: number; onPlatformPct: number }[]
  note: string
}

export interface GovAdmins {
  level: GovLevel
  createLevel: GovLevel | null
  createEndpoint: string | null
  secondSigners: string[]
  rules: string[]
  managed: Widget<{ userId: string; name: string; level: GovLevel; covers: string; since: string; status: string }[]>
}

export interface GovGrievances {
  level: GovLevel
  open: number
  ageing: { upTo2Days: number; from3To7Days: number; over7Days: number }
  items: {
    id: string
    ref: string | null
    title: string | null
    facility: string | null
    district: string
    status: string
    severity: string | null
    escalationLevel: number | null
    createdAt: string
    dueAt: string | null
    resolvedAt: string | null
  }[]
  note: string
}

// ---------------------------------------------------------------- audit, logs, reports

export interface GovFlaggedEvent {
  id: string
  rule: string
  severity: 'low' | 'medium' | 'high'
  event: string
  actorRole: string | null
  facility: string | null
  district: string | null
  status: 'open' | 'justified' | 'escalated'
  createdAt: string
  reviewedAt: string | null
  reviewedBy: string | null
  outcomeNote: string | null
  escalatedToLevel: string | null
}

export interface GovAudit {
  level: GovLevel
  kpis: GovKpi[]
  flaggedEvents: GovFlaggedEvent[]
  breakGlassWeekly: { weekStart: string; uses: number }[]
  accessRules: Record<string, unknown>
  escalateTo: GovLevel | null
}

export interface GovLogPage {
  items: {
    seq: string
    at: string
    type: 'access' | 'breakglass' | 'admin' | 'export' | 'signin'
    level: 'info' | 'ok' | 'notice' | 'alert'
    action: string
    event: string
    actorRole: string | null
    actorName: string | null
    where: string | null
    ref: string
  }[]
  counts: Record<string, number>
  note: string
}

export type GovReportPeriod = '7d' | '30d' | 'quarter' | 'fy'

export interface GovReportExport {
  id: string
  report: string
  title: string
  period: string
  periodFrom: string | null
  periodTo: string | null
  format: 'csv' | 'pdf'
  sizeBytes: number | null
  by: string
  createdAt: string
  expiresAt: string
  deidentified: boolean
  filename: string
}

export interface GovReports {
  level: GovLevel
  reports: { code: string; title: string; description: string | null; frequency: 'weekly' | 'monthly' | 'on_demand'; smallCellMin: number }[]
  periods: { key: GovReportPeriod; label: string; from: string; to: string }[]
  formats: ({ format: 'csv'; available: true } | { format: 'pdf'; available: false; reason: string })[]
  recentExports: GovReportExport[]
  retentionNote: string
}

// ---------------------------------------------------------------- central: system and AI governance

export interface GovSystem {
  flags: {
    code: string
    label: string
    description: string | null
    enabled: boolean
    updatedAt: string
    updatedBy: string | null
    needsSecondSignerToChange: { toOn: boolean; toOff: boolean }
    confirmTextOn: string
    confirmTextOff: string
    pendingChange: { enabled: boolean; reason: string | null; requestedBy: string | null; requestedAt: string } | null
  }[]
  history: { id: string; flag: string; label: string; enabled: boolean; by: string | null; secondSigner: string | null; note: string | null; at: string }[]
  accessRules: { code: string; value: unknown; description: string | null }[]
  health: { checkedAt: string; allNormal: boolean; checks: { name: string; ok: boolean; detail?: string }[] }
  footnote: string
  twoPersonRule: string
}

export interface GovAiGovernance {
  simulated: true
  badge: string
  notice: string
  kpis: {
    modelsInUse: number
    modules: number
    waitingForApproval: number
    clinicianAgreementPct: number | null
    driftAlerts: number
    driftAlertHint: string | null
  }
  register: {
    modelId: string
    versionId: string
    name: string
    module: string
    version: string
    status: string
    meta: string | null
    driftPct: number | null
    agreementPct: number | null
    releasedAt: string | null
    simulated: boolean
    tone: string
  }[]
  releaseRequests: {
    id: string
    model: string
    fromVersion: string | null
    toVersion: string
    status: string
    submittedBy: string
    submittedAt: string
    requiredSignoffs: number
    approvals: number
    holds: number
    shadowRunDays: number
    metrics: Record<string, unknown>
    checklist: unknown[]
    signoffs: { approver: string; decision: 'approve' | 'hold'; reason: string | null; at: string }[]
    youSigned: 'approve' | 'hold' | null
    canRelease: boolean
  }[]
  rollbackRule: { driftPct: number; text: string }
  agreementSeries: { model: string; points: { week: string; value: number; samples: number | null }[] }[]
  minimumAgreementPct: number
  driftMonitor: { status: 'UNCERTAIN'; simulated: true; title: string; body: string; evidence: string[]; needsHumanReview: true } | null
  safetyReports: { id: string; kind: string; severity: string; title: string; detail: string | null; status: string; model: string | null; at: string; closedAt: string | null }[]
}

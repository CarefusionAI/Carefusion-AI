// Typed react-query hooks for the Doctor app (all endpoints live under /api/v1/doctor).
// Response shapes come from packages/shared/src/doctor.ts where they exist there; the rest are typed here
// from what the API actually returns (checked live against the demo database).
// Every AI output is SIMULATED (alpha rule 3) and arrives as an AIInsight with `simulated: true`.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { UseQueryOptions } from '@tanstack/react-query'
import type {
  AckResultRequest,
  AIInsight,
  AiChatReply,
  AiChatMessage,
  AiReviewRequest,
  BloodGroupFilter,
  BreakGlassRequest,
  CreateBloodRequest,
  CreateHandoverRequest,
  CreateOrderRequest,
  CreateReferralRequest,
  DoctorPatientHeader,
  DoctorSessionInfo,
  OpenSessionRequest,
  OrderRow,
  PastPatient,
  PrescriptionCheckResult,
  PrescriptionDraftRequest,
  PrescriptionLine,
  PrescriptionSignRequest,
  QueueRow,
  UpdateDoctorProfile,
  UpdateDoctorSettings,
} from '@carefusion/shared'
import { apiFetch } from '../lib/api'

export type {
  AIInsight,
  AiChatMessage,
  AiChatReply,
  BloodGroupFilter,
  BreakGlassRequest,
  DoctorPatientHeader,
  DoctorSessionInfo,
  OpenSessionRequest,
  OrderRow,
  PastPatient,
  PrescriptionCheckResult,
  PrescriptionLine,
  QueueRow,
}

// ---------------------------------------------------------------------------------------------
// Fetch helper and errors
// ---------------------------------------------------------------------------------------------

/** An error from the API with the readable message the server sent (and the whole body, e.g. rx checks). */
export class DoctorApiError extends Error {
  status: number
  body: unknown
  constructor(status: number, message: string, body: unknown) {
    super(message)
    this.name = 'DoctorApiError'
    this.status = status
    this.body = body
  }
}

function messageFromBody(body: unknown, fallback: string): string {
  if (body && typeof body === 'object') {
    const b = body as { message?: unknown; errorMessage?: unknown; issues?: unknown }
    if (Array.isArray(b.issues) && b.issues.length) {
      const first = b.issues[0] as { message?: string; path?: string }
      return first?.message ? `${first.path ? `${first.path}: ` : ''}${first.message}` : String(b.errorMessage ?? fallback)
    }
    if (typeof b.message === 'string') return b.message
    if (Array.isArray(b.message) && b.message.length) return String(b.message[0])
    if (typeof b.errorMessage === 'string') return b.errorMessage
  }
  return fallback
}

export function errorText(err: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (err instanceof Error && err.message) return err.message
  return fallback
}

const BASE = '/v1/doctor'

async function call<T>(path: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const headers = new Headers(init?.headers)
  let body = init?.body
  if (init?.json !== undefined) {
    headers.set('Content-Type', 'application/json')
    body = JSON.stringify(init.json)
  }
  let res: Response
  try {
    res = await apiFetch(`${BASE}${path}`, { ...init, headers, body })
  } catch {
    throw new DoctorApiError(0, 'Could not reach the server. Check that the API is running.', null)
  }
  const text = await res.text()
  let parsed: unknown = null
  if (text) {
    try {
      parsed = JSON.parse(text)
    } catch {
      parsed = text
    }
  }
  if (!res.ok) {
    throw new DoctorApiError(res.status, messageFromBody(parsed, `${res.status} ${res.statusText}`), parsed)
  }
  return parsed as T
}

const get = <T,>(path: string) => call<T>(path)
const post = <T,>(path: string, json?: unknown) => call<T>(path, { method: 'POST', json: json ?? {} })
const patch = <T,>(path: string, json: unknown) => call<T>(path, { method: 'PATCH', json })

function qs(params: Record<string, string | number | undefined | null>): string {
  const sp = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') sp.set(k, String(v))
  const s = sp.toString()
  return s ? `?${s}` : ''
}

// ---------------------------------------------------------------------------------------------
// Response types (the ones shared/doctor.ts does not declare)
// ---------------------------------------------------------------------------------------------

export interface DoctorAlert {
  id: string
  kind: string
  severity: 'critical' | 'warning' | 'info' | string
  title: string
  detail: string
  patientName: string | null
  raisedAt: string
  acknowledged: boolean
}

export interface ReviewAiItem {
  runId: string
  module: string
  headline: string
  status: 'VERIFIED' | 'SUPPORTED_WITH_CAUTION' | 'UNCERTAIN'
  tool: string
  createdAt: string
}

export interface ReviewLabItem {
  kind: 'lab'
  resultId: string
  orderRef: string
  title: string
  patientName: string
  patientPersonId: string
  values: string
  critical: boolean
  releasedBy: string
  releasedAt: string
  acknowledged: boolean
}

export interface HandoverItemRow {
  id: string
  patientPersonId: string | null
  patientName: string
  flag: 'watch' | 'pending' | 'transfer' | 'info'
  note: string
  fromAiDraft: boolean
}

export interface HandoverRow {
  id: string
  unit: string
  shiftDate: string
  from: string
  to: string
  summary: string
  createdAt: string
  signedAt: string | null
  signedBy: string | null
  canSign: boolean
  items: HandoverItemRow[]
}

export interface DoctorHomeData {
  simulated: boolean
  doctor: {
    name: string
    specialisation: string
    hospital: string
    department: string
    hprId: string
    yearsExperience: number
    dutyHours: { from: string; to: string; days: string }
  }
  /** The clinic day the demo data is about (seed: 17 Oct 2026). `isToday` is false when the real date differs. */
  clinicDate: string
  isToday: boolean
  stats: {
    patientsToday: number
    seen: number
    waiting: number
    avgWaitMinutes: number | null
    longestWaitMinutes: number | null
    noShows: number
    aiReviewsPending: number
    oldestAiReviewAt: string | null
    ordersBack: number
    sessionsToday: number
    sessionsThisWeek: number
    unreadNotifications: number
  }
  queue: QueueRow[]
  nextUp: QueueRow | null
  waitingForReview: { ai: ReviewAiItem[]; results: ReviewLabItem[] }
  alerts: DoctorAlert[]
  pendingPrescriptions: { draftId: string; patientName: string; lines: number }[]
  handover: HandoverRow | null
  recentPatients: PastPatient[]
}

export interface QueueData {
  date: string
  isToday: boolean
  queue: QueueRow[]
}

export interface ScheduleAppointment {
  visitId: string
  time: string
  patientName: string
  meta: string
  status: QueueRow['status']
  kind: 'op' | 'walk_in' | 'teleconsult' | string
  bookingRef: string | null
}

export interface ScheduleBlock {
  id: string
  type: 'op_clinic' | 'teleconsult' | 'ward_round' | 'procedure' | string
  from: string
  to: string
  location: string | null
  note: string | null
}

export interface ScheduleData {
  date: string
  isToday: boolean
  stats: { bookedToday: number; checkedIn: number; noShows: number; fromCitizenApp: number; teleconsults: number }
  appointments: ScheduleAppointment[]
  week: { date: string; weekday: string; patients: number; booked: number; blocks: ScheduleBlock[] }[]
  availability: { acceptsWalkin: boolean; offersTeleconsult: boolean; upcomingLeave: string[] }
}

export interface DoctorNotification {
  id: string
  type: string
  typeLabel: string
  chip: string
  tone: 'blue' | 'teal' | 'peach' | 'sage' | 'lav' | 'cream' | string
  from: string
  title: string
  text: string
  href: string | null
  at: string
  read: boolean
  sentByMe: boolean
}

export interface NotificationsData {
  unread: number
  events: DoctorNotification[]
}

export interface SessionsData {
  live: DoctorSessionInfo[]
  recent: DoctorSessionInfo[]
}

export interface SummaryData {
  patient: DoctorPatientHeader
  hiddenByPatient: string[]
  allergies: { id: string; substance: string; reaction: string | null; severity: string }[]
  conditions: { id: string; name: string; code: string | null; chronic: boolean; onset: string | null }[]
  medications: { id: string; name: string; dose: string | null; since: string | null }[]
  emergencyContacts: { name: string; relation: string }[]
  specialCategories: string[]
  organDonor: boolean
  glance: { label: string; value: string; at: string | null }[]
  timeline: { at: string; kind: string; title: string; detail: string }[]
  /** On-the-fly summary: runId is null, so it cannot be reviewed or stored. */
  aiSummary: AIInsight
}

export interface TrendPoint {
  at: string
  value: number
  flag?: string
}
export interface LabSeries {
  code: string
  name: string
  unit: string
  refLow: number | null
  refHigh: number | null
  points: TrendPoint[]
}
export interface VitalSeries {
  code: string
  name: string
  unit: string
  points: TrendPoint[]
}
export interface TrendsData {
  labSeries: LabSeries[]
  vitalSeries: VitalSeries[]
  hiddenByPatient: string[]
}

export interface SessionFile {
  id: string
  title: string
  type: string
  docType: string
  source: string
  signatureNote: string | null
  mimeType: string | null
  sizeBytes: number | null
  createdAt: string
  isNew: boolean
  addedByMe: boolean
}
export interface FilesData {
  files: SessionFile[]
  hiddenByPatient: string[]
}
export interface OpenedFile {
  id: string
  title: string
  mimeType: string | null
  /** Pre-signed link (about 15 minutes). */
  url: string | null
  text: string | null
}

export interface AiListData {
  insights: AIInsight[]
  pendingReview: number
  hiddenByPatient: string[]
  simulated: true
  label: string
}
export interface AiChatHistory {
  sessions: { id: string; title: string; messageCount: number; startedAt: string }[]
  current: { chatSessionId: string; messages: AiChatMessage[] } | null
  simulated: true
  label: string
}

export interface MedicineHit {
  id: string
  name: string
  form: string
  schedule: string
  category: string | null
  hospitalPharmacyStock: 'in' | 'low' | 'out' | 'unknown'
  hospitalPharmacyQuantity: number | null
}

export interface RxListData {
  drafts: { id: string; patientPersonId: string; patientName: string; lines: number; medicines: string | null; advice: string | null; updatedAt: string }[]
  issued: { id: string; rxNumber: string; patientName: string; medicines: string; issuedAt: string; status: string; readyAtPharmacy: boolean }[]
}

export interface RxDraftResult {
  draftId: string
  updatedAt: string
  lines: PrescriptionLine[]
  advice: string | null
  checks: PrescriptionCheckResult
}

export interface RxSignResult {
  prescriptionId: string
  rxNumber: string
  issuedAt: string
  validUntil: string
  qrToken: string
  signature: { method: string; ref: string; txnId: string; simulated: boolean; signedAt: string }
  documentId: string
  sentToPharmacy: string | null
  checks: PrescriptionCheckResult
  message: string
}

export interface OrdersData {
  stats: { open: number; inProgress: number; resultsBack: number; critical: number }
  orders: OrderRow[]
}

export interface OrderCatalogue {
  lab: {
    tests: { code: string; name: string; category: string; specimen: string; fastingRequired: boolean; unit: string | null }[]
    panels: { code: string; name: string; tests: string[] }[]
  }
  imaging: { name: string; modality: string; bodyPart: string }[]
  priorities: ('routine' | 'urgent' | 'stat')[]
}

export interface LabResultRow {
  kind: 'lab'
  resultId: string
  orderRef: string
  title: string
  patientName: string
  patientPersonId: string
  values: string
  critical: boolean
  releasedBy: string
  releasedAt: string
  acknowledged: boolean
}
export interface ImagingResultRow {
  kind: 'imaging'
  studyId: string
  orderRef: string
  title: string
  patientName: string
  status: string
  completedAt: string | null
}
export interface ResultsData {
  lab: LabResultRow[]
  imaging: ImagingResultRow[]
}

export interface ReferralRow {
  id: string
  patientName: string
  to: string
  toHospital: string
  toDoctor: string | null
  status: string
  sentAt: string
}
export interface ReferralsData {
  sent: ReferralRow[]
  received: ReferralRow[]
}
export interface Destination {
  id: string
  name: string
  type: string
  district: string | null
  departments: string[]
}
export interface DestinationDoctor {
  userId: string
  name: string
  specialisation: string
}
export interface Colleague {
  userId: string
  name: string
  specialisation: string
  visiting: boolean
}
export interface HandoverDraft {
  items: { patientPersonId: string | null; patientName: string; flag: HandoverItemRow['flag']; note: string; fromAiDraft: boolean }[]
  simulated: true
  label: string
}

export interface EmergencyInfo {
  enabled: boolean
  windowMinutes: number
  emergencyCardMinutesPerCitizenScreen: number
  readOnly: boolean
  reasonCategories: { code: BreakGlassRequest['reasonCategory']; label: string }[]
  minReasonLength: number
  needsSecondDoctor: boolean
  reviewChain: string
  notified: string[]
  lastUses: {
    sessionId: string
    at: string
    reasonCategory: string
    reason: string
    patient: string
    hospitalReview: string | null
    districtReview: string | null
  }[]
}
export interface UnidentifiedPatient {
  personId: string
  label: string
  registeredAt: string
}
export interface EmergencyLookup {
  personId: string
  patient: DoctorPatientHeader
}
export interface EmergencyCard {
  personId: string
  name: string
  dateOfBirth: string | null
  sex: string | null
  bloodGroup: string | null
  organDonorStatus: string | null
  allergies: { severity: string; substance: string }[]
  conditions: { name: string; chronic: boolean }[]
  specialCategories: string[]
  emergencyContacts: { name: string; relation: string }[]
  note: string
}

export interface MessageThread {
  id: string
  patientPersonId: string
  patientName: string
  meta: string
  lastMessage: string
  lastMessageAt: string
  unread: number
  closed: boolean
}
export interface ThreadsData {
  unreadTotal: number
  quickReplies: string[]
  threads: MessageThread[]
}
export interface ThreadMessage {
  id: string
  from: 'patient' | 'me'
  text: string
  sentAt: string
}
export interface ThreadData {
  id: string
  patientPersonId: string
  patientName: string
  closed: boolean
  messages: ThreadMessage[]
}

export interface DonorsData {
  bloodGroup: string
  radiusKm: number
  donors: { personId: string; name: string; ready: boolean; distanceKm: number | null; donations: number; lastDonationAt: string | null; note: string }[]
  bloodBank: { bank: string; bloodGroup: string; units: number; daysCover: number | null; asOf: string }[]
  organPledgeNote: string
}
export interface BloodRequestRow {
  id: string
  bloodGroup: string
  units: number
  urgency: 'normal' | 'urgent' | 'critical'
  status: string
  createdAt: string
  closesAt: string
  donorsAlerted: number
  willDonate: number
}
export interface PharmacyStockRow {
  medicine: string
  form: string
  schedule: string
  pharmacyId: string
  pharmacy: string
  distanceKm: number | null
  status: 'in' | 'low' | 'out' | 'unknown'
  quantity: number | null
  minPrice: number | null
  janAushadhi: boolean
  ownPharmacy: boolean | null
}

export interface DoctorProfile {
  name: string
  specialisation: string
  department: string
  hospital: string
  hprId: string
  hprVerified: boolean
  council: string
  degrees: { year: number; degree: string }[]
  languages: string[]
  bio: string | null
  yearsExperience: number
  acceptsWalkin: boolean
  offersTeleconsult: boolean
  dutyHours: { from: string; to: string; days: string }
  signingMethod: string
  stats: { consultsThisYear: number; teleconsults: number; avgConsultMinutes: number; referrals: number }
  /** breakdown values are percentages per star level. */
  rating: { average: number; count: number; breakdown: Record<string, number> }
  mostMentioned: { tag: string; count: number }[]
  reviews: { id: string; who: string; date: string; stars: number; text: string; tags: string[]; verifiedVisit: boolean; myReply: string | null }[]
}

export interface DoctorSettings {
  preferences: {
    textSize: 'small' | 'default' | 'large' | 'xlarge'
    highContrast: boolean
    reduceMotion: boolean
    quietHours: { enabled: boolean; from: string; to: string }
  }
  notifications: { category: string; channel: string; enabled: boolean }[]
  devices: { id?: string; label?: string; lastSeenAt?: string }[]
  account: { hprId: string; council: string; eSign: string; twoFactor: string }
  sessionRules: { idleLogoutMinutes: number }
}

// ---------------------------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------------------------

export const dk = {
  all: ['doctor'] as const,
  home: ['doctor', 'home'] as const,
  queue: (date?: string) => ['doctor', 'queue', date ?? 'today'] as const,
  schedule: (date?: string) => ['doctor', 'schedule', date ?? 'today'] as const,
  alerts: ['doctor', 'alerts'] as const,
  notifications: ['doctor', 'notifications'] as const,
  sessions: ['doctor', 'sessions'] as const,
  pastPatients: ['doctor', 'past-patients'] as const,
  summary: (sid: string) => ['doctor', 'session', sid, 'summary'] as const,
  trends: (sid: string) => ['doctor', 'session', sid, 'trends'] as const,
  files: (sid: string) => ['doctor', 'session', sid, 'files'] as const,
  ai: (sid: string) => ['doctor', 'session', sid, 'ai'] as const,
  aiChat: (sid: string) => ['doctor', 'session', sid, 'ai-chat'] as const,
  rx: ['doctor', 'prescriptions'] as const,
  medicines: (q: string) => ['doctor', 'medicines', q] as const,
  orders: ['doctor', 'orders'] as const,
  catalogue: ['doctor', 'orders-catalogue'] as const,
  results: ['doctor', 'orders-results'] as const,
  referrals: ['doctor', 'referrals'] as const,
  destinations: ['doctor', 'referral-destinations'] as const,
  destinationDoctors: (id: string) => ['doctor', 'referral-destinations', id, 'doctors'] as const,
  handovers: ['doctor', 'handover'] as const,
  colleagues: ['doctor', 'colleagues'] as const,
  emergency: ['doctor', 'emergency'] as const,
  unidentified: ['doctor', 'emergency-unidentified'] as const,
  card: (id: string) => ['doctor', 'emergency-card', id] as const,
  threads: ['doctor', 'messages'] as const,
  thread: (id: string) => ['doctor', 'messages', id] as const,
  donors: (g: string, km: number) => ['doctor', 'donors', g, km] as const,
  bloodRequests: ['doctor', 'blood-requests'] as const,
  stock: (q: string) => ['doctor', 'pharmacy-stock', q] as const,
  profile: ['doctor', 'profile'] as const,
  settings: ['doctor', 'settings'] as const,
}

type QOpts<T> = Partial<Omit<UseQueryOptions<T, DoctorApiError>, 'queryKey' | 'queryFn'>>

function useDoctorQuery<T>(key: readonly unknown[], path: string, opts?: QOpts<T>) {
  return useQuery<T, DoctorApiError>({
    queryKey: key,
    queryFn: () => get<T>(path),
    retry: false,
    refetchOnWindowFocus: false,
    ...opts,
  })
}

// ---------------------------------------------------------------------------------------------
// Home, queue, schedule, alerts, notifications
// ---------------------------------------------------------------------------------------------

export const useDoctorHome = () => useDoctorQuery<DoctorHomeData>(dk.home, '/home', { refetchInterval: 20000 })
export const useQueue = (date?: string) => useDoctorQuery<QueueData>(dk.queue(date), `/queue${qs({ date })}`, { refetchInterval: 20000 })
export const useSchedule = (date?: string) => useDoctorQuery<ScheduleData>(dk.schedule(date), `/schedule${qs({ date })}`)
export const useAlerts = () => useDoctorQuery<DoctorAlert[]>(dk.alerts, '/alerts')
export const useNotifications = () => useDoctorQuery<NotificationsData>(dk.notifications, '/notifications', { refetchInterval: 15000 })

export function useUpdateQueue() {
  const qc = useQueryClient()
  return useMutation<{ visitId: string; status: string }, DoctorApiError, { visitId: string; status: 'waiting' | 'no_show' | 'done' }>({
    mutationFn: ({ visitId, status }) => patch(`/queue/${visitId}`, { status }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['doctor', 'queue'] })
      void qc.invalidateQueries({ queryKey: ['doctor', 'schedule'] })
      void qc.invalidateQueries({ queryKey: dk.home })
    },
  })
}

export function useAckAlert() {
  const qc = useQueryClient()
  return useMutation<{ id: string; acknowledged: boolean }, DoctorApiError, string>({
    mutationFn: (id) => post(`/alerts/${id}/ack`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: dk.alerts })
      void qc.invalidateQueries({ queryKey: dk.home })
    },
  })
}

export function useMarkNotificationsRead() {
  const qc = useQueryClient()
  return useMutation<{ marked: number }, DoctorApiError, string[] | undefined>({
    mutationFn: (ids) => post('/notifications/read', ids ? { ids } : {}),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: dk.notifications })
      void qc.invalidateQueries({ queryKey: dk.home })
    },
  })
}

// ---------------------------------------------------------------------------------------------
// Sessions (opening a patient)
// ---------------------------------------------------------------------------------------------

export const useSessions = () => useDoctorQuery<SessionsData>(dk.sessions, '/sessions', { refetchInterval: 15000 })
export const usePastPatients = () => useDoctorQuery<PastPatient[]>(dk.pastPatients, '/patients/past')

export function useOpenSession() {
  const qc = useQueryClient()
  return useMutation<DoctorSessionInfo, DoctorApiError, OpenSessionRequest>({
    mutationFn: (body) => post('/access/open', body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: dk.sessions })
      void qc.invalidateQueries({ queryKey: dk.home })
      void qc.invalidateQueries({ queryKey: ['doctor', 'queue'] })
    },
  })
}

export function useEndSession() {
  const qc = useQueryClient()
  return useMutation<DoctorSessionInfo, DoctorApiError, string>({
    mutationFn: (sid) => post(`/sessions/${sid}/end`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: dk.sessions })
      void qc.invalidateQueries({ queryKey: dk.pastPatients })
      void qc.invalidateQueries({ queryKey: dk.home })
    },
  })
}

// ---------------------------------------------------------------------------------------------
// Inside a session
// ---------------------------------------------------------------------------------------------

const sidOpts = (sid: string | null | undefined) => ({ enabled: Boolean(sid) })

export const useSessionSummary = (sid: string | null) =>
  useDoctorQuery<SummaryData>(dk.summary(sid ?? ''), `/sessions/${sid}/summary`, sidOpts(sid))
export const useTrends = (sid: string | null) => useDoctorQuery<TrendsData>(dk.trends(sid ?? ''), `/sessions/${sid}/trends`, sidOpts(sid))
export const useSessionFiles = (sid: string | null) => useDoctorQuery<FilesData>(dk.files(sid ?? ''), `/sessions/${sid}/files`, sidOpts(sid))
export const useAiList = (sid: string | null) => useDoctorQuery<AiListData>(dk.ai(sid ?? ''), `/sessions/${sid}/ai`, sidOpts(sid))
export const useAiChatHistory = (sid: string | null) =>
  useDoctorQuery<AiChatHistory>(dk.aiChat(sid ?? ''), `/sessions/${sid}/ai/chat`, sidOpts(sid))

/** Opens one file. The server logs this to the patient's access history. */
export function useOpenFile(sid: string | null) {
  const qc = useQueryClient()
  return useMutation<OpenedFile, DoctorApiError, string>({
    mutationFn: (docId) => get<OpenedFile>(`/sessions/${sid}/files/${docId}`),
    onSuccess: () => {
      if (sid) void qc.invalidateQueries({ queryKey: dk.files(sid) })
    },
  })
}

export function useAiChat(sid: string | null) {
  const qc = useQueryClient()
  return useMutation<AiChatReply, DoctorApiError, { message: string; chatSessionId?: string }>({
    mutationFn: (body) => post(`/sessions/${sid}/ai/chat`, body),
    onSuccess: () => {
      if (!sid) return
      void qc.invalidateQueries({ queryKey: dk.aiChat(sid) })
      void qc.invalidateQueries({ queryKey: dk.ai(sid) })
    },
  })
}

function useAiRun(sid: string | null, kind: 'image' | 'genomic' | 'temporal') {
  const qc = useQueryClient()
  return useMutation<AIInsight, DoctorApiError, { documentId?: string } | void>({
    mutationFn: (body) => post(`/sessions/${sid}/ai/${kind}`, kind === 'image' ? { documentId: body ? body.documentId : undefined } : undefined),
    onSuccess: () => {
      if (sid) void qc.invalidateQueries({ queryKey: dk.ai(sid) })
      void qc.invalidateQueries({ queryKey: dk.home })
    },
  })
}
export const useAiImage = (sid: string | null) => useAiRun(sid, 'image')
export const useAiGenomic = (sid: string | null) => useAiRun(sid, 'genomic')
export const useAiTemporal = (sid: string | null) => useAiRun(sid, 'temporal')

/** Doctor accepts, edits or rejects an AI result. Citizens see it only after this review (and not when rejected). */
export function useAiReview() {
  const qc = useQueryClient()
  return useMutation<AIInsight, DoctorApiError, { runId: string } & AiReviewRequest>({
    mutationFn: ({ runId, ...body }) => post(`/ai/${runId}/review`, body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['doctor', 'session'] })
      void qc.invalidateQueries({ queryKey: dk.home })
    },
  })
}

// ---------------------------------------------------------------------------------------------
// Prescriptions
// ---------------------------------------------------------------------------------------------

export const useRxList = () => useDoctorQuery<RxListData>(dk.rx, '/prescriptions')
export const useMedicineSearch = (q: string) =>
  useDoctorQuery<MedicineHit[]>(dk.medicines(q), `/prescriptions/medicines${qs({ q })}`, { enabled: q.trim().length >= 1, staleTime: 30000 })

export function useCheckRx(sid: string | null) {
  return useMutation<PrescriptionCheckResult, DoctorApiError, PrescriptionLine[]>({
    mutationFn: (lines) => post(`/sessions/${sid}/prescriptions/check`, { lines }),
  })
}

export function useSaveRxDraft(sid: string | null) {
  const qc = useQueryClient()
  return useMutation<RxDraftResult, DoctorApiError, PrescriptionDraftRequest>({
    mutationFn: (body) => post(`/sessions/${sid}/prescriptions/draft`, body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: dk.rx })
      void qc.invalidateQueries({ queryKey: dk.home })
    },
  })
}

export function useSignRx(sid: string | null) {
  const qc = useQueryClient()
  return useMutation<RxSignResult, DoctorApiError, PrescriptionSignRequest>({
    mutationFn: (body) => post(`/sessions/${sid}/prescriptions/sign`, body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: dk.rx })
      void qc.invalidateQueries({ queryKey: dk.home })
    },
  })
}

// ---------------------------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------------------------

export const useOrders = () => useDoctorQuery<OrdersData>(dk.orders, '/orders', { refetchInterval: 20000 })
export const useOrderCatalogue = () => useDoctorQuery<OrderCatalogue>(dk.catalogue, '/orders/catalogue', { staleTime: 600000 })
export const useOrderResults = () => useDoctorQuery<ResultsData>(dk.results, '/orders/results', { refetchInterval: 20000 })

export function useCreateOrder(sid: string | null) {
  const qc = useQueryClient()
  return useMutation<{ orders: { id: string; orderRef: string; kind: string; details: string }[]; message: string }, DoctorApiError, CreateOrderRequest>({
    mutationFn: (body) => post(`/sessions/${sid}/orders`, body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: dk.orders })
      void qc.invalidateQueries({ queryKey: dk.home })
    },
  })
}

export function useAckResult() {
  const qc = useQueryClient()
  return useMutation<{ acknowledged: boolean; resultId: string }, DoctorApiError, { resultId: string } & AckResultRequest>({
    mutationFn: ({ resultId, comment }) => post(`/orders/results/lab/${resultId}/ack`, comment ? { comment } : {}),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: dk.results })
      void qc.invalidateQueries({ queryKey: dk.orders })
      void qc.invalidateQueries({ queryKey: dk.home })
    },
  })
}

// ---------------------------------------------------------------------------------------------
// Referral and handover
// ---------------------------------------------------------------------------------------------

export const useReferrals = () => useDoctorQuery<ReferralsData>(dk.referrals, '/referrals')
export const useDestinations = () => useDoctorQuery<Destination[]>(dk.destinations, '/referrals/destinations', { staleTime: 600000 })
export const useDestinationDoctors = (hospitalId: string) =>
  useDoctorQuery<DestinationDoctor[]>(dk.destinationDoctors(hospitalId), `/referrals/destinations/${hospitalId}/doctors`, { enabled: Boolean(hospitalId) })
export const useHandovers = () => useDoctorQuery<HandoverRow[]>(dk.handovers, '/handover')
export const useColleagues = () => useDoctorQuery<Colleague[]>(dk.colleagues, '/handover/colleagues', { staleTime: 300000 })

export function useCreateReferral(sid: string | null) {
  const qc = useQueryClient()
  return useMutation<
    { referralId: string; noteDocumentId: string | null; status: string; to: string; specialty: string; urgency: string; createdAt: string },
    DoctorApiError,
    CreateReferralRequest
  >({
    mutationFn: (body) => post(`/sessions/${sid}/referrals`, body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: dk.referrals }),
  })
}

export function useUpdateReferral() {
  const qc = useQueryClient()
  return useMutation<unknown, DoctorApiError, { id: string; status: 'seen' | 'accepted' | 'closed' }>({
    mutationFn: ({ id, status }) => patch(`/referrals/${id}`, { status }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: dk.referrals }),
  })
}

/** Simulated AI draft of the handover list. The doctor edits and approves it before sending. */
export function useDraftHandover() {
  return useMutation<HandoverDraft, DoctorApiError, void>({ mutationFn: () => post('/handover/draft') })
}

export function useCreateHandover() {
  const qc = useQueryClient()
  return useMutation<{ handoverId: string; items: number; to: string }, DoctorApiError, CreateHandoverRequest>({
    mutationFn: (body) => post('/handover', body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: dk.handovers })
      void qc.invalidateQueries({ queryKey: dk.home })
    },
  })
}

export function useSignHandover() {
  const qc = useQueryClient()
  return useMutation<unknown, DoctorApiError, string>({
    mutationFn: (id) => post(`/handover/${id}/sign`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: dk.handovers })
      void qc.invalidateQueries({ queryKey: dk.home })
    },
  })
}

// ---------------------------------------------------------------------------------------------
// Emergency access (break-glass)
// ---------------------------------------------------------------------------------------------

export const useEmergencyInfo = () => useDoctorQuery<EmergencyInfo>(dk.emergency, '/emergency')
export const useUnidentified = () => useDoctorQuery<UnidentifiedPatient[]>(dk.unidentified, '/emergency/unidentified')
export const useEmergencyCard = (personId: string | null) =>
  useDoctorQuery<EmergencyCard>(dk.card(personId ?? ''), `/emergency/card/${personId}`, { enabled: Boolean(personId) })

export function useEmergencyLookup() {
  return useMutation<EmergencyLookup, DoctorApiError, string>({
    mutationFn: (abha) => get(`/emergency/lookup${qs({ abha })}`),
  })
}

export function useBreakGlass() {
  const qc = useQueryClient()
  return useMutation<DoctorSessionInfo, DoctorApiError, BreakGlassRequest>({
    mutationFn: (body) => post('/emergency/break-glass', body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: dk.sessions })
      void qc.invalidateQueries({ queryKey: dk.emergency })
    },
  })
}

// ---------------------------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------------------------

export const useThreads = () => useDoctorQuery<ThreadsData>(dk.threads, '/messages', { refetchInterval: 20000 })
export const useThread = (id: string | null) =>
  useDoctorQuery<ThreadData>(dk.thread(id ?? ''), `/messages/${id}`, { enabled: Boolean(id) })

export function useReplyMessage() {
  const qc = useQueryClient()
  return useMutation<ThreadMessage, DoctorApiError, { id: string; text: string }>({
    mutationFn: ({ id, text }) => post(`/messages/${id}/reply`, { text }),
    onSuccess: (_d, v) => {
      void qc.invalidateQueries({ queryKey: dk.thread(v.id) })
      void qc.invalidateQueries({ queryKey: dk.threads })
    },
  })
}

// ---------------------------------------------------------------------------------------------
// Donors and pharmacy stock
// ---------------------------------------------------------------------------------------------

export const useDonors = (bloodGroup: BloodGroupFilter, radiusKm = 10) =>
  useDoctorQuery<DonorsData>(dk.donors(bloodGroup, radiusKm), `/donors${qs({ bloodGroup, radiusKm })}`)
export const useBloodRequests = () => useDoctorQuery<BloodRequestRow[]>(dk.bloodRequests, '/blood-requests')

export function useCreateBloodRequest() {
  const qc = useQueryClient()
  return useMutation<
    { requestId: string; bloodGroup: string; units: number; urgency: string; donorsAlerted: number; closesAt: string },
    DoctorApiError,
    CreateBloodRequest
  >({
    mutationFn: (body) => post('/blood-requests', body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: dk.bloodRequests }),
  })
}

export const usePharmacyStock = (q: string) =>
  useDoctorQuery<PharmacyStockRow[]>(dk.stock(q), `/pharmacy/stock${qs({ q })}`, { staleTime: 15000 })

// ---------------------------------------------------------------------------------------------
// Profile and settings
// ---------------------------------------------------------------------------------------------

export const useProfile = () => useDoctorQuery<DoctorProfile>(dk.profile, '/profile')
export const useSettings = () => useDoctorQuery<DoctorSettings>(dk.settings, '/settings')

export function useUpdateProfile() {
  const qc = useQueryClient()
  return useMutation<{ updated: boolean }, DoctorApiError, UpdateDoctorProfile>({
    mutationFn: (body) => patch('/profile', body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: dk.profile })
      void qc.invalidateQueries({ queryKey: ['doctor', 'schedule'] })
    },
  })
}

export function useReplyReview() {
  const qc = useQueryClient()
  return useMutation<{ id: string; createdAt: string }, DoctorApiError, { id: string; body: string }>({
    mutationFn: ({ id, body }) => post(`/reviews/${id}/reply`, { body }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: dk.profile }),
  })
}

export function useUpdateSettings() {
  const qc = useQueryClient()
  return useMutation<{ updated: boolean }, DoctorApiError, UpdateDoctorSettings>({
    mutationFn: (body) => patch('/settings', body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: dk.settings }),
  })
}

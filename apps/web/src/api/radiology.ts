import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { clinicalGet, clinicalSend } from './clinicalHttp'

// Radiology technician app: hooks for /api/v1/radiology (apps/api/src/staff/radiology).
// All patients, orders and images are synthetic. The AI pre-read is SIMULATED decision support.

const BASE = '/v1/radiology'
const KEY = ['radiology'] as const

export type Modality = 'XR' | 'CT' | 'USG' | 'MRI' | 'ECHO' | 'MAMMO' | 'FLUORO' | 'PORTABLE'
export type StudyPriority = 'routine' | 'urgent' | 'stat'
export type StudyStatus = 'waiting' | 'scheduled' | 'in_progress' | 'uploaded' | 'awaiting_report' | 'reported' | 'withdrawn'
export type RoomState = 'ok' | 'down' | 'maintenance'

export interface RadMe {
  userId: string
  personId: string
  fullName: string
  hospitalId: string | null
  role: string
}

export interface WorklistRow {
  /** Null while the doctor's order has not been accepted yet (no study exists). */
  studyId: string | null
  orderId: string
  orderRef: string
  patientPersonId: string
  patientName: string
  age: number | null
  sex: string | null
  modality: string
  bodyPart: string
  priority: StudyPriority
  status: StudyStatus | string
  contrast: boolean
  clinicalNote: string | null
  room: string | null
  scheduledFor: string | null
  orderedBy: string
  orderedAt: string | null
  waitingMinutes: number
}

export interface WorklistResponse {
  kpis: {
    waiting: number
    oldestWaitingMinutes: number
    scheduled: number
    inProgress: number
    awaitingReport: number
    statInQueue: number
    completedToday: number
    avgTurnaroundMinutes: number | null
    byModality: Record<string, { done: number; pending: number }>
  }
  studies: WorklistRow[]
}

export interface StudyFileRow {
  id: string
  fileName: string
  kind: string
  mimeType: string | null
  sizeBytes: number | null
  uploadedAt: string | null
  uploadedBy: string
  withdrawnAt: string | null
  withdrawnReason: string | null
  canWithdraw: boolean
}

export interface PriorRow {
  studyId: string
  modality: string
  bodyPart: string
  date: string | null
  status: string
}

export interface SimulatedPreRead {
  simulated: true
  label: string
  confidenceLabel: 'VERIFIED' | 'SUPPORTED_WITH_CAUTION' | 'UNCERTAIN'
  finding: string
  confidence: number
  evidence: string[]
  disclaimer: string
}

export interface StudyDetail {
  study: {
    id: string
    orderId: string
    orderRef: string
    modality: string
    bodyPart: string
    view: string | null
    priority: StudyPriority
    status: StudyStatus | string
    contrast: boolean
    clinicalNote: string | null
    /** Free-form jsonb. Booleans are tick boxes, numbers are read-only values. */
    checklist: Record<string, unknown>
    burnedInNameChecked: boolean
    startedAt: string | null
    completedAt: string | null
    orderedBy: string | null
    orderedAt: string | null
  }
  patient: {
    personId: string
    fullName: string
    age: number | null
    sex: string | null
    location: string
    allergies: { substance: string; reaction: string | null; severity: string | null }[]
  }
  room: { id: string; name: string; modality: string; status: string } | null
  slot: { id: string; startsAt: string | null; endsAt: string | null; label: string | null } | null
  files: StudyFileRow[]
  series: { id: string; seriesNo: number; modality: string; description: string | null; instanceCount: number }[]
  exposure: { kvp: number | null; mas: number | null; dapMgycm2: number | null; exposureMs: number | null; recordedAt: string | null } | null
  priors: PriorRow[]
  priorCandidates: PriorRow[]
  readiness: { patientIdMatched: boolean; namesMatch: boolean; hasFiles: boolean; priorLinked: boolean; canSubmit: boolean }
  aiPreRead: SimulatedPreRead | null
}

export interface RoomSlot {
  id: string
  startsAt: string | null
  endsAt: string | null
  label: string | null
  studyId: string | null
  studyStatus: string | null
  bodyPart: string | null
  patientName: string | null
}

export interface RoomRow {
  id: string
  name: string
  modality: string
  status: RoomState | string
  outOfServiceReason: string | null
  nowScanning: string | null
  studiesToday: number
}

export interface ScheduleResponse {
  date: string
  unscheduledStudies: number
  rooms: (RoomRow & { slots: RoomSlot[] })[]
}

export interface EquipmentRoom {
  id: string
  name: string
  modality: string
  status: RoomState | string
  led: 'ok' | 'warn' | 'bad'
  outOfServiceReason: string | null
  lastQcAt: string | null
  nextServiceDue: string | null
  studiesToday: number
  uptime30dPercent: number
}

export interface EquipmentEventRow {
  id: string
  roomId: string
  kind: string
  startsAt: string | null
  endsAt: string | null
  dueOn: string | null
  note: string | null
}

export interface EquipmentResponse {
  summary: { total: number; working: number; needsAttention: number; down: number; uptime30dPercent: number | null }
  rooms: EquipmentRoom[]
  events: EquipmentEventRow[]
}

export interface HandoverItem {
  id: string
  admissionId: string | null
  patientPersonId: string | null
  patientName: string | null
  bedId: string | null
  bedNo: string | null
  orderId: string | null
  flag: 'watch' | 'pending' | 'transfer' | 'info' | string
  note: string
  fromAiDraft: boolean
  doneAt: string | null
}

export interface HandoverView {
  id: string
  unitKind: string
  unitName: string
  shiftDate: string
  from: { userId: string; name: string }
  to: { userId: string; name: string } | null
  summary: string | null
  aiDraftText: string | null
  aiDraftSimulated: boolean
  createdAt: string | null
  signedAt: string | null
  signedBy: { userId: string; name: string } | null
  items: HandoverItem[]
}

export interface Colleague {
  userId: string
  name: string
  wardId: string | null
}

// ---------------------------------------------------------------- request bodies
export interface ScheduleStudyBody {
  roomId: string
  startsAt: string
  durationMinutes: number
}
export interface ExposureBody {
  kvp?: number
  mas?: number
  dapMgycm2?: number
  exposureMs?: number
}
export interface StudyFileBody {
  fileName: string
  kind: 'dicom' | 'zip' | 'image' | 'report'
  mimeType?: string
  sizeBytes?: number
  sha256?: string
  seriesNo?: number
  seriesDescription?: string
  instanceCount?: number
}
export interface ChecklistBody {
  checklist?: Record<string, boolean>
  burnedInNameChecked?: boolean
  contrast?: boolean
}
export interface EquipmentEventBody {
  roomId: string
  kind: 'downtime' | 'service' | 'calibration' | 'flat_field' | 'repair'
  startsAt?: string
  endsAt?: string
  dueOn?: string
  note?: string
}
export interface HandoverBody {
  toUserId?: string
  summary?: string
  useAiDraft: boolean
  items: { orderId?: string; flag: 'watch' | 'pending' | 'transfer' | 'info'; note: string }[]
}

// ---------------------------------------------------------------- queries
export function useRadMe() {
  return useQuery({ queryKey: [...KEY, 'me'], queryFn: () => clinicalGet<RadMe>(`${BASE}/me`), retry: false })
}

export function useWorklist() {
  return useQuery({
    queryKey: [...KEY, 'worklist'],
    queryFn: () => clinicalGet<WorklistResponse>(`${BASE}/worklist`),
    retry: false,
    refetchInterval: 15000,
  })
}

export function useStudy(studyId: string | null) {
  return useQuery({
    queryKey: [...KEY, 'study', studyId],
    enabled: !!studyId,
    queryFn: () => clinicalGet<StudyDetail>(`${BASE}/studies/${studyId}`),
    retry: false,
  })
}

export function useRooms() {
  return useQuery({ queryKey: [...KEY, 'rooms'], queryFn: () => clinicalGet<RoomRow[]>(`${BASE}/rooms`), retry: false, refetchInterval: 20000 })
}

export function useSchedule(date: string | null) {
  return useQuery({
    queryKey: [...KEY, 'schedule', date],
    queryFn: () => clinicalGet<ScheduleResponse>(`${BASE}/schedule${date ? `?date=${encodeURIComponent(date)}` : ''}`),
    retry: false,
  })
}

export function useEquipment() {
  return useQuery({ queryKey: [...KEY, 'equipment'], queryFn: () => clinicalGet<EquipmentResponse>(`${BASE}/equipment`), retry: false })
}

export function useRadHandovers() {
  return useQuery({ queryKey: [...KEY, 'handover'], queryFn: () => clinicalGet<HandoverView[]>(`${BASE}/handover`), retry: false })
}

export function useRadColleagues() {
  return useQuery({ queryKey: [...KEY, 'colleagues'], queryFn: () => clinicalGet<Colleague[]>(`${BASE}/handover/colleagues`), retry: false })
}

// ---------------------------------------------------------------- mutations
/** Any change can move a study between lists, rooms and the schedule, so refresh the whole radiology cache. */
function useRadMutation<TVars, TOut>(fn: (v: TVars) => Promise<TOut>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  })
}

export function useAcceptOrder() {
  return useRadMutation((orderId: string) => clinicalSend<{ orderId: string; studyId: string; status: string }>('POST', `${BASE}/orders/${orderId}/accept`))
}
export function useRejectOrder() {
  return useRadMutation((v: { orderId: string; reason: string }) => clinicalSend<{ orderId: string; status: string }>('POST', `${BASE}/orders/${v.orderId}/reject`, { reason: v.reason }))
}
export function useScheduleStudy() {
  return useRadMutation((v: { studyId: string } & ScheduleStudyBody) => {
    const { studyId, ...body } = v
    return clinicalSend<{ studyId: string; status: string; roomId: string; startsAt: string }>('POST', `${BASE}/studies/${studyId}/schedule`, body)
  })
}
export function useStartStudy() {
  return useRadMutation((v: { studyId: string; roomId?: string }) =>
    clinicalSend<{ studyId: string; status: string }>('POST', `${BASE}/studies/${v.studyId}/start`, v.roomId ? { roomId: v.roomId } : {}),
  )
}
export function useUpdateChecklist() {
  return useRadMutation((v: { studyId: string } & ChecklistBody) => {
    const { studyId, ...body } = v
    return clinicalSend<{ studyId: string; checklist: Record<string, unknown>; burnedInNameChecked: boolean; contrast: boolean }>('POST', `${BASE}/studies/${studyId}/checklist`, { checklist: {}, ...body })
  })
}
export function useAddFile() {
  return useRadMutation((v: { studyId: string; file: StudyFileBody }) =>
    clinicalSend<{ fileId: string; documentId: string; uploadedAt: string | null; withdrawableUntil: string; note: string }>('POST', `${BASE}/studies/${v.studyId}/files`, v.file),
  )
}
export function useWithdrawFile() {
  return useRadMutation((v: { studyId: string; fileId: string; reason: string }) =>
    clinicalSend<{ fileId: string; withdrawn: boolean; remainingFiles: number }>('POST', `${BASE}/studies/${v.studyId}/files/${v.fileId}/withdraw`, { reason: v.reason }),
  )
}
export function useSaveExposure() {
  return useRadMutation((v: { studyId: string } & ExposureBody) => {
    const { studyId, ...body } = v
    return clinicalSend<{ studyId: string; saved: boolean }>('POST', `${BASE}/studies/${studyId}/exposure`, body)
  })
}
export function useLinkPrior() {
  return useRadMutation((v: { studyId: string; priorStudyId: string }) =>
    clinicalSend<{ studyId: string; priorStudyId: string; linked: boolean }>('POST', `${BASE}/studies/${v.studyId}/priors`, { priorStudyId: v.priorStudyId }),
  )
}
export function useSubmitStudy() {
  return useRadMutation((studyId: string) => clinicalSend<{ studyId: string; status: string }>('POST', `${BASE}/studies/${studyId}/submit`))
}
export function useSetRoomStatus() {
  return useRadMutation((v: { roomId: string; status: RoomState; reason?: string }) =>
    clinicalSend<{ id: string; status: string }>('POST', `${BASE}/rooms/${v.roomId}/status`, { status: v.status, reason: v.reason }),
  )
}
export function useAddEquipmentEvent() {
  return useRadMutation((body: EquipmentEventBody) => clinicalSend<{ id: string }>('POST', `${BASE}/equipment/events`, body))
}
export function useCreateRadHandover() {
  return useRadMutation((body: HandoverBody) => clinicalSend<HandoverView>('POST', `${BASE}/handover`, body))
}
export function useSignRadHandover() {
  return useRadMutation((id: string) => clinicalSend<HandoverView>('POST', `${BASE}/handover/${id}/sign`))
}

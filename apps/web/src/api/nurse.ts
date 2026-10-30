// Nurse app API hooks (GET/POST /api/v1/nurse/*) plus the small request helper and the shift-handover
// types that the lab app reuses. Everything here is synthetic demo data; AI drafts are simulated.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '../lib/api'

// ---------------------------------------------------------------- http helper
export class StaffApiError extends Error {
  status: number
  issues?: { path: string; message: string }[]
  constructor(message: string, status: number, issues?: { path: string; message: string }[]) {
    super(message)
    this.status = status
    this.issues = issues
  }
}

/** JSON request that turns the API error shapes ({ errorMessage } / { message } / zod issues) into one readable message. */
export async function staffRequest<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  const res = await apiFetch(path, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  const data = (await res.json().catch(() => ({}))) as {
    errorMessage?: string
    message?: string | string[]
    issues?: { path: string; message: string }[]
  }
  if (!res.ok) {
    const issueText = data.issues?.length ? ` ${data.issues.map((i) => `${i.path ? i.path + ': ' : ''}${i.message}`).join('; ')}` : ''
    const msg = data.errorMessage ?? (Array.isArray(data.message) ? data.message.join('; ') : data.message) ?? `Request failed (${res.status})`
    throw new StaffApiError(`${msg}${issueText}`.trim(), res.status, data.issues)
  }
  return data as T
}

export function errMessage(e: unknown, fallback = 'Something went wrong. Try again.'): string {
  return e instanceof Error && e.message ? e.message : fallback
}

// ---------------------------------------------------------------- shared handover types
export type HandoverFlag = 'watch' | 'pending' | 'transfer' | 'info'

export interface HandoverItem {
  id: string
  admissionId: string | null
  patientPersonId: string | null
  patientName: string | null
  bedId: string | null
  bedNo: string | null
  orderId: string | null
  flag: HandoverFlag | string
  note: string
  fromAiDraft: boolean
  doneAt: string | null
}

export interface HandoverView {
  id: string
  unitKind: string
  unitName: string
  wardId: string | null
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

export interface HandoverCreateInput {
  toUserId?: string
  summary?: string
  useAiDraft: boolean
  items: { admissionId?: string; bedId?: string; orderId?: string; flag: HandoverFlag; note: string; fromAiDraft: boolean }[]
}

// ---------------------------------------------------------------- types
export type Acuity = 'free' | 'stable' | 'watch' | 'critical'

export interface NurseBed {
  bedId: string
  bedNo: string
  bedType: string
  bedStatus: string
  wardId: string
  ward: string
  admissionId: string | null
  patientPersonId: string | null
  patientName: string | null
  ipNumber: string | null
  diagnosis: string | null
  latestNews: number | null
  latestNewsAt: string | null
  acuity: Acuity
  mine: boolean
}

export interface NurseBoard {
  ward: { id: string; code: string; name: string } | null
  wards: { id: string; code: string; name: string }[]
  kpis: {
    bedsTotal: number
    bedsOccupied: number
    myPatients: number
    earlyWarning: number
    dosesDueNextHour: number
    overdueDoses: number
    openTasks: number
    openEscalations: number
    pendingOrders: number
  }
  beds: NurseBed[]
}

export interface NurseMe {
  userId: string
  personId: string
  fullName: string
  hospitalId: string
  wardId: string | null
  role: 'nurse'
}

export interface VitalRow {
  id: string
  observedAt: string
  respRate: number
  spo2: number
  onOxygen: boolean
  systolic: number
  diastolic: number | null
  pulse: number
  tempC: number
  avpu: string
  newsScore: number
  newsBand: string
  note: string | null
  recordedBy: string
}

export interface BedDetail {
  bed: { id: string; bedNo: string; bedType: string; status: string; wardId: string; ward: string }
  admission: null | {
    id: string
    ipNumber: string | null
    admittedAt: string | null
    diet: string | null
    mobility: string | null
    diagnosis: string | null
    expectedDischarge: string | null
  }
  patient?: {
    personId: string
    fullName: string
    age: number | null
    sex: string | null
    bloodGroup: string | null
    allergies: { substance: string; reaction: string | null; severity: string | null }[]
  }
  team?: { role: string; name: string }[]
  vitals?: VitalRow[]
  tasks?: { id: string; kind: string; title: string; dueAt: string | null; doneAt: string | null; note: string | null; mine: boolean }[]
  medOrders?: {
    id: string
    medicine: string
    dose: string
    route: string
    frequency: string
    isPrn: boolean
    instructions: string | null
    startAt: string | null
    stopAt: string | null
  }[]
  escalations?: { id: string; level: number; newsScore: number; pagedRole: string; pagedAt: string | null; acknowledgedAt: string | null; outcome: string | null }[]
  notes?: NursingNote[]
  orders?: { id: string; orderRef: string; type: string; details: string; priority: string; status: string; createdAt: string | null }[]
}

export interface NursingNote {
  id: string
  kind: 'note' | 'sbar'
  body: string | null
  sbar: { situation?: string; background?: string; assessment?: string; recommendation?: string } | null
  author: string
  createdAt: string | null
}

export interface NurseTask {
  id: string
  admissionId: string
  bedNo: string | null
  patientName: string
  kind: string
  title: string
  dueAt: string | null
  doneAt: string | null
  late: boolean
  note: string | null
  assignedTo: { userId: string; name: string } | null
}

export type DoseStatus = 'due' | 'overdue' | 'given' | 'withheld' | 'refused' | 'missed' | 'prn'
export interface MarDose {
  medOrderId: string
  admissionId: string
  patientPersonId: string
  patientName: string
  bedNo: string | null
  medicine: string
  dose: string
  route: string
  frequency: string
  instructions: string | null
  dueAt: string | null
  isPrn: boolean
  status: DoseStatus
  givenAt: string | null
  reason: string | null
}
export interface MarResponse {
  date: string
  summary: { total: number; given: number; due: number; overdue: number; notGiven: number }
  doses: MarDose[]
}

export type OrderStatus = 'open' | 'accepted' | 'in_progress' | 'done' | 'rejected' | string
export interface NurseOrder {
  id: string
  orderRef: string
  type: string
  details: string
  priority: 'stat' | 'urgent' | 'routine' | string
  status: OrderStatus
  bedNo: string | null
  patientName: string
  orderedBy: string
  createdAt: string | null
  dueAt: string | null
  acceptedAt: string | null
  completedAt: string | null
  rejectedReason: string | null
  clinicalNote: string | null
  actionable: boolean
}

export interface WardStock {
  wardId: string
  items: {
    id: string
    medicineId: string
    medicine: string
    form: string | null
    quantity: number
    parLevel: number
    level: 'ok' | 'low' | 'out'
    updatedAt: string | null
  }[]
  requests: {
    id: string
    medicineId: string
    medicine: string
    quantity: number
    status: string
    note: string | null
    requestedAt: string | null
    fulfilledAt: string | null
  }[]
}

export interface NurseAlerts {
  clinicalAlerts: {
    id: string
    kind: string
    severity: string
    title: string
    detail: string | null
    patientName: string | null
    bedNo: string | null
    raisedAt: string | null
    acknowledgedAt: string | null
  }[]
  escalations: { id: string; level: number; newsScore: number; pagedRole: string; pagedAt: string | null; patientName: string; bedNo: string | null }[]
  overdueDoses: MarDose[]
}

export interface VitalsInput {
  respRate: number
  spo2: number
  onOxygen: boolean
  systolic: number
  diastolic?: number
  pulse: number
  tempC: number
  avpu: 'A' | 'C' | 'V' | 'P' | 'U'
  glucoseMgDl?: number
  painScore?: number
  note?: string
}

export interface VitalsResult {
  vitalSetId: string
  observedAt: string
  newsScore: number
  newsParts: { respRate: number; spo2: number; oxygen: number; systolic: number; pulse: number; consciousness: number; temperature: number }
  band: 'low' | 'low_medium' | 'medium' | 'high'
  guidance: string
  escalation: null | {
    id: string
    level: number
    pagedRole: string
    step: { step: number; notifyRole: string; withinMinutes: number } | null
  }
}

export interface AdministerInput {
  medOrderId: string
  dueAt: string
  outcome: 'given' | 'withheld' | 'refused' | 'missed'
  reason?: string
  doseGiven?: string
  bandScanned: boolean
  drugScanned: boolean
}

export interface NurseTaskInput {
  admissionId: string
  kind: 'vitals' | 'dressing' | 'mobilise' | 'io_chart' | 'education' | 'medication' | 'other'
  title: string
  dueAt: string
  note?: string
}

export type NoteInput =
  | { kind: 'note'; body: string }
  | { kind: 'sbar'; sbar: { situation: string; background: string; assessment: string; recommendation: string } }

// ---------------------------------------------------------------- queries
const KEY = ['nurse'] as const
const base = '/v1/nurse'

export function useNurseMe() {
  return useQuery({ queryKey: [...KEY, 'me'], queryFn: () => staffRequest<NurseMe>('GET', `${base}/me`), retry: false })
}

export function useNurseBoard(wardId?: string) {
  return useQuery({
    queryKey: [...KEY, 'board', wardId ?? 'own'],
    queryFn: () => staffRequest<NurseBoard>('GET', `${base}/ward/board${wardId ? `?wardId=${wardId}` : ''}`),
    refetchInterval: 15000,
    retry: false,
  })
}

export function useBedDetail(bedId: string | null | undefined) {
  return useQuery({
    queryKey: [...KEY, 'bed', bedId],
    enabled: !!bedId,
    queryFn: () => staffRequest<BedDetail>('GET', `${base}/beds/${bedId}`),
    retry: false,
  })
}

export function useVitalsHistory(admissionId: string | null | undefined) {
  return useQuery({
    queryKey: [...KEY, 'vitals', admissionId],
    enabled: !!admissionId,
    queryFn: () => staffRequest<VitalRow[]>('GET', `${base}/admissions/${admissionId}/vitals`),
    retry: false,
  })
}

export function useNotes(admissionId: string | null | undefined) {
  return useQuery({
    queryKey: [...KEY, 'notes', admissionId],
    enabled: !!admissionId,
    queryFn: () => staffRequest<NursingNote[]>('GET', `${base}/admissions/${admissionId}/notes`),
    retry: false,
  })
}

export function useNurseTasks(scope: 'mine' | 'ward' = 'mine', status: 'open' | 'done' | 'all' = 'all') {
  return useQuery({
    queryKey: [...KEY, 'tasks', scope, status],
    queryFn: () => staffRequest<NurseTask[]>('GET', `${base}/tasks?scope=${scope}&status=${status}`),
    refetchInterval: 20000,
    retry: false,
  })
}

export function useMar(date?: string) {
  return useQuery({
    queryKey: [...KEY, 'mar', date ?? 'today'],
    queryFn: () => staffRequest<MarResponse>('GET', `${base}/mar${date ? `?date=${date}` : ''}`),
    refetchInterval: 20000,
    retry: false,
  })
}

export function useNurseOrders(status: string = 'all') {
  return useQuery({
    queryKey: [...KEY, 'orders', status],
    queryFn: () => staffRequest<NurseOrder[]>('GET', `${base}/orders?status=${status}`),
    refetchInterval: 15000,
    retry: false,
  })
}

export function useNurseHandovers() {
  return useQuery({ queryKey: [...KEY, 'handover'], queryFn: () => staffRequest<HandoverView[]>('GET', `${base}/handover`), retry: false })
}

export function useNurseColleagues() {
  return useQuery({ queryKey: [...KEY, 'colleagues'], queryFn: () => staffRequest<Colleague[]>('GET', `${base}/handover/colleagues`), retry: false })
}

export function useWardStock() {
  return useQuery({ queryKey: [...KEY, 'stock'], queryFn: () => staffRequest<WardStock>('GET', `${base}/ward-stock`), retry: false })
}

export function useNurseAlerts() {
  return useQuery({
    queryKey: [...KEY, 'alerts'],
    queryFn: () => staffRequest<NurseAlerts>('GET', `${base}/alerts`),
    refetchInterval: 15000,
    retry: false,
  })
}

// ---------------------------------------------------------------- mutations
function useNurseMutation<I, O>(fn: (input: I) => Promise<O>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: KEY })
    },
  })
}

export function useRecordVitals() {
  return useNurseMutation(({ admissionId, ...body }: VitalsInput & { admissionId: string }) =>
    staffRequest<VitalsResult>('POST', `${base}/admissions/${admissionId}/vitals`, body),
  )
}

export function useAddNote() {
  return useNurseMutation(({ admissionId, ...body }: NoteInput & { admissionId: string }) =>
    staffRequest<{ id: string; createdAt: string | null }>('POST', `${base}/admissions/${admissionId}/notes`, body),
  )
}

export function useCompleteTask() {
  return useNurseMutation(({ id, note }: { id: string; note?: string }) =>
    staffRequest<{ id: string; done: boolean }>('POST', `${base}/tasks/${id}/done`, { note }),
  )
}

export function useCreateTask() {
  return useNurseMutation((input: NurseTaskInput) => staffRequest<{ id: string }>('POST', `${base}/tasks`, input))
}

export function useAdminister() {
  return useNurseMutation((input: AdministerInput) =>
    staffRequest<{ id: string; outcome: string; givenAt: string | null }>('POST', `${base}/mar/administer`, input),
  )
}

export function useOrderAction() {
  return useNurseMutation(({ id, action, reason }: { id: string; action: 'accept' | 'reject' | 'complete'; reason?: string }) =>
    staffRequest<{ id: string; status: string }>('POST', `${base}/orders/${id}/${action}`, action === 'reject' ? { reason } : undefined),
  )
}

export function useCreateHandover() {
  return useNurseMutation((input: HandoverCreateInput) => staffRequest<HandoverView>('POST', `${base}/handover`, input))
}

export function useSignHandover() {
  return useNurseMutation((id: string) => staffRequest<HandoverView>('POST', `${base}/handover/${id}/sign`))
}

export function useHandoverItemDone() {
  return useNurseMutation(({ id, itemId }: { id: string; itemId: string }) =>
    staffRequest<{ ok: true }>('POST', `${base}/handover/${id}/items/${itemId}/done`),
  )
}

export function useRequestStock() {
  return useNurseMutation((input: { medicineId: string; quantity: number; note?: string }) =>
    staffRequest<{ id: string; status: string }>('POST', `${base}/ward-stock/requests`, input),
  )
}

export function useCountStock() {
  return useNurseMutation(({ id, quantity }: { id: string; quantity: number }) =>
    staffRequest<{ id: string; quantity: number }>('POST', `${base}/ward-stock/${id}/count`, { quantity }),
  )
}

export function useAckAlert() {
  return useNurseMutation((id: string) => staffRequest<{ id: string; acknowledged: boolean }>('POST', `${base}/alerts/${id}/ack`))
}

export function useAckEscalation() {
  return useNurseMutation(({ id, outcome }: { id: string; outcome?: string }) =>
    staffRequest<{ id: string; acknowledged: boolean }>('POST', `${base}/escalations/${id}/ack`, { outcome }),
  )
}

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { clinicalDownload, clinicalGet, clinicalSend } from './clinicalHttp'

// Pharmacist app: hooks for /api/v1/pharmacist (apps/api/src/staff/pharmacist).
// A pharmacist only sees what is on an e-signed prescription sent to their pharmacy. Synthetic data only.

const BASE = '/v1/pharmacist'
const KEY = ['pharmacist'] as const

export type RxStage = 'pending' | 'verified' | 'ready' | 'collected'
export type CounterState = 'on' | 'break' | 'off'
export type StockLevel = 'ok' | 'low' | 'out'

export interface PharmacistMe {
  userId: string
  fullName: string
  pharmacyId: string
  pharmacyName: string | null
  licenceNo: string | null
  counters: number | null
  roleLabel: string | null
  shift: string | null
  registrationNo: string | null
  counter: { counter: string | null; state: CounterState | string; since: string | null } | null
}

export interface QueueRow {
  prescriptionId: string
  rxNumber: string
  tokenLabel: string | null
  patientName: string
  age: number | null
  sex: string | null
  bloodGroup: string | null
  doctor: { name: string; hprId: string | null }
  issuedAt: string | null
  validUntil: string | null
  status: string
  stage: RxStage
  itemCount: number
  waitingMinutes: number
}

export interface QueueResponse {
  kpis: { waiting: number; readyToCollect: number; dispensedToday: number; lowStockBatches: number; expiringWithin30Days: number }
  prescriptions: QueueRow[]
}

export interface StockBatch {
  stockItemId: string
  batchNo: string
  expiryDate: string
  quantity: number
  unitPrice: number
  blocked: boolean
  blockedReason: string | null
}

export interface Substitute {
  medicineId: string
  medicine: string
  form: string
  kind: string
  note: string | null
  requiresDoctorOk: boolean
  inStock: number
}

export interface RxLine {
  itemId: string
  medicineId: string
  medicine: string
  form: string
  schedule: string
  dose: string | null
  frequency: string | null
  durationDays: number | null
  withFood: string | null
  instructions: string | null
  prescribed: number
  dispensed: number
  remaining: number
  outOfStockMarked: boolean
  inStock: number
  fefoNextBatch: StockBatch | null
  batches: StockBatch[]
  substitutes: Substitute[]
}

export type RxCheckCode = 'esignature' | 'qr' | 'hpr' | 'validity' | 'allergy' | 'interaction' | 'stock'
export interface RxCheck {
  code: RxCheckCode
  passed: boolean
  severity: 'ok' | 'warning' | 'blocker'
  detail: string
}

export interface RxDetail {
  prescription: {
    id: string
    rxNumber: string
    status: string
    issuedAt: string | null
    validUntil: string | null
    signatureMethod: string | null
    tokenLabel: string | null
    verifiedAt: string | null
    readyAt: string | null
    collectedAt: string | null
    smsSentAt: string | null
  }
  patient: { personId: string; fullName: string; age: number | null; sex: string | null }
  doctor: { name: string; hprId: string | null; councilRegNo: string | null }
  checks: RxCheck[]
  lastVerification: { code: string; passed: boolean; detail: string; checkedAt: string | null }[]
  items: RxLine[]
}

export interface PatientHistory {
  patientName: string
  allergies: string[]
  lastDispensedAt: string | null
  history: {
    dispensedAt: string | null
    rxNumber: string
    medicine: string
    quantity: number
    prescribed: number
    type: 'full' | 'partial'
    doctor: string
    pharmacy: string
    substitute: boolean
  }[]
}

export interface RefillRow {
  patientPersonId: string
  patientName: string
  rxNumber: string
  medicine: string
  lastDispensedAt: string | null
  refillDueAt: string | null
  overdue: boolean
}

export interface StockRow {
  medicineId: string
  medicine: string
  form: string
  schedule: string
  category: string | null
  onHand: number
  reorderAt: number | null
  level: StockLevel
  batches: number
  nearestExpiry: string | null
  usedPerDay: number
  nextSupply: string | null
}

export interface StockResponse {
  summary: { itemsTracked: number; low: number; out: number; blockedBatches: number; stockValue: number; indentPending: number }
  items: StockRow[]
}

export interface ExpiryRow {
  stockItemId: string
  medicineId: string
  medicine: string
  batchNo: string
  expiryDate: string
  daysLeft: number
  quantity: number
  valueAtCost: number
  suggestedAction: 'quarantine' | 'return_to_supplier' | 'use_first' | string
}

export interface ExpiryResponse {
  rule: string
  within30Days: ExpiryRow[]
  within31to90Days: ExpiryRow[]
  within30DaysValue: number
}

export interface LogRow {
  dispensedAt: string | null
  rxNumber: string
  pharmacist: string
  medicine: string
  outcome: string
  quantity: number
  batchNo: string | null
  batchOverrideReason: string | null
}

export interface RecallRow {
  recallId: string
  recallRef: string
  source: string
  medicine: string
  batchNo: string | null
  recallClass: string | null
  issuedOn: string
  title: string
  reason: string | null
  urgent: boolean
  actionText: string | null
  status: 'action_needed' | 'review' | 'confirmed_off_shelf' | 'not_stocked' | string
  qtyOnShelf: number | null
  confirmedAt: string | null
  note: string | null
}

export interface WardRequestRow {
  id: string
  ward: string
  medicine: string
  quantity: number
  status: 'requested' | 'approved' | 'issued' | 'rejected' | string
  note: string | null
  requestedBy: string
  requestedAt: string | null
}

export interface HandoverQr {
  rxNumber: string
  handoverCode: string
  payload: string
  readyAt: string | null
  collectedAt: string | null
  note: string
}

export interface DispenseResult {
  prescriptionId: string
  status: string
  partial: boolean
  canDispenseMore: boolean
  readyToCollect: boolean
  dispensed: { itemId: string; dispensingId: string; batchNo: string | null; quantity: number; outcome: string }[]
  shortfalls: { itemId: string; medicine: string; missing: number }[]
  balanceOpen: { itemId: string; medicine: string; remaining: number }[]
  smsSent: boolean
  smsNote?: string
}

export interface VerifyResult {
  verified: boolean
  tokenLabel: string
  checks: RxCheck[]
}

// ---------------------------------------------------------------- request bodies
export interface DispenseLineBody {
  itemId: string
  outcome: 'dispensed' | 'substitute' | 'out_of_stock'
  quantity?: number
  stockItemId?: string
  substituteMedicineId?: string
  batchOverrideReason?: string
  noteToDoctor?: string
  prescriberAgreed?: boolean
}
export interface StockActionBody {
  action: 'quarantine' | 'return_to_supplier' | 'write_off' | 'adjustment'
  reason: string
  quantity?: number
}

// ---------------------------------------------------------------- queries
export function usePharmacistMe() {
  return useQuery({ queryKey: [...KEY, 'me'], queryFn: () => clinicalGet<PharmacistMe>(`${BASE}/me`), retry: false })
}

export function useQueue() {
  return useQuery({ queryKey: [...KEY, 'queue'], queryFn: () => clinicalGet<QueueResponse>(`${BASE}/queue`), retry: false, refetchInterval: 15000 })
}

export function useRxDetail(id: string | null) {
  return useQuery({
    queryKey: [...KEY, 'rx', id],
    enabled: !!id,
    queryFn: () => clinicalGet<RxDetail>(`${BASE}/prescriptions/${id}`),
    retry: false,
  })
}

export function usePatientHistory(personId: string | null) {
  return useQuery({
    queryKey: [...KEY, 'history', personId],
    enabled: !!personId,
    queryFn: () => clinicalGet<PatientHistory>(`${BASE}/patients/${personId}/history`),
    retry: false,
  })
}

export function useRefills(withinDays: number) {
  return useQuery({ queryKey: [...KEY, 'refills', withinDays], queryFn: () => clinicalGet<RefillRow[]>(`${BASE}/refills?withinDays=${withinDays}`), retry: false })
}

export function useStock(level: string, q: string) {
  const params = new URLSearchParams()
  if (level) params.set('level', level)
  if (q) params.set('q', q)
  const qs = params.toString()
  return useQuery({
    queryKey: [...KEY, 'stock', level, q],
    queryFn: () => clinicalGet<StockResponse>(`${BASE}/stock${qs ? `?${qs}` : ''}`),
    retry: false,
    placeholderData: (prev) => prev,
  })
}

export function useMedicineBatches(medicineId: string | null) {
  return useQuery({
    queryKey: [...KEY, 'batches', medicineId],
    enabled: !!medicineId,
    queryFn: () => clinicalGet<StockBatch[]>(`${BASE}/stock/medicines/${medicineId}/batches`),
    retry: false,
  })
}

export function useExpiry() {
  return useQuery({ queryKey: [...KEY, 'expiry'], queryFn: () => clinicalGet<ExpiryResponse>(`${BASE}/expiry`), retry: false })
}

export function useDispensingLog(from: string, to: string) {
  return useQuery({
    queryKey: [...KEY, 'log', from, to],
    queryFn: () => clinicalGet<LogRow[]>(`${BASE}/dispensing-log?from=${from}&to=${to}`),
    retry: false,
  })
}

export function useRecalls() {
  return useQuery({ queryKey: [...KEY, 'recalls'], queryFn: () => clinicalGet<RecallRow[]>(`${BASE}/recalls`), retry: false })
}

export function useWardRequests() {
  return useQuery({ queryKey: [...KEY, 'ward-requests'], queryFn: () => clinicalGet<WardRequestRow[]>(`${BASE}/ward-requests`), retry: false })
}

export function downloadDispensingCsv(from: string, to: string): Promise<Blob> {
  return clinicalDownload(`${BASE}/dispensing-log/export?from=${from}&to=${to}`)
}

// ---------------------------------------------------------------- mutations
function usePharmMutation<TVars, TOut>(fn: (v: TVars) => Promise<TOut>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  })
}

export function useSetCounter() {
  return usePharmMutation((v: { counter?: string; state: CounterState }) => clinicalSend<{ counter: string | null; state: string }>('POST', `${BASE}/counter`, v))
}
export function useScanRx() {
  return usePharmMutation((qrToken: string) => clinicalSend<{ prescriptionId: string; rxNumber: string; status: string }>('POST', `${BASE}/scan`, { qrToken }))
}
export function useVerifyRx() {
  return usePharmMutation((id: string) => clinicalSend<VerifyResult>('POST', `${BASE}/prescriptions/${id}/verify`))
}
export function useDispenseRx() {
  return usePharmMutation((v: { id: string; lines: DispenseLineBody[] }) => clinicalSend<DispenseResult>('POST', `${BASE}/prescriptions/${v.id}/dispense`, { lines: v.lines }))
}
export function useMarkReady() {
  return usePharmMutation((id: string) => clinicalSend<{ prescriptionId: string; readyToCollect: boolean }>('POST', `${BASE}/prescriptions/${id}/ready`))
}
export function useCollected() {
  return usePharmMutation((v: { id: string; qrToken?: string; collectedByName?: string }) =>
    clinicalSend<{ prescriptionId: string; collected: boolean }>('POST', `${BASE}/prescriptions/${v.id}/collected`, {
      ...(v.qrToken ? { qrToken: v.qrToken } : {}),
      ...(v.collectedByName ? { collectedByName: v.collectedByName } : {}),
    }),
  )
}
export function useStockAction() {
  return usePharmMutation((v: { stockItemId: string } & StockActionBody) => {
    const { stockItemId, ...body } = v
    return clinicalSend<{ stockItemId: string; action: string; batchNo: string }>('POST', `${BASE}/stock/batches/${stockItemId}/action`, body)
  })
}
export function useConfirmRecall() {
  return usePharmMutation((v: { id: string; status: 'confirmed_off_shelf' | 'not_stocked'; qtyOnShelf?: number; note?: string }) => {
    const { id, ...body } = v
    return clinicalSend<{ recallId: string; status: string }>('POST', `${BASE}/recalls/${id}/confirm`, body)
  })
}
export function useDecideWardRequest() {
  return usePharmMutation((v: { id: string; decision: 'issued' | 'rejected'; note?: string }) => {
    const { id, ...body } = v
    return clinicalSend<{ id: string; status: string }>('POST', `${BASE}/ward-requests/${id}/decide`, body)
  })
}

/** Fetches the handover QR payload on demand (it is only valid once the prescription is ready). */
export async function fetchHandoverQr(id: string): Promise<HandoverQr> {
  return clinicalGet<HandoverQr>(`${BASE}/prescriptions/${id}/handover-qr`)
}

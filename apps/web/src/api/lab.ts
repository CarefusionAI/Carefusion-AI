// Lab technician API hooks (GET/POST /api/v1/lab/*). All people and results are synthetic demo data.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { staffRequest } from './nurse'
import type { Colleague, HandoverCreateInput, HandoverView } from './nurse'

export type LabStage = 'new' | 'awaiting_sample' | 'running' | 'to_verify' | 'to_release'
export type LabPriority = 'stat' | 'urgent' | 'routine'
export type ResultFlag = 'N' | 'L' | 'H' | 'LL' | 'HH' | 'A' | null

export interface LabMe {
  userId: string
  personId: string
  fullName: string
  hospitalId: string
  role: 'lab_tech'
}

export interface LabWorklistOrder {
  orderId: string
  orderRef: string
  patientPersonId: string
  patientName: string
  age: number | null
  sex: string | null
  priority: LabPriority | string
  status: string
  stage: LabStage
  tests: string | null
  from: string
  orderedBy: string
  orderedAt: string | null
  waitingMinutes: number
}

export interface LabWorklist {
  kpis: {
    openOrders: number
    statOrders: number
    awaitingSample: number
    oldestAwaitingMinutes: number
    toVerify: number
    toRelease: number
    samplesCollectedToday: number
    samplesRejectedToday: number
    resultsReleasedToday: number
  }
  orders: LabWorklistOrder[]
}

export interface LabTest {
  itemId: string
  testCode: string
  name: string
  category: string | null
  specimenType: string | null
  tubeType: string | null
  unit: string | null
  refLow: number | null
  refHigh: number | null
  criticalLow: number | null
  criticalHigh: number | null
  refText: string | null
  fastingRequired: boolean
  tatTargetMinutes: number | null
  panelCode: string | null
  status: string
}

export interface LabSpecimen {
  id: string
  barcode: string
  tubeType: string | null
  tubeCount: number
  fasting: boolean | null
  status: string
  collectedAt: string | null
  collectedBy: string | null
  sendBy: string | null
  receivedAt: string | null
  rejectedReason: string | null
  rejectedAt: string | null
}

export interface LabResultValue {
  id: string
  testCode: string
  testName: string
  unit: string | null
  valueNum: number | null
  valueText: string | null
  refLow: number | null
  refHigh: number | null
  flag: ResultFlag
  isCritical: boolean
  deltaPrev: number | null
  prevValue: number | null
}

export interface LabResult {
  id: string
  status: 'draft' | 'preliminary' | 'verified' | 'released' | 'amended' | string
  enteredBy: string
  verifiedBy: string | null
  releasedBy: string | null
  releasedAt: string | null
  clinicalComment: string | null
  awaitingEsign: boolean
  createdAt: string | null
  values: LabResultValue[]
}

export interface LabOrderDetail {
  order: { id: string; orderRef: string; status: string; priority: string; details: string; orderedBy: string | null; orderedAt: string | null }
  patient: { personId: string; fullName: string; age: number | null; sex: string | null; location: string; ipNumber: string | null }
  tests: LabTest[]
  specimens: LabSpecimen[]
  results: LabResult[]
}

export interface LabResultSaved {
  resultId: string
  result: LabResult
  criticalValues: LabResultValue[]
}

export interface LabRecentResult {
  resultId: string
  orderRef: string
  patientName: string
  tests: string
  releasedAt: string | null
  hasCritical: boolean
}

export interface LabCritical {
  uncalled: {
    resultValueId: string
    orderRef: string
    patientName: string
    bedNo: string | null
    testCode: string
    testName: string
    valueNum: number | null
    unit: string | null
    flag: ResultFlag
    since: string | null
    callDoctor: { userId: string; name: string }
  }[]
  calls: {
    id: string
    resultValueId: string
    patientName: string
    testCode: string
    valueNum: number | null
    unit: string | null
    calledAt: string | null
    calledBy: string
    calledTo: string | null
    calledToUserId: string | null
    readBackConfirmed: boolean
    readBackAt: string | null
    note: string | null
  }[]
}

export interface LabInstrument {
  id: string
  name: string
  kind: string | null
  model: string | null
  serialNo: string | null
  status: 'ok' | 'calibrating' | 'down' | 'retired' | string
  lastCalibratedAt: string | null
  nextCalibrationDue: string | null
  location: string | null
}

export interface LabReagentLot {
  id: string
  reagent: string
  lotNo: string
  openedAt: string | null
  expiryDate: string | null
  status: string
  instrument: string | null
}

export interface LabQcRun {
  id: string
  runAt: string
  testCode: string
  testName: string
  unit: string | null
  qcLevel: number
  valueNum: number
  targetMean: number
  targetSd: number
  zScore: number
  westgardRule: string | null
  accepted: boolean
  result: 'pass' | 'warning' | 'reject'
  comment: string | null
  instrument: string
  instrumentId: string
}

export interface LabQc {
  summary: { runsLast24h: number; passedLast24h: number; warnings: number; rejected: number }
  runs: LabQcRun[]
  series: { key: string; instrument: string; testCode: string; qcLevel: number; points: LabQcRun[] }[]
  instruments: LabInstrument[]
  reagentLots: LabReagentLot[]
}

export interface LabTat {
  windowDays: number
  targetsMinutes: Record<string, number>
  byPriority: { priority: string; orders: number; medianMinutes: number; targetMinutes: number | null }[]
  withinTargetPercent: number | null
  statMedianByDay: { day: string; medianMinutes: number; orders: number }[]
  slowestTests: { testCode: string; testName: string; orders: number; medianMinutes: number }[]
  rejectedSamplePercent: number
}

export interface ResultEntryInput {
  values: { testCode: string; valueNum?: number; valueText?: string }[]
  clinicalComment?: string
  action: 'save' | 'verify' | 'release'
}

export interface CollectInput {
  barcode?: string
  tubeType?: string
  tubeCount: number
  fasting?: boolean
}

export interface CriticalCallInput {
  resultValueId: string
  calledToName: string
  note?: string
  readBackConfirmed: boolean
}

export interface QcRunInput {
  instrumentId: string
  testCode: string
  qcLevel: number
  valueNum: number
  targetMean: number
  targetSd: number
  comment?: string
}

const KEY = ['lab'] as const
const base = '/v1/lab'

export function useLabMe() {
  return useQuery({ queryKey: [...KEY, 'me'], queryFn: () => staffRequest<LabMe>('GET', `${base}/me`), retry: false })
}

export function useLabWorklist() {
  return useQuery({
    queryKey: [...KEY, 'worklist'],
    queryFn: () => staffRequest<LabWorklist>('GET', `${base}/worklist`),
    refetchInterval: 15000,
    retry: false,
  })
}

export function useLabOrder(orderId: string | null | undefined) {
  return useQuery({
    queryKey: [...KEY, 'order', orderId],
    enabled: !!orderId,
    queryFn: () => staffRequest<LabOrderDetail>('GET', `${base}/orders/${orderId}`),
    retry: false,
  })
}

export function useLabRecent(hours = 24) {
  return useQuery({
    queryKey: [...KEY, 'recent', hours],
    queryFn: () => staffRequest<LabRecentResult[]>('GET', `${base}/results/recent?hours=${hours}`),
    retry: false,
  })
}

export function useLabCritical() {
  return useQuery({
    queryKey: [...KEY, 'critical'],
    queryFn: () => staffRequest<LabCritical>('GET', `${base}/critical`),
    refetchInterval: 20000,
    retry: false,
  })
}

export function useLabQc(days = 7) {
  return useQuery({ queryKey: [...KEY, 'qc', days], queryFn: () => staffRequest<LabQc>('GET', `${base}/qc?days=${days}`), retry: false })
}

export function useLabTat(days = 7) {
  return useQuery({ queryKey: [...KEY, 'tat', days], queryFn: () => staffRequest<LabTat>('GET', `${base}/tat?days=${days}`), retry: false })
}

export function useLabHandovers() {
  return useQuery({ queryKey: [...KEY, 'handover'], queryFn: () => staffRequest<HandoverView[]>('GET', `${base}/handover`), retry: false })
}

export function useLabColleagues() {
  return useQuery({ queryKey: [...KEY, 'colleagues'], queryFn: () => staffRequest<Colleague[]>('GET', `${base}/handover/colleagues`), retry: false })
}

function useLabMutation<I, O>(fn: (input: I) => Promise<O>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: KEY })
    },
  })
}

export function useLabOrderAction() {
  return useLabMutation(({ orderId, action, reason }: { orderId: string; action: 'accept' | 'reject'; reason?: string }) =>
    staffRequest<{ id: string; status: string }>('POST', `${base}/orders/${orderId}/${action}`, action === 'reject' ? { reason } : undefined),
  )
}

export function useCollectSpecimen() {
  return useLabMutation(({ orderId, ...body }: CollectInput & { orderId: string }) =>
    staffRequest<{ id: string; barcode: string; status: string; collectedAt: string | null }>('POST', `${base}/orders/${orderId}/specimens`, body),
  )
}

export function useSpecimenAction() {
  return useLabMutation(({ id, action, reason }: { id: string; action: 'receive' | 'reject'; reason?: string }) =>
    staffRequest<{ id: string; status: string }>('POST', `${base}/specimens/${id}/${action}`, action === 'reject' ? { reason } : undefined),
  )
}

export function useEnterResults() {
  return useLabMutation(({ orderId, ...body }: ResultEntryInput & { orderId: string }) =>
    staffRequest<LabResultSaved>('POST', `${base}/orders/${orderId}/results`, body),
  )
}

export function useResultStage() {
  return useLabMutation(({ resultId, stage }: { resultId: string; stage: 'verify' | 'release' }) =>
    staffRequest<LabResultSaved>('POST', `${base}/results/${resultId}/${stage}`),
  )
}

export function useLogCriticalCall() {
  return useLabMutation((input: CriticalCallInput) =>
    staffRequest<{ id: string; calledAt: string | null; readBackConfirmed: boolean }>('POST', `${base}/critical/calls`, input),
  )
}

export function useAckCriticalCall() {
  return useLabMutation(({ id, note }: { id: string; note?: string }) =>
    staffRequest<{ id: string; readBackConfirmed: boolean }>('POST', `${base}/critical/calls/${id}/ack`, { note }),
  )
}

export function useRecordQc() {
  return useLabMutation((input: QcRunInput) =>
    staffRequest<{ id: string; zScore: number; westgardRule: string | null; accepted: boolean; result: 'pass' | 'warning' | 'reject'; message: string }>(
      'POST',
      `${base}/qc/runs`,
      input,
    ),
  )
}

export function useInstrumentStatus() {
  return useLabMutation(({ id, status }: { id: string; status: 'ok' | 'calibrating' | 'down' | 'retired' }) =>
    staffRequest<{ id: string; status: string }>('POST', `${base}/instruments/${id}/status`, { status }),
  )
}

export function useLabCreateHandover() {
  return useLabMutation((input: HandoverCreateInput) => staffRequest<HandoverView>('POST', `${base}/handover`, input))
}

export function useLabSignHandover() {
  return useLabMutation((id: string) => staffRequest<HandoverView>('POST', `${base}/handover/${id}/sign`))
}

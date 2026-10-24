import { z } from 'zod'

/**
 * Staff apps (Phase 3c): nurse, lab technician, radiology technician, pharmacist.
 * Request schemas (Zod) and response shapes used by apps/api/src/staff/* and the web apps.
 * All people and records are synthetic demo data. Every AI output here is SIMULATED.
 * NOTE: not re-exported from index.ts yet; the coordinator adds `export * from './staff.js'`.
 */

const uuid = z.string().uuid()
const isoDateTime = z.string().datetime({ offset: true })
const optionalText = (max = 2000) => z.string().trim().max(max).optional()

// ---------------------------------------------------------------------------
// Common
// ---------------------------------------------------------------------------
import { OrderPrioritySchema } from './doctor.js'

export const StaffRejectRequestSchema = z.object({ reason: z.string().trim().min(3).max(500) })
export type StaffRejectRequest = z.infer<typeof StaffRejectRequestSchema>

export const StaffNoteRequestSchema = z.object({ note: optionalText(1000) })
export type StaffNoteRequest = z.infer<typeof StaffNoteRequestSchema>

export const HandoverFlagSchema = z.enum(['watch', 'pending', 'transfer', 'info'])
export const HandoverCreateRequestSchema = z.object({
  toUserId: uuid.optional(),
  summary: optionalText(4000),
  /** Ask the server for a SIMULATED AI draft that the staff member edits (never sent unreviewed). */
  useAiDraft: z.boolean().default(false),
  items: z
    .array(
      z.object({
        admissionId: uuid.optional(),
        bedId: uuid.optional(),
        orderId: uuid.optional(),
        flag: HandoverFlagSchema.default('info'),
        note: z.string().trim().min(1).max(1000),
        fromAiDraft: z.boolean().default(false),
      }),
    )
    .max(100)
    .default([]),
})
export type HandoverCreateRequest = z.infer<typeof HandoverCreateRequestSchema>

// ---------------------------------------------------------------------------
// Nurse
// ---------------------------------------------------------------------------
export const AvpuSchema = z.enum(['A', 'C', 'V', 'P', 'U'])
export const NurseVitalsRequestSchema = z.object({
  respRate: z.number().int().min(0).max(80),
  spo2: z.number().int().min(40).max(100),
  onOxygen: z.boolean().default(false),
  systolic: z.number().int().min(30).max(300),
  diastolic: z.number().int().min(20).max(200).optional(),
  pulse: z.number().int().min(10).max(300),
  tempC: z.number().min(25).max(45),
  avpu: AvpuSchema.default('A'),
  glucoseMgDl: z.number().min(10).max(1000).optional(),
  painScore: z.number().int().min(0).max(10).optional(),
  note: optionalText(1000),
  recordedOffline: z.boolean().default(false),
  observedAt: isoDateTime.optional(),
})
export type NurseVitalsRequest = z.infer<typeof NurseVitalsRequestSchema>

export const NursingTaskKindSchema = z.enum(['vitals', 'dressing', 'mobilise', 'io_chart', 'education', 'medication', 'other'])
export const NurseTaskCreateRequestSchema = z.object({
  admissionId: uuid,
  kind: NursingTaskKindSchema.default('other'),
  title: z.string().trim().min(2).max(200),
  dueAt: isoDateTime,
  assignedToUserId: uuid.optional(),
  note: optionalText(500),
})
export type NurseTaskCreateRequest = z.infer<typeof NurseTaskCreateRequestSchema>

export const MarOutcomeSchema = z.enum(['given', 'withheld', 'refused', 'missed'])
export const MarAdministerRequestSchema = z
  .object({
    medOrderId: uuid,
    dueAt: isoDateTime,
    outcome: MarOutcomeSchema,
    reason: optionalText(500),
    doseGiven: optionalText(100),
    bandScanned: z.boolean().default(false),
    drugScanned: z.boolean().default(false),
  })
  .refine((v) => v.outcome === 'given' || (v.reason ?? '').length > 0, {
    path: ['reason'],
    message: 'A reason is needed when a dose is withheld, refused or missed',
  })
export type MarAdministerRequest = z.infer<typeof MarAdministerRequestSchema>

export const NursingNoteRequestSchema = z
  .object({
    kind: z.enum(['note', 'sbar']).default('note'),
    body: z.string().trim().max(4000).optional(),
    sbar: z
      .object({
        situation: z.string().trim().min(1).max(1000),
        background: z.string().trim().min(1).max(1000),
        assessment: z.string().trim().min(1).max(1000),
        recommendation: z.string().trim().min(1).max(1000),
      })
      .optional(),
  })
  .refine((v) => (v.kind === 'sbar' ? !!v.sbar : (v.body ?? '').length > 0), {
    message: 'A note needs text (body), an SBAR note needs the four SBAR sections',
  })
export type NursingNoteRequest = z.infer<typeof NursingNoteRequestSchema>

export const WardStockRequestSchema = z.object({
  medicineId: uuid,
  quantity: z.number().positive().max(100000),
  note: optionalText(300),
})
export type WardStockRequestInput = z.infer<typeof WardStockRequestSchema>
export const WardStockCountRequestSchema = z.object({ quantity: z.number().min(0).max(100000) })
export type WardStockCountRequest = z.infer<typeof WardStockCountRequestSchema>

export const AckRequestSchema = z.object({ outcome: optionalText(500) })
export type AckRequest = z.infer<typeof AckRequestSchema>

export interface NurseBedRow {
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
  acuity: 'free' | 'stable' | 'watch' | 'critical'
  /** This nurse is on the admission team for the bed. */
  mine: boolean
}
export interface NurseBoardResponse {
  ward: { id: string; code: string; name: string } | null
  wards: { id: string; code: string; name: string }[]
  kpis: {
    bedsTotal: number
    bedsOccupied: number
    myPatients: number
    earlyWarning: number // latest NEWS >= 5
    dosesDueNextHour: number
    overdueDoses: number
    openTasks: number
    openEscalations: number
    pendingOrders: number
  }
  beds: NurseBedRow[]
}
export interface NurseVitalsResponse {
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

// ---------------------------------------------------------------------------
// Lab
// ---------------------------------------------------------------------------
export const CollectSpecimenRequestSchema = z.object({
  barcode: z.string().trim().min(3).max(60).optional(),
  tubeType: optionalText(60),
  tubeCount: z.number().int().min(1).max(20).default(1),
  fasting: z.boolean().optional(),
  sendBy: isoDateTime.optional(),
})
export type CollectSpecimenRequest = z.infer<typeof CollectSpecimenRequestSchema>

export const ResultValueInputSchema = z
  .object({
    testCode: z.string().trim().min(1).max(30),
    valueNum: z.number().finite().optional(),
    valueText: z.string().trim().max(200).optional(),
  })
  .refine((v) => v.valueNum !== undefined || (v.valueText ?? '').length > 0, { message: 'A value is needed' })
export const ResultEntryRequestSchema = z.object({
  values: z.array(ResultValueInputSchema).min(1).max(60),
  clinicalComment: optionalText(1000),
  /** save = draft; verify = draft + verified; release = verify + release to the ordering doctor. */
  action: z.enum(['save', 'verify', 'release']).default('save'),
})
export type ResultEntryRequest = z.infer<typeof ResultEntryRequestSchema>

export const CriticalCallRequestSchema = z
  .object({
    resultValueId: uuid,
    calledToUserId: uuid.optional(),
    calledToName: z.string().trim().max(120).optional(),
    note: optionalText(500),
    readBackConfirmed: z.boolean().default(false),
  })
  .refine((v) => !!v.calledToUserId || (v.calledToName ?? '').length > 0, {
    message: 'Say who took the call (calledToUserId or calledToName)',
  })
export type CriticalCallRequest = z.infer<typeof CriticalCallRequestSchema>

export const ReadBackRequestSchema = z.object({ note: optionalText(500) })
export type ReadBackRequest = z.infer<typeof ReadBackRequestSchema>

export const QcRunRequestSchema = z.object({
  instrumentId: uuid,
  testCode: z.string().trim().min(1).max(30),
  qcLevel: z.number().int().min(1).max(3).default(1),
  valueNum: z.number().finite(),
  targetMean: z.number().finite(),
  targetSd: z.number().positive(),
  reagentLotId: uuid.optional(),
  comment: optionalText(500),
})
export type QcRunRequest = z.infer<typeof QcRunRequestSchema>

export const InstrumentStatusRequestSchema = z.object({
  status: z.enum(['ok', 'calibrating', 'down', 'retired']),
  nextCalibrationDue: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
})
export type InstrumentStatusRequest = z.infer<typeof InstrumentStatusRequestSchema>

export interface LabResultValueRow {
  id: string
  testCode: string
  testName: string
  unit: string | null
  valueNum: number | null
  valueText: string | null
  refLow: number | null
  refHigh: number | null
  flag: 'N' | 'L' | 'H' | 'LL' | 'HH' | 'A' | null
  isCritical: boolean
  deltaPrev: number | null
}

// ---------------------------------------------------------------------------
// Radiology
// ---------------------------------------------------------------------------
export const ImagingModalitySchema = z.enum(['XR', 'CT', 'USG', 'MRI', 'ECHO', 'MAMMO', 'FLUORO', 'PORTABLE'])
export type ImagingModality = z.infer<typeof ImagingModalitySchema>

export const ScheduleStudyRequestSchema = z.object({
  roomId: uuid,
  startsAt: isoDateTime,
  durationMinutes: z.number().int().min(5).max(480).default(30),
})
export type ScheduleStudyRequest = z.infer<typeof ScheduleStudyRequestSchema>

export const StartStudyRequestSchema = z.object({ roomId: uuid.optional() })
export type StartStudyRequest = z.infer<typeof StartStudyRequestSchema>

export const StudyChecklistRequestSchema = z.object({
  checklist: z.record(z.string().max(60), z.boolean()).default({}),
  burnedInNameChecked: z.boolean().optional(),
  contrast: z.boolean().optional(),
})
export type StudyChecklistRequest = z.infer<typeof StudyChecklistRequestSchema>

export const StudyFileMetaRequestSchema = z.object({
  fileName: z.string().trim().min(1).max(200),
  kind: z.enum(['dicom', 'zip', 'image', 'report']).default('dicom'),
  mimeType: optionalText(100),
  sizeBytes: z.number().int().min(0).max(2_147_483_648).optional(),
  /** Hex SHA-256 of the file, when the browser computed it. */
  sha256: z.string().regex(/^[0-9a-fA-F]{64}$/).optional(),
  seriesNo: z.number().int().min(1).max(999).optional(),
  seriesDescription: optionalText(200),
  instanceCount: z.number().int().min(0).max(100000).optional(),
})
export type StudyFileMetaRequest = z.infer<typeof StudyFileMetaRequestSchema>

export const WithdrawFileRequestSchema = z.object({ reason: z.string().trim().min(3).max(500) })
export type WithdrawFileRequest = z.infer<typeof WithdrawFileRequestSchema>

export const ExposureRequestSchema = z.object({
  kvp: z.number().min(0).max(1000).optional(),
  mas: z.number().min(0).max(100000).optional(),
  dapMgycm2: z.number().min(0).max(1_000_000).optional(),
  exposureMs: z.number().int().min(0).max(1_000_000).optional(),
})
export type ExposureRequest = z.infer<typeof ExposureRequestSchema>

export const LinkPriorRequestSchema = z.object({ priorStudyId: uuid })
export type LinkPriorRequest = z.infer<typeof LinkPriorRequestSchema>

export const RoomStatusRequestSchema = z
  .object({ status: z.enum(['ok', 'down', 'maintenance']), reason: optionalText(300) })
  .refine((v) => v.status === 'ok' || (v.reason ?? '').length > 0, { path: ['reason'], message: 'Say why the room is out of service' })
export type RoomStatusRequest = z.infer<typeof RoomStatusRequestSchema>

export const EquipmentEventRequestSchema = z.object({
  roomId: uuid,
  kind: z.enum(['downtime', 'service', 'calibration', 'flat_field', 'repair']),
  startsAt: isoDateTime.optional(),
  endsAt: isoDateTime.optional(),
  dueOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  note: optionalText(500),
})
export type EquipmentEventRequest = z.infer<typeof EquipmentEventRequestSchema>

/** Simulated AI pre-read shown to the technician. Decision support only; the reporting doctor decides. */
export interface SimulatedImagingFlag {
  simulated: true
  label: 'Simulated AI output'
  confidenceLabel: 'VERIFIED' | 'SUPPORTED_WITH_CAUTION' | 'UNCERTAIN'
  finding: string
  confidence: number
  evidence: string[]
  disclaimer: string
}

// ---------------------------------------------------------------------------
// Pharmacist
// ---------------------------------------------------------------------------
export const PharmacyScanRequestSchema = z.object({ qrToken: z.string().trim().min(6).max(200) })
export type PharmacyScanRequest = z.infer<typeof PharmacyScanRequestSchema>

export const DispenseLineSchema = z
  .object({
    itemId: uuid,
    outcome: z.enum(['dispensed', 'substitute', 'out_of_stock']),
    quantity: z.number().positive().max(100000).optional(),
    /** Pick a specific batch; if omitted the server picks FEFO (first expiry, first out). */
    stockItemId: uuid.optional(),
    substituteMedicineId: uuid.optional(),
    /** Required when a specific batch is chosen although an earlier-expiring one is available (rule CF133). */
    batchOverrideReason: optionalText(300),
    noteToDoctor: optionalText(500),
    /** The pharmacist confirms the prescriber agreed to a therapeutic swap. */
    prescriberAgreed: z.boolean().default(false),
  })
  .refine((v) => v.outcome !== 'substitute' || !!v.substituteMedicineId, {
    path: ['substituteMedicineId'],
    message: 'Choose the substitute medicine',
  })
export const DispenseRequestSchema = z.object({
  lines: z.array(DispenseLineSchema).min(1).max(40),
})
export type DispenseRequest = z.infer<typeof DispenseRequestSchema>

export const CollectedRequestSchema = z.object({
  qrToken: z.string().trim().min(6).max(200).optional(),
  collectedByPersonId: uuid.optional(),
  collectedByName: optionalText(120),
})
export type CollectedRequest = z.infer<typeof CollectedRequestSchema>

export const StockActionRequestSchema = z.object({
  action: z.enum(['quarantine', 'return_to_supplier', 'write_off', 'adjustment']),
  reason: z.string().trim().min(3).max(300),
  /** Units to remove (or, for adjustment, the signed change). Default: the whole batch for return/write-off. */
  quantity: z.number().optional(),
})
export type StockActionRequest = z.infer<typeof StockActionRequestSchema>

export const CounterStateRequestSchema = z.object({
  counter: optionalText(20),
  state: z.enum(['on', 'break', 'off']),
})
export type CounterStateRequest = z.infer<typeof CounterStateRequestSchema>

export const RecallConfirmRequestSchema = z.object({
  status: z.enum(['confirmed_off_shelf', 'not_stocked']),
  qtyOnShelf: z.number().min(0).optional(),
  note: optionalText(300),
})
export type RecallConfirmRequest = z.infer<typeof RecallConfirmRequestSchema>

export const PharmacyWardRequestDecisionSchema = z.object({
  decision: z.enum(['issued', 'rejected']),
  note: optionalText(300),
})
export type PharmacyWardRequestDecision = z.infer<typeof PharmacyWardRequestDecisionSchema>

export type RxCheckCode = 'esignature' | 'qr' | 'hpr' | 'validity' | 'allergy' | 'interaction' | 'stock'
export interface RxCheckResult {
  code: RxCheckCode
  passed: boolean
  severity: 'ok' | 'warning' | 'blocker'
  detail: string
}
export interface PharmacyStockBatch {
  stockItemId: string
  batchNo: string
  expiryDate: string
  quantity: number
  unitPrice: number
  blocked: boolean
  blockedReason: string | null
}

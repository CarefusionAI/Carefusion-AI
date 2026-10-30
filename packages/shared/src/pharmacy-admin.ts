/**
 * Pharmacy admin console: response and request shapes of /api/v1/pharmacy-admin/*.
 * Types only (the API validates with its own zod schemas). Not yet exported from index.ts.
 * All data is synthetic demo data.
 */

export interface PharmacyOverview {
  pharmacy: { id: string; name: string; licenceNo: string; licenceValidUntil: string | null; counters: number }
  admin: { userId: string; name: string }
  asOf: string
  kpis: {
    prescriptionsFilledToday: number
    filledSameDayLastWeek: number
    filledTrendPct: number | null
    itemsInStock: number
    itemsPublished: number
    lowStockBatches: number
    blockedBatches: number
    stockValue: number
    expiring30DaysBatches: number
    expiring30DaysValue: number
  }
  dispensingWeek: { date: string; count: number }[]
  dispensing30Days: {
    total: number
    average: number
    peak: { date: string; count: number }
    monthOnMonthPct: number | null
    series: { date: string; count: number }[]
  }
  finder: { publishedPct: number; searchesThisWeek: number }
  stockByCategory: { category: string; skus: number; value: number }[]
  lowStock: { name: string; quantity: number; min: number }[]
  needsAction: { kind: 'recall' | 'purchase_order' | 'invite' | 'document'; id: string; title: string; detail: string; severity: string }[]
  pharmacistsOnShift: { userId: string; name: string; counter: string | null; state: 'on' | 'break' | 'off'; since: string | null; fillsToday: number }[]
}

export interface PharmacistsResponse {
  kpis: { accounts: number; active: number; invitesPending: number }
  items: {
    userId: string
    name: string
    registrationNo: string
    role: string | null
    shift: string | null
    status: string
    statusReason: string | null
    counter: string | null
    counterState: string | null
    lastActiveAt: string | null
    fillsToday: number
  }[]
  pendingInvites: { id: string; name: string; registrationNo: string | null; shift: string | null; sentAt: string; expiresAt: string; resendCount: number }[]
}

export interface PharmacyInviteRequest {
  fullName: string
  email: string
  registrationNo: string
  shift?: 'day' | 'night' | 'rotating'
}

export type StockLevel = 'ok' | 'low' | 'blocked' | 'expired'

export interface InventoryResponse {
  showing: number
  matching: number
  totalBatches: number
  totalSkus: number
  categories: string[]
  items: {
    id: string
    medicine: string
    form: string
    category: string | null
    schedule: string
    batchNo: string
    onHand: number
    min: number
    expiry: string
    unitPrice: number
    published: boolean
    blockedReason: string | null
    level: StockLevel
  }[]
}

export interface StockAdjustRequest {
  type: 'adjustment' | 'write_off' | 'return_to_supplier' | 'quarantine'
  quantity: number
  direction?: 'in' | 'out'
  reason: string
}

export type PurchaseOrderStatus = 'draft' | 'pending_approval' | 'approved' | 'held' | 'sent' | 'in_transit' | 'received' | 'cancelled'

export interface PurchaseOrderSummary {
  id: string
  poNumber: string
  supplier: string
  lines: number
  amount: number
  raisedBy: string
  date: string | null
  expectedOn: string | null
  isIndent: boolean
  status: PurchaseOrderStatus
  holdReason: string | null
  needsApproval: boolean
  approvedAt: string | null
  receivedAt: string | null
}

export interface PurchaseOrdersResponse {
  approvalThreshold: number
  kpis: { awaitingApproval: number; inTransit: number; spendThisMonth: number; onTimeDeliveryPct: number | null }
  items: PurchaseOrderSummary[]
}

export interface PurchaseOrderDetail extends PurchaseOrderSummary {
  canApprove: boolean
  lineItems: { id: string; medicine: string; quantity: number; unitCost: number; lineTotal: number; receivedQty: number }[]
}

export interface PurchaseOrderCreateRequest {
  supplierId: string
  expectedOn?: string
  isIndent?: boolean
  lines: { medicineId: string; quantity: number; unitCost: number }[]
}

export interface RecallsResponse {
  actionNeeded: number
  items: {
    id: string
    ref: string
    source: string
    title: string
    medicine: string
    batchNo: string | null
    recallClass: string
    issuedOn: string | null
    reason: string | null
    urgent: boolean
    actionText: string | null
    hasNotice: boolean
    status: 'action_needed' | 'review' | 'confirmed_off_shelf' | 'not_stocked'
    qtyOnShelf: number
    confirmedAt: string | null
    confirmedBy: string | null
    note: string | null
  }[]
}

export interface ExpiryResponse {
  summary: { expired: number; within30Days: number; within90Days: number; valueWithin30Days: number }
  byMonth: { month: string; value: number; batches: number }[]
  returnable: { batches: number; value: number; rule: string }
  batches: { medicine: string; batchNo: string; quantity: number; expiry: string; daysLeft: number; value: number; bucket: 'expired' | 'within_30_days' | 'within_90_days' }[]
}

export interface PharmacyComplianceResponse {
  licence: { number: string; validUntil: string | null }
  complianceScore: number | null
  lastInspectionOn: string | null
  nextInspectionDue: string | null
  documents: {
    id: string
    docType: string
    title: string
    referenceNo: string | null
    validFrom: string | null
    validUntil: string | null
    daysLeft: number | null
    status: string
    uploadedAt: string | null
    verifiedAt: string | null
  }[]
}

export interface PharmacyDocumentRequest {
  docType: string
  title: string
  referenceNo?: string
  validFrom?: string
  validUntil?: string
}

export interface PharmacyAuditResponse {
  retentionYears: number
  items: { seq: number; at: string | null; actor: string; actorType: string | null; action: string; summary: string; group: 'rx' | 'stock' | 'staff' | 'other' }[]
  nextBeforeSeq: number | null
}

export interface PharmacyProfile {
  id: string
  name: string
  licenceNo: string
  licenceValidUntil: string | null
  type: string
  status: string
  address: string
  district: string
  linkedHospital: string | null
  openingHours: Record<string, unknown>
  stockSource: string
  counters: number
  isJanAushadhi: boolean
  billingLink: { vendor: string; lastSyncAt: string | null; lastSyncStatus: string | null } | null
  lastSyncRun: { startedAt: string | null; finishedAt: string | null; status: string; rowsSynced: number } | null
  lockedFields: string[]
}

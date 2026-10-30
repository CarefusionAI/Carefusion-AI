// Pharmacy admin console hooks: /api/v1/pharmacy-admin/*  (types live in packages/shared/src/pharmacy-admin.ts).
// Every write invalidates the whole ['pharmacy-admin'] tree so the overview counts follow the change.
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  ExpiryResponse,
  InventoryResponse,
  PharmacistsResponse,
  PharmacyAuditResponse,
  PharmacyComplianceResponse,
  PharmacyDocumentRequest,
  PharmacyInviteRequest,
  PharmacyOverview,
  PharmacyProfile,
  PurchaseOrderCreateRequest,
  PurchaseOrderDetail,
  PurchaseOrdersResponse,
  PurchaseOrderStatus,
  RecallsResponse,
  StockAdjustRequest,
} from '../../../../packages/shared/src/pharmacy-admin'
import { adminRequest, qs } from './adminHttp'
import type { WriteResult } from './adminHttp'

export type {
  ExpiryResponse,
  InventoryResponse,
  PharmacistsResponse,
  PharmacyAuditResponse,
  PharmacyComplianceResponse,
  PharmacyOverview,
  PharmacyProfile,
  PurchaseOrderDetail,
  PurchaseOrdersResponse,
  PurchaseOrderStatus,
  RecallsResponse,
  StockAdjustRequest,
  StockLevel,
  PurchaseOrderSummary,
  PharmacyInviteRequest,
  PharmacyDocumentRequest,
  PurchaseOrderCreateRequest,
} from '../../../../packages/shared/src/pharmacy-admin'

const BASE = '/v1/pharmacy-admin'
const ROOT = ['pharmacy-admin'] as const

export type InventoryFilter = 'all' | 'low' | 'hidden' | 'blocked'

export interface Supplier {
  id: string
  name: string
  kind: string
}

export interface InviteResult extends WriteResult {
  inviteId?: string
  /** Mock activation link; a real deployment e-mails it. */
  mockActivationLink?: string
}

const LIVE_MS = 20000

export const pharmacyKeys = {
  overview: [...ROOT, 'overview'] as const,
  pharmacists: (q: string) => [...ROOT, 'pharmacists', q] as const,
  inventory: (filter: string, category: string, q: string, limit: number) => [...ROOT, 'inventory', filter, category, q, limit] as const,
  orders: (status: string) => [...ROOT, 'purchase-orders', status] as const,
  order: (id: string) => [...ROOT, 'purchase-order', id] as const,
  suppliers: [...ROOT, 'suppliers'] as const,
  recalls: [...ROOT, 'recalls'] as const,
  expiry: [...ROOT, 'expiry'] as const,
  compliance: [...ROOT, 'compliance'] as const,
  audit: (group: string) => [...ROOT, 'audit', group] as const,
  profile: [...ROOT, 'profile'] as const,
}

// ---------------------------------------------------------------- reads

export function usePharmacyOverview() {
  return useQuery({
    queryKey: pharmacyKeys.overview,
    queryFn: () => adminRequest<PharmacyOverview>(`${BASE}/overview`),
    refetchInterval: LIVE_MS,
  })
}

export function usePharmacists(q: string) {
  return useQuery({
    queryKey: pharmacyKeys.pharmacists(q),
    queryFn: () => adminRequest<PharmacistsResponse>(`${BASE}/pharmacists${qs({ q })}`),
    placeholderData: (prev) => prev,
  })
}

export function useInventory(filter: InventoryFilter, category: string, q: string, limit: number) {
  return useQuery({
    queryKey: pharmacyKeys.inventory(filter, category, q, limit),
    queryFn: () => adminRequest<InventoryResponse>(`${BASE}/inventory${qs({ filter, category, q, limit })}`),
    placeholderData: (prev) => prev,
  })
}

export function usePurchaseOrders(status: PurchaseOrderStatus | '') {
  return useQuery({
    queryKey: pharmacyKeys.orders(status),
    queryFn: () => adminRequest<PurchaseOrdersResponse>(`${BASE}/purchase-orders${qs({ status })}`),
    placeholderData: (prev) => prev,
  })
}

export function usePurchaseOrder(id: string | null) {
  return useQuery({
    queryKey: pharmacyKeys.order(id ?? ''),
    enabled: !!id,
    queryFn: () => adminRequest<PurchaseOrderDetail>(`${BASE}/purchase-orders/${id}`),
  })
}

export function useSuppliers() {
  return useQuery({
    queryKey: pharmacyKeys.suppliers,
    queryFn: () => adminRequest<Supplier[]>(`${BASE}/suppliers`),
  })
}

export function useRecalls() {
  return useQuery({
    queryKey: pharmacyKeys.recalls,
    queryFn: () => adminRequest<RecallsResponse>(`${BASE}/recalls`),
    refetchInterval: LIVE_MS,
  })
}

export function useExpiry() {
  return useQuery({
    queryKey: pharmacyKeys.expiry,
    queryFn: () => adminRequest<ExpiryResponse>(`${BASE}/expiry`),
  })
}

export function useCompliance() {
  return useQuery({
    queryKey: pharmacyKeys.compliance,
    queryFn: () => adminRequest<PharmacyComplianceResponse>(`${BASE}/compliance`),
  })
}

export function usePharmacyAudit(group: string) {
  return useInfiniteQuery({
    queryKey: pharmacyKeys.audit(group),
    initialPageParam: undefined as number | undefined,
    queryFn: ({ pageParam }) =>
      adminRequest<PharmacyAuditResponse>(`${BASE}/audit${qs({ group, limit: 40, beforeSeq: pageParam })}`),
    getNextPageParam: (last) => last.nextBeforeSeq ?? undefined,
  })
}

export function usePharmacyProfile() {
  return useQuery({
    queryKey: pharmacyKeys.profile,
    queryFn: () => adminRequest<PharmacyProfile>(`${BASE}/profile`),
  })
}

// ---------------------------------------------------------------- writes

function useWrite<TVars, TRes extends WriteResult = WriteResult>(run: (vars: TVars) => Promise<TRes>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: run,
    onSuccess: () => qc.invalidateQueries({ queryKey: ROOT }),
  })
}

export function useCreatePharmacist() {
  return useWrite((body: { personId: string; registrationNo: string }) =>
    adminRequest<WriteResult>(`${BASE}/pharmacists`, { method: 'POST', body }),
  )
}

export function useDeactivatePharmacist() {
  return useWrite(({ userId, reason }: { userId: string; reason: string }) =>
    adminRequest<WriteResult>(`${BASE}/pharmacists/${userId}/deactivate`, { method: 'POST', body: { reason } }),
  )
}

export function useReactivatePharmacist() {
  return useWrite(({ userId }: { userId: string }) =>
    adminRequest<WriteResult>(`${BASE}/pharmacists/${userId}/reactivate`, { method: 'POST', body: {} }),
  )
}

export function useInvitePharmacist() {
  return useWrite((body: PharmacyInviteRequest) => adminRequest<InviteResult>(`${BASE}/invites`, { method: 'POST', body }))
}

export function useResendInvite() {
  return useWrite(({ id }: { id: string }) => adminRequest<WriteResult>(`${BASE}/invites/${id}/resend`, { method: 'POST', body: {} }))
}

export function useRevokeInvite() {
  return useWrite(({ id }: { id: string }) => adminRequest<WriteResult>(`${BASE}/invites/${id}/revoke`, { method: 'POST', body: {} }))
}

export function useSetPublished() {
  return useWrite(({ id, published }: { id: string; published: boolean }) =>
    adminRequest<WriteResult>(`${BASE}/inventory/${id}/publish`, { method: 'PATCH', body: { published } }),
  )
}

export function useAdjustStock() {
  return useWrite(({ id, ...body }: { id: string } & StockAdjustRequest) =>
    adminRequest<WriteResult>(`${BASE}/inventory/${id}/adjust`, { method: 'POST', body }),
  )
}

/** The medicine catalogue endpoint the order form needs does not exist yet; the hook is ready for it. */
export function useCreatePurchaseOrder() {
  return useWrite((body: PurchaseOrderCreateRequest) => adminRequest<WriteResult>(`${BASE}/purchase-orders`, { method: 'POST', body }))
}

export function useApprovePurchaseOrder() {
  return useWrite(({ id }: { id: string }) => adminRequest<WriteResult>(`${BASE}/purchase-orders/${id}/approve`, { method: 'POST', body: {} }))
}

export function useSendBackPurchaseOrder() {
  return useWrite(({ id, reason }: { id: string; reason: string }) =>
    adminRequest<WriteResult>(`${BASE}/purchase-orders/${id}/send-back`, { method: 'POST', body: { reason } }),
  )
}

export function useConfirmRecall() {
  return useWrite(({ id, note }: { id: string; note?: string }) =>
    adminRequest<WriteResult>(`${BASE}/recalls/${id}/confirm`, { method: 'POST', body: note ? { note } : {} }),
  )
}

export function useUndoRecall() {
  return useWrite(({ id }: { id: string }) => adminRequest<WriteResult>(`${BASE}/recalls/${id}/undo`, { method: 'POST', body: {} }))
}

export function useAddComplianceDocument() {
  return useWrite((body: PharmacyDocumentRequest) => adminRequest<WriteResult>(`${BASE}/compliance/documents`, { method: 'POST', body }))
}

export function useUpdateOpeningHours() {
  return useWrite((openingHours: Record<string, unknown>) =>
    adminRequest<WriteResult>(`${BASE}/profile`, { method: 'PATCH', body: { openingHours } }),
  )
}

// Hospital admin console hooks: /api/v1/hospital-admin/*  (types live in packages/shared/src/hospital-admin.ts).
// Every write invalidates the whole ['hospital-admin'] tree so counts in the overview and approvals stay in step.
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  HospitalAdmissionsResponse,
  HospitalApplicant,
  HospitalApprovalFilter,
  HospitalApprovalsResponse,
  HospitalAuditResponse,
  HospitalBedsResponse,
  HospitalBreakGlassResponse,
  HospitalComplaintsResponse,
  HospitalCreateStaffRequest,
  HospitalDepartmentsResponse,
  HospitalOverview,
  HospitalPermissionChangesRequest,
  HospitalPermissionMatrix,
  HospitalProfile,
  HospitalProfileChangeRequest,
  HospitalRejectRequest,
  HospitalReviewsResponse,
  HospitalRoster,
  HospitalRosterUpdateRequest,
  HospitalStaffResponse,
} from '../../../../packages/shared/src/hospital-admin'
import { adminRequest, qs } from './adminHttp'
import type { WriteResult } from './adminHttp'

export type {
  HospitalAdmissionsResponse,
  HospitalApplicant,
  HospitalApprovalsResponse,
  HospitalAuditResponse,
  HospitalBedsResponse,
  HospitalBreakGlassResponse,
  HospitalComplaintsResponse,
  HospitalDepartmentsResponse,
  HospitalOverview,
  HospitalPermissionMatrix,
  HospitalProfile,
  HospitalReviewsResponse,
  HospitalRoster,
  HospitalStaffResponse,
}
export type {
  HospitalApprovalFilter,
  HospitalAuditItem,
  HospitalBreakGlassItem,
  HospitalComplaintState,
  HospitalProfileChangeRequest,
  HospitalRejectReasonCode,
  HospitalStaffMember,
  RosterShift,
} from '../../../../packages/shared/src/hospital-admin'

const BASE = '/v1/hospital-admin'
const ROOT = ['hospital-admin'] as const

export const hospitalKeys = {
  overview: [...ROOT, 'overview'] as const,
  approvals: (filter: HospitalApprovalFilter) => [...ROOT, 'approvals', filter] as const,
  staff: (role: string, q: string) => [...ROOT, 'staff', role, q] as const,
  permissions: [...ROOT, 'permissions'] as const,
  departments: [...ROOT, 'departments'] as const,
  beds: (wardId: string) => [...ROOT, 'beds', wardId] as const,
  admissions: (department: string) => [...ROOT, 'admissions', department] as const,
  roster: (weekStart: string) => [...ROOT, 'roster', weekStart] as const,
  breakGlass: [...ROOT, 'break-glass'] as const,
  audit: (group: string) => [...ROOT, 'audit', group] as const,
  complaints: (status: string) => [...ROOT, 'complaints', status] as const,
  reviews: (stars: number | undefined) => [...ROOT, 'reviews', stars ?? 'all'] as const,
  profile: [...ROOT, 'profile'] as const,
}

/** Overview, approvals and the topbar counts move together, so keep polling light. */
const LIVE_MS = 20000

// ---------------------------------------------------------------- reads

export function useHospitalOverview() {
  return useQuery({
    queryKey: hospitalKeys.overview,
    queryFn: () => adminRequest<HospitalOverview>(`${BASE}/overview`),
    refetchInterval: LIVE_MS,
  })
}

export function useHospitalApprovals(filter: HospitalApprovalFilter) {
  return useQuery({
    queryKey: hospitalKeys.approvals(filter),
    queryFn: () => adminRequest<HospitalApprovalsResponse>(`${BASE}/approvals${qs({ filter })}`),
  })
}

export function useHospitalStaff(role: string, q: string) {
  return useQuery({
    queryKey: hospitalKeys.staff(role, q),
    queryFn: () => adminRequest<HospitalStaffResponse>(`${BASE}/staff${qs({ role, q, limit: 200 })}`),
    placeholderData: (prev) => prev,
  })
}

export function useHospitalPermissions() {
  return useQuery({
    queryKey: hospitalKeys.permissions,
    queryFn: () => adminRequest<HospitalPermissionMatrix>(`${BASE}/permissions`),
  })
}

export function useHospitalDepartments() {
  return useQuery({
    queryKey: hospitalKeys.departments,
    queryFn: () => adminRequest<HospitalDepartmentsResponse>(`${BASE}/departments`),
  })
}

export function useHospitalBeds(wardId: string) {
  return useQuery({
    queryKey: hospitalKeys.beds(wardId),
    queryFn: () => adminRequest<HospitalBedsResponse>(`${BASE}/beds${qs({ wardId })}`),
  })
}

export function useHospitalAdmissions(department: string) {
  return useQuery({
    queryKey: hospitalKeys.admissions(department),
    queryFn: () => adminRequest<HospitalAdmissionsResponse>(`${BASE}/admissions${qs({ department, limit: 200 })}`),
    placeholderData: (prev) => prev,
  })
}

/** `weekStart` is a Monday (YYYY-MM-DD). Empty string lets the API pick the current week. */
export function useHospitalRoster(weekStart: string) {
  return useQuery({
    queryKey: hospitalKeys.roster(weekStart),
    queryFn: () => adminRequest<HospitalRoster>(`${BASE}/roster${qs({ weekStart })}`),
    placeholderData: (prev) => prev,
  })
}

export function useHospitalBreakGlass() {
  return useQuery({
    queryKey: hospitalKeys.breakGlass,
    queryFn: () => adminRequest<HospitalBreakGlassResponse>(`${BASE}/break-glass`),
    refetchInterval: LIVE_MS,
  })
}

/** Audit log, newest first, "Load more" pages by `beforeSeq`. */
export function useHospitalAudit(group: string) {
  return useInfiniteQuery({
    queryKey: hospitalKeys.audit(group),
    initialPageParam: undefined as number | undefined,
    queryFn: ({ pageParam }) =>
      adminRequest<HospitalAuditResponse>(`${BASE}/audit${qs({ group, limit: 40, beforeSeq: pageParam })}`),
    getNextPageParam: (last) => last.nextBeforeSeq ?? undefined,
  })
}

export function useHospitalComplaints(status: string) {
  return useQuery({
    queryKey: hospitalKeys.complaints(status),
    queryFn: () => adminRequest<HospitalComplaintsResponse>(`${BASE}/complaints${qs({ status, limit: 100 })}`),
    placeholderData: (prev) => prev,
  })
}

export interface ComplaintTimelineStep {
  [key: string]: unknown
}

export function useHospitalComplaintTimeline(id: string | null) {
  return useQuery({
    queryKey: [...ROOT, 'complaint-timeline', id] as const,
    enabled: !!id,
    queryFn: () => adminRequest<unknown>(`${BASE}/complaints/${id}/timeline`),
  })
}

export function useHospitalReviews(stars: number | undefined) {
  return useQuery({
    queryKey: hospitalKeys.reviews(stars),
    queryFn: () => adminRequest<HospitalReviewsResponse>(`${BASE}/reviews${qs({ stars, limit: 100 })}`),
    placeholderData: (prev) => prev,
  })
}

export function useHospitalProfile() {
  return useQuery({
    queryKey: hospitalKeys.profile,
    queryFn: () => adminRequest<HospitalProfile>(`${BASE}/profile`),
  })
}

// ---------------------------------------------------------------- writes

function useWrite<TVars>(run: (vars: TVars) => Promise<WriteResult>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: run,
    onSuccess: () => qc.invalidateQueries({ queryKey: ROOT }),
  })
}

export function useCheckApplicantDocument() {
  return useWrite(({ id, index, checked }: { id: string; index: number; checked: boolean }) =>
    adminRequest<WriteResult>(`${BASE}/approvals/${id}/documents/${index}/check`, { method: 'POST', body: { checked } }),
  )
}

export function useApproveApplicant() {
  return useWrite(({ id, reason }: { id: string; reason?: string }) =>
    adminRequest<WriteResult>(`${BASE}/approvals/${id}/approve`, { method: 'POST', body: reason ? { reason } : {} }),
  )
}

export function useRejectApplicant() {
  return useWrite(({ id, ...body }: { id: string } & HospitalRejectRequest) =>
    adminRequest<WriteResult>(`${BASE}/approvals/${id}/reject`, { method: 'POST', body }),
  )
}

export function useCreateHospitalStaff() {
  return useWrite((body: HospitalCreateStaffRequest) =>
    adminRequest<WriteResult>(`${BASE}/staff`, { method: 'POST', body }),
  )
}

export function useUpdatePermissions() {
  return useWrite((body: HospitalPermissionChangesRequest) =>
    adminRequest<WriteResult>(`${BASE}/permissions`, { method: 'PUT', body }),
  )
}

export function useCreateDepartment() {
  return useWrite(({ name }: { name: string }) =>
    adminRequest<WriteResult>(`${BASE}/departments`, { method: 'POST', body: { name } }),
  )
}

export function useUpdateDepartment() {
  return useWrite(({ id, ...body }: { id: string; name?: string; isActive?: boolean }) =>
    adminRequest<WriteResult>(`${BASE}/departments/${id}`, { method: 'PATCH', body }),
  )
}

export function useSetBedStatus() {
  return useWrite(({ id, status }: { id: string; status: 'free' | 'reserved' | 'cleaning' | 'out_of_service' }) =>
    adminRequest<WriteResult>(`${BASE}/beds/${id}`, { method: 'PATCH', body: { status } }),
  )
}

export function useUpdateRoster() {
  return useWrite((body: HospitalRosterUpdateRequest) =>
    adminRequest<WriteResult>(`${BASE}/roster`, { method: 'PUT', body }),
  )
}

export function usePublishRoster() {
  return useWrite(({ weekStart }: { weekStart: string }) =>
    adminRequest<WriteResult>(`${BASE}/roster/publish`, { method: 'POST', body: { weekStart } }),
  )
}

export function useJustifyBreakGlass() {
  return useWrite(({ sessionId, note }: { sessionId: string; note?: string }) =>
    adminRequest<WriteResult>(`${BASE}/break-glass/${sessionId}/justify`, { method: 'POST', body: note ? { note } : {} }),
  )
}

export function useEscalateBreakGlass() {
  return useWrite(({ sessionId, note }: { sessionId: string; note: string }) =>
    adminRequest<WriteResult>(`${BASE}/break-glass/${sessionId}/escalate`, { method: 'POST', body: { note } }),
  )
}

export function useAssignComplaint() {
  return useWrite(({ id, assigneeUserId, note }: { id: string; assigneeUserId?: string; note?: string }) =>
    adminRequest<WriteResult>(`${BASE}/complaints/${id}/assign`, { method: 'POST', body: { assigneeUserId, note } }),
  )
}

export function useResolveComplaint() {
  return useWrite(({ id, resolution }: { id: string; resolution: string }) =>
    adminRequest<WriteResult>(`${BASE}/complaints/${id}/resolve`, { method: 'POST', body: { resolution } }),
  )
}

export function useReplyToReview() {
  return useWrite(({ id, body }: { id: string; body: string }) =>
    adminRequest<WriteResult>(`${BASE}/reviews/${id}/reply`, { method: 'POST', body: { body } }),
  )
}

export function useRequestProfileChange() {
  return useWrite((body: HospitalProfileChangeRequest) =>
    adminRequest<WriteResult>(`${BASE}/profile/change-requests`, { method: 'POST', body }),
  )
}

// Hooks for the government console API (district, state, zonal and central admin): /api/v1/gov.
// The level and area always come from the signed-in admin's post on the server, never from the browser.
// Types come from packages/shared/src/gov-admin.ts. Synthetic demo data only; every number is aggregated.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  GovAdmins,
  GovAiGovernance,
  GovAlert,
  GovAlertList,
  GovAlertTarget,
  GovApprovalInbox,
  GovApprovals,
  GovAudit,
  GovBlood,
  GovContext,
  GovDirectory,
  GovGrievances,
  GovLogPage,
  GovMap,
  GovOverview,
  GovReportExport,
  GovReportPeriod,
  GovReports,
  GovSurveillance,
  GovSystem,
  Widget,
} from '@carefusion/shared'
import { apiFetch, getAuthToken } from '../lib/api'

export type {
  GovAdmins,
  GovAiGovernance,
  GovAlert,
  GovAlertList,
  GovAlertTarget,
  GovAnomaly,
  GovApprovalInbox,
  GovApprovalItem,
  GovApprovals,
  GovAudit,
  GovBlood,
  GovContext,
  GovDirectory,
  GovFlaggedEvent,
  GovGrievances,
  GovLevel,
  GovLogPage,
  GovMap,
  GovOverview,
  GovReportExport,
  GovReportPeriod,
  GovReports,
  GovSection,
  GovSurveillance,
  GovSystem,
  GovUnit,
  Widget,
} from '@carefusion/shared'

const BASE = '/v1/gov'

export class GovApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.name = 'GovApiError'
    this.status = status
  }
}

function messageOf(body: unknown, fallback: string): string {
  if (body && typeof body === 'object') {
    const b = body as { errorMessage?: unknown; message?: unknown; issues?: { message?: string }[] }
    if (typeof b.errorMessage === 'string' && b.errorMessage !== 'Invalid request') return b.errorMessage
    if (Array.isArray(b.issues) && b.issues[0]?.message) return String(b.issues[0].message)
    if (typeof b.message === 'string') return b.message
    if (Array.isArray(b.message) && typeof b.message[0] === 'string') return b.message[0]
  }
  return fallback
}

async function govRequest<T>(method: 'GET' | 'POST' | 'PATCH', path: string, body?: unknown): Promise<T> {
  const res = await apiFetch(`${BASE}${path}`, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const data: unknown = await res.json().catch(() => null)
  if (!res.ok) {
    throw new GovApiError(messageOf(data, `Request failed (${res.status})`), res.status)
  }
  return data as T
}

const get = <T,>(path: string) => govRequest<T>('GET', path)
const post = <T,>(path: string, body: unknown = {}) => govRequest<T>('POST', path, body)

function qs(params: Record<string, string | number | undefined | null>): string {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') p.set(k, String(v))
  }
  const s = p.toString()
  return s ? `?${s}` : ''
}

/** Plain text for an error thrown by one of these calls. */
export function govErrorText(e: unknown): string {
  return e instanceof Error ? e.message : 'Something went wrong. Please try again.'
}

const KEY = 'gov'
const noRetry = { retry: false, staleTime: 15_000 } as const

// ---------------------------------------------------------------- reads

export const useGovContext = () =>
  useQuery({ queryKey: [KEY, 'context'], queryFn: () => get<GovContext>('/context'), ...noRetry, staleTime: 60_000 })

export const useGovOverview = () =>
  useQuery({ queryKey: [KEY, 'overview'], queryFn: () => get<GovOverview>('/overview'), ...noRetry, refetchInterval: 20_000 })

export const useGovMap = (metric: 'registered' | 'disease' | 'blood', disease?: string) =>
  useQuery({
    queryKey: [KEY, 'map', metric, disease ?? ''],
    queryFn: () => get<GovMap>(`/map${qs({ metric, disease })}`),
    ...noRetry,
    placeholderData: (prev) => prev,
  })

export const useGovSurveillance = (disease?: string) =>
  useQuery({
    queryKey: [KEY, 'surveillance', disease ?? ''],
    queryFn: () => get<GovSurveillance>(`/surveillance${qs({ disease })}`),
    ...noRetry,
    placeholderData: (prev) => prev,
  })

export const useGovApprovals = (status: 'all' | 'waiting' | 'decided') =>
  useQuery({
    queryKey: [KEY, 'approvals', status],
    queryFn: () => get<GovApprovals>(`/approvals${qs({ status })}`),
    ...noRetry,
    placeholderData: (prev) => prev,
  })

export const useGovInbox = () =>
  useQuery({ queryKey: [KEY, 'inbox'], queryFn: () => get<GovApprovalInbox>('/approvals/inbox'), ...noRetry })

export const useGovAlerts = () =>
  useQuery({ queryKey: [KEY, 'alerts'], queryFn: () => get<GovAlertList>('/alerts'), ...noRetry })

export const useGovBlood = () => useQuery({ queryKey: [KEY, 'blood'], queryFn: () => get<GovBlood>('/blood'), ...noRetry })

export interface DirectoryParams {
  kind: 'doctors' | 'facilities' | 'staff'
  status: 'all' | 'active' | 'pending' | 'suspended'
  q?: string
  limit?: number
  offset?: number
}

export const useGovDirectory = (p: DirectoryParams) =>
  useQuery({
    queryKey: [KEY, 'directory', p],
    queryFn: () => get<GovDirectory>(`/directory${qs({ ...p })}`),
    ...noRetry,
    placeholderData: (prev) => prev,
  })

export const useGovAdmins = () => useQuery({ queryKey: [KEY, 'admins'], queryFn: () => get<GovAdmins>('/admins'), ...noRetry })

export const useGovGrievances = () =>
  useQuery({ queryKey: [KEY, 'grievances'], queryFn: () => get<GovGrievances>('/grievances'), ...noRetry })

export const useGovAudit = () => useQuery({ queryKey: [KEY, 'audit'], queryFn: () => get<GovAudit>('/audit'), ...noRetry })

export interface LogParams {
  type: 'all' | 'access' | 'breakglass' | 'admin' | 'export' | 'signin'
  q?: string
  limit?: number
  offset?: number
}

export const useGovLogs = (p: LogParams) =>
  useQuery({
    queryKey: [KEY, 'logs', p],
    queryFn: () => get<GovLogPage>(`/logs${qs({ ...p })}`),
    ...noRetry,
    placeholderData: (prev) => prev,
  })

export const useGovReports = () => useQuery({ queryKey: [KEY, 'reports'], queryFn: () => get<GovReports>('/reports'), ...noRetry })

/** Central only. Other levels get 403, so the query is skipped unless enabled. */
export const useGovSystem = (enabled: boolean) =>
  useQuery({ queryKey: [KEY, 'system'], queryFn: () => get<GovSystem>('/system'), ...noRetry, enabled })

export const useGovAi = (enabled: boolean) =>
  useQuery({ queryKey: [KEY, 'ai'], queryFn: () => get<GovAiGovernance>('/ai'), ...noRetry, enabled })

// ---------------------------------------------------------------- writes

/** Any write refreshes every console query (counts and lists depend on each other). */
function useGovMutation<V, R>(fn: (v: V) => Promise<R>) {
  const qc = useQueryClient()
  return useMutation<R, Error, V>({
    mutationFn: fn,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [KEY] })
    },
  })
}

export interface ApproveResult {
  success: true
  nextStep: boolean
  accountActivated: boolean
  twoPerson: { state: string; firstSigner: string | null } | null
  simulatedSecondSigner?: boolean
}

export const useApprove = () =>
  useGovMutation(({ id, reason, asPeer }: { id: string; reason?: string; asPeer?: boolean }) =>
    post<ApproveResult>(`/approvals/${id}/approve`, { reason: reason || undefined, asPeer: asPeer || undefined }),
  )
export const useReject = () =>
  useGovMutation(({ id, reason }: { id: string; reason: string }) => post<{ success: true }>(`/approvals/${id}/reject`, { reason }))
export const useMoreInfo = () =>
  useGovMutation(({ id, note }: { id: string; note: string }) => post<{ success: true; status: string }>(`/approvals/${id}/more-info`, { note }))
export const useEscalateApproval = () =>
  useGovMutation(({ id, reason }: { id: string; reason?: string }) =>
    post<{ success: true; escalatedToLevel: string; newRequestId: string }>(`/approvals/${id}/escalate`, { reason: reason || undefined }),
  )

export interface AlertDraft {
  type: 'advisory' | 'emergency'
  title: string
  body: string
  category: string
  target: { scope: GovAlertTarget['scope']; id?: string | number | null }
  scheduledAt?: string
  sms: boolean
  translate: boolean
  saveAsDraft: boolean
}

export const useCreateAlert = () =>
  useGovMutation((d: AlertDraft) => post<GovAlert>('/alerts', { ...d, target: { scope: d.target.scope, ...(d.target.id != null ? { id: d.target.id } : {}) } }))
export const useSecondApproveAlert = () =>
  useGovMutation(({ id, asPeer }: { id: string; asPeer?: boolean }) => post<GovAlert>(`/alerts/${id}/second-approve`, { asPeer: asPeer || undefined }))
export const useSendAlert = () =>
  useGovMutation(({ id, scheduledAt }: { id: string; scheduledAt?: string }) => post<GovAlert>(`/alerts/${id}/send`, { scheduledAt }))
export const useCancelAlert = () => useGovMutation((id: string) => post<GovAlert>(`/alerts/${id}/cancel`, {}))

export interface ReachEstimate {
  appRecipients: number
  phoneOnlyRecipients: Widget<number>
  mutesApplied: boolean
}

/** Reach preview for the alert being written. A query, so it follows the form. */
export const useAlertReach = (
  target: { scope: GovAlertTarget['scope']; id?: string | number | null } | null,
  category: string,
  type: 'advisory' | 'emergency',
) =>
  useQuery({
    queryKey: [KEY, 'reach', target?.scope, target?.id ?? '', category, type],
    enabled: target !== null,
    ...noRetry,
    placeholderData: (prev) => prev,
    queryFn: () =>
      post<ReachEstimate>('/alerts/reach', {
        target: { scope: target!.scope, ...(target!.id != null ? { id: target!.id } : {}) },
        category,
        type,
      }),
  })

export const useNotifyDonors = () => useGovMutation((id: string) => post<{ success?: boolean }>(`/blood/requests/${id}/notify-donors`, {}))

export const useReviewAnomaly = () =>
  useGovMutation(({ id, status }: { id: string; status: 'reviewed' | 'dismissed' }) => post<unknown>(`/surveillance/anomalies/${id}/review`, { status }))
export const useCreateAction = () =>
  useGovMutation((v: { disease: string; title: string; meta?: string }) => post<unknown>('/surveillance/actions', v))
export const useUpdateAction = () =>
  useGovMutation(({ id, status }: { id: string; status: 'planned' | 'in_progress' | 'done' }) => govRequest<unknown>('PATCH', `/surveillance/actions/${id}`, { status }))
export const useFieldRequest = () =>
  useGovMutation((v: { anomalyId: string; teamName: string }) => post<unknown>('/surveillance/field-requests', v))

export const useJustifyFlag = () =>
  useGovMutation(({ id, note }: { id: string; note: string }) => post<unknown>(`/audit/flags/${id}/justify`, { note }))
export const useEscalateFlag = () =>
  useGovMutation(({ id, note }: { id: string; note: string }) => post<unknown>(`/audit/flags/${id}/escalate`, { note }))

export const useCreateExport = () =>
  useGovMutation((v: { report: string; period: GovReportPeriod; format: 'csv' | 'pdf' }) => post<GovReportExport>('/reports/exports', v))

/** Downloads one de-identified CSV export through the authenticated API (a plain link cannot send the token). */
export async function downloadExport(exp: Pick<GovReportExport, 'id' | 'filename'>): Promise<void> {
  const res = await apiFetch(`${BASE}/reports/exports/${exp.id}/download`)
  if (!res.ok) {
    const body: unknown = await res.json().catch(() => null)
    throw new GovApiError(messageOf(body, `Download failed (${res.status})`), res.status)
  }
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = exp.filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}

export const useSetFlag = () =>
  useGovMutation(({ code, enabled, reason, asPeer }: { code: string; enabled: boolean; reason: string; asPeer?: boolean }) =>
    post<{ success: true; applied: boolean; pending?: boolean; simulatedSecondSigner?: boolean; flag: { code: string; enabled: boolean } }>(
      `/system/flags/${code}`,
      { enabled, reason, asPeer: asPeer || undefined },
    ),
  )
export const useSignoff = () =>
  useGovMutation(({ id, decision, reason, asPeer }: { id: string; decision: 'approve' | 'hold'; reason?: string; asPeer?: boolean }) =>
    post<unknown>(`/ai/release-requests/${id}/signoff`, { decision, reason: reason || undefined, asPeer: asPeer || undefined }),
  )
export const useRelease = () => useGovMutation((id: string) => post<unknown>(`/ai/release-requests/${id}/release`, {}))
export const useSafetyStatus = () =>
  useGovMutation(({ id, status }: { id: string; status: 'reviewing' | 'closed' }) => post<unknown>(`/ai/safety-reports/${id}/status`, { status }))

/** True when a demo sign-in token is present (used only to decide whether to offer the demo "peer signs" option). */
export function isDemoSession(): boolean {
  return (getAuthToken() ?? '').startsWith('demo:')
}

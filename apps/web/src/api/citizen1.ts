// Typed react-query hooks for the Citizen app, part 1: shell badges, Home, Share and access,
// Profile, Documents, Dates, Home vitals, AI Health Chat and Messages.
// Wraps lib/api.ts and uses the API types from @carefusion/shared. All data is synthetic.
import { useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { QueryClient } from '@tanstack/react-query'
import type {
  AccessCategoryDto,
  AccessHistoryResponse,
  AccessKeyResponse,
  AccessOverviewResponse,
  AddFamilyMemberRequest,
  AddVitalReadingRequest,
  AddVitalReadingResponse,
  AlertsResponse,
  CalendarFeedStatus,
  CalendarResponse,
  ChatContextResponse,
  ChatSessionDetail,
  ChatSessionDto,
  CitizenProfileResponse,
  ComplaintDto,
  CreateReminderRequest,
  DatedEventDto,
  DocumentDownloadResponse,
  DocumentResponse,
  FamilyMemberDto,
  FolderResponse,
  LiveSessionDto,
  MessageDto,
  SendChatMessageResponse,
  SpecialCategoryType,
  StartThreadRequest,
  ThreadDetailDto,
  ThreadSummaryDto,
  UpcomingResponse,
  UpdateCitizenProfileRequest,
  UpdateReminderRequest,
  UploadDocumentResponse,
  VitalReadingDto,
  VitalsSummaryResponse,
  DocType,
} from '@carefusion/shared'
import { apiFetch } from '../lib/api'

// ---------------------------------------------------------------------------------------------
// Low-level request helper (keeps the server's error message instead of "API 400: Bad Request")
// ---------------------------------------------------------------------------------------------

export class CitizenApiError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = 'CitizenApiError'
    this.status = status
  }
}

async function readError(res: Response): Promise<string> {
  const data = (await res.json().catch(() => ({}))) as {
    message?: string | string[]
    errorMessage?: string
    error?: string
  }
  const msg = Array.isArray(data.message) ? data.message.join(', ') : data.message
  return data.errorMessage ?? msg ?? data.error ?? `Request failed (${res.status})`
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await apiFetch(path, init)
  } catch {
    throw new CitizenApiError(0, 'Could not reach the server. Check that the API is running.')
  }
  if (!res.ok) throw new CitizenApiError(res.status, await readError(res))
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

function getJson<T>(path: string): Promise<T> {
  return call<T>(path)
}

function sendJson<T>(path: string, method: 'POST' | 'PUT' | 'PATCH' | 'DELETE', body?: unknown): Promise<T> {
  return call<T>(path, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

export function errorMessage(e: unknown, fallback = 'Something went wrong. Please try again.'): string {
  return e instanceof Error && e.message ? e.message : fallback
}

const ROOT = ['citizen1'] as const

export const citizenKeys = {
  profile: [...ROOT, 'profile'] as const,
  categoryTypes: [...ROOT, 'special-category-types'] as const,
  folders: [...ROOT, 'folders'] as const,
  folderDocs: (id: string | null) => [...ROOT, 'folder-docs', id] as const,
  storage: [...ROOT, 'storage'] as const,
  access: [...ROOT, 'access'] as const,
  accessOverview: [...ROOT, 'access', 'overview'] as const,
  accessKey: [...ROOT, 'access-key'] as const,
  accessHistory: (filter: string) => [...ROOT, 'access', 'history', filter] as const,
  calendar: (month: string | undefined) => [...ROOT, 'dates', 'calendar', month ?? 'current'] as const,
  upcoming: (limit: number) => [...ROOT, 'dates', 'upcoming', limit] as const,
  dates: [...ROOT, 'dates'] as const,
  feed: [...ROOT, 'dates', 'feed'] as const,
  vitals: [...ROOT, 'vitals'] as const,
  vitalsSummary: [...ROOT, 'vitals', 'summary'] as const,
  vitalReadings: (kind: string, days: number) => [...ROOT, 'vitals', 'readings', kind, days] as const,
  chat: [...ROOT, 'chat'] as const,
  chatContext: [...ROOT, 'chat', 'context'] as const,
  chatSessions: [...ROOT, 'chat', 'sessions'] as const,
  chatSession: (id: string | null) => [...ROOT, 'chat', 'session', id] as const,
  threads: [...ROOT, 'messages', 'threads'] as const,
  thread: (id: string | null) => [...ROOT, 'messages', 'thread', id] as const,
  alertsSummary: [...ROOT, 'alerts', 'summary'] as const,
  alertsUnread: [...ROOT, 'alerts', 'unread'] as const,
  complaints: [...ROOT, 'complaints'] as const,
}

function invalidate(qc: QueryClient, ...keys: readonly (readonly unknown[])[]) {
  return Promise.all(keys.map((queryKey) => qc.invalidateQueries({ queryKey })))
}

// ---------------------------------------------------------------------------------------------
// Profile (reuses /citizen/profile and /citizen/special-categories)
// ---------------------------------------------------------------------------------------------

export function useCitizenProfile() {
  return useQuery({
    queryKey: citizenKeys.profile,
    queryFn: () => getJson<CitizenProfileResponse>('/v1/citizen/profile'),
  })
}

export function useUpdateProfile() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: UpdateCitizenProfileRequest) => sendJson<unknown>('/v1/citizen/profile', 'PATCH', body),
    onSuccess: () => invalidate(qc, citizenKeys.profile),
  })
}

export function useSpecialCategoryTypes() {
  return useQuery({
    queryKey: citizenKeys.categoryTypes,
    queryFn: () => getJson<SpecialCategoryType[]>('/v1/citizen/special-categories/types'),
    staleTime: 5 * 60_000,
  })
}

export function useAddSpecialCategory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: { categoryCode: string; status: string; otherText?: string }) =>
      sendJson<unknown>('/v1/citizen/special-categories', 'POST', body),
    onSuccess: () => invalidate(qc, citizenKeys.profile),
  })
}

export function useEndSpecialCategory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => sendJson<unknown>(`/v1/citizen/special-categories/${id}/end`, 'POST'),
    onSuccess: () => invalidate(qc, citizenKeys.profile),
  })
}

// ---------------------------------------------------------------------------------------------
// Documents (reuses /citizen/folders and /citizen/documents)
// ---------------------------------------------------------------------------------------------

export function useFolders() {
  return useQuery({
    queryKey: citizenKeys.folders,
    queryFn: () => getJson<FolderResponse[]>('/v1/citizen/folders'),
  })
}

export function useFolderDocuments(folderId: string | null) {
  return useQuery({
    queryKey: citizenKeys.folderDocs(folderId),
    enabled: folderId !== null,
    queryFn: () => getJson<DocumentResponse[]>(`/v1/citizen/folders/${folderId}/documents`),
  })
}

/** Documents of several folders at once (used for "All documents", search and Home's recent list). */
export function useAllDocuments(folderIds: string[]) {
  const key = folderIds.join(',')
  return useQuery({
    queryKey: [...ROOT, 'all-docs', key],
    enabled: folderIds.length > 0,
    queryFn: async () => {
      const lists = await Promise.all(
        folderIds.map(async (folderId) => {
          const docs = await getJson<DocumentResponse[]>(`/v1/citizen/folders/${folderId}/documents`)
          return docs.map((d) => ({ ...d, folderId }))
        }),
      )
      return lists.flat()
    },
  })
}

export type CitizenDocument = DocumentResponse & { folderId: string }

/** The newest few documents across all folders, in one call (Home's "Recent documents"). */
export function useRecentDocuments(limit = 3) {
  return useQuery({
    queryKey: [...ROOT, 'recent-docs', limit],
    queryFn: () => getJson<CitizenDocument[]>(`/v1/citizen/documents/recent?limit=${limit}`),
  })
}

export function useCreateFolder() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (name: string) => sendJson<FolderResponse>('/v1/citizen/folders', 'POST', { name }),
    onSuccess: () => invalidate(qc, citizenKeys.folders),
  })
}

export function useRenameFolder() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: { id: string; name: string }) =>
      sendJson<FolderResponse>(`/v1/citizen/folders/${v.id}`, 'PATCH', { name: v.name }),
    onSuccess: () => invalidate(qc, citizenKeys.folders),
  })
}

export function useUploadDocument() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: { file: File; title: string; folderId: string; docType?: DocType }) => {
      const form = new FormData()
      form.append('file', v.file)
      form.append('title', v.title)
      form.append('folderId', v.folderId)
      form.append('docType', v.docType ?? 'upload')
      // No Content-Type header: the browser adds the multipart boundary.
      return call<UploadDocumentResponse>('/v1/citizen/documents/upload', { method: 'POST', body: form })
    },
    onSuccess: () => invalidate(qc, [...ROOT, 'folder-docs'], [...ROOT, 'all-docs'], [...ROOT, 'recent-docs'], citizenKeys.folders, citizenKeys.storage),
  })
}

export function useMoveDocument() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: { id: string; toFolderId: string }) =>
      sendJson<unknown>(`/v1/citizen/documents/${v.id}/move`, 'POST', { toFolderId: v.toFolderId }),
    onSuccess: () => invalidate(qc, [...ROOT, 'folder-docs'], [...ROOT, 'all-docs'], [...ROOT, 'recent-docs'], citizenKeys.folders),
  })
}

export function fetchDocumentDownload(id: string) {
  return getJson<DocumentDownloadResponse>(`/v1/citizen/documents/${id}/download`)
}

/** Storage used by the citizen's documents (comes from the settings endpoint). */
export function useStorageUsage() {
  return useQuery({
    queryKey: citizenKeys.storage,
    queryFn: async () => {
      const s = await getJson<{ storage: { documents: number; bytes: number } }>('/v1/citizen/settings')
      return s.storage
    },
  })
}

// ---------------------------------------------------------------------------------------------
// Share and access
// ---------------------------------------------------------------------------------------------

export function useAccessOverview() {
  return useQuery({
    queryKey: citizenKeys.accessOverview,
    queryFn: () => getJson<AccessOverviewResponse>('/v1/citizen/access/overview'),
    refetchInterval: 30_000,
  })
}

/** The rotating key. Refetches itself just after each rotation (windowSeconds, 10 s in the demo). */
export function useRotatingKey() {
  return useQuery({
    queryKey: citizenKeys.accessKey,
    queryFn: () => getJson<AccessKeyResponse>('/v1/citizen/access/key'),
    staleTime: 0,
    refetchInterval: (q) => {
      const exp = q.state.data?.expiresAt
      const ms = exp ? new Date(exp).getTime() - Date.now() : 1000
      return Math.min(15_000, Math.max(800, ms + 250))
    },
  })
}

export function useAccessHistory(filter: 'all' | 'doctors' | 'staff') {
  return useQuery({
    queryKey: citizenKeys.accessHistory(filter),
    queryFn: () => getJson<AccessHistoryResponse>(`/v1/citizen/access/history?filter=${filter}&limit=50`),
  })
}

export function useEndSession() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => sendJson<unknown>(`/v1/citizen/access/sessions/${id}/end`, 'POST'),
    onSuccess: () => invalidate(qc, citizenKeys.access),
  })
}

export function useReportOpen() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: { sessionId: string; text: string }) =>
      sendJson<unknown>(`/v1/citizen/access/sessions/${v.sessionId}/report`, 'POST', { text: v.text }),
    onSuccess: () => invalidate(qc, citizenKeys.access),
  })
}

export function useSetAccessCategory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: { key: string; enabled: boolean }) =>
      sendJson<AccessCategoryDto[]>(`/v1/citizen/access/categories/${v.key}`, 'PUT', { enabled: v.enabled }),
    onSuccess: () => invalidate(qc, citizenKeys.access),
  })
}

export function useAddFamily() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: AddFamilyMemberRequest) => sendJson<FamilyMemberDto>('/v1/citizen/access/family', 'POST', body),
    onSuccess: () => invalidate(qc, citizenKeys.access),
  })
}

export function useRemoveFamily() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => sendJson<unknown>(`/v1/citizen/access/family/${id}`, 'DELETE'),
    onSuccess: () => invalidate(qc, citizenKeys.access),
  })
}

export function useFamily() {
  return useQuery({
    queryKey: [...ROOT, 'access', 'family'],
    queryFn: () => getJson<FamilyMemberDto[]>('/v1/citizen/access/family'),
  })
}

// ---------------------------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------------------------

export function useCalendar(month?: string) {
  return useQuery({
    queryKey: citizenKeys.calendar(month),
    queryFn: () => getJson<CalendarResponse>(`/v1/citizen/dates/calendar${month ? `?month=${month}` : ''}`),
  })
}

export function useUpcoming(limit = 10) {
  return useQuery({
    queryKey: citizenKeys.upcoming(limit),
    queryFn: () => getJson<UpcomingResponse>(`/v1/citizen/dates/upcoming?limit=${limit}`),
  })
}

export function useCreateReminder() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: CreateReminderRequest) => sendJson<DatedEventDto>('/v1/citizen/dates/reminders', 'POST', body),
    onSuccess: () => invalidate(qc, citizenKeys.dates),
  })
}

export function useUpdateReminder() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: { id: string; body: UpdateReminderRequest }) =>
      sendJson<DatedEventDto>(`/v1/citizen/dates/reminders/${v.id}`, 'PATCH', v.body),
    onSuccess: () => invalidate(qc, citizenKeys.dates),
  })
}

export function useCalendarFeed() {
  return useQuery({
    queryKey: citizenKeys.feed,
    queryFn: () => getJson<CalendarFeedStatus>('/v1/citizen/dates/calendar-feed'),
  })
}

export function useCreateCalendarFeed() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => sendJson<CalendarFeedStatus>('/v1/citizen/dates/calendar-feed', 'POST'),
    onSuccess: () => invalidate(qc, citizenKeys.feed),
  })
}

export function useRevokeCalendarFeed() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => sendJson<unknown>('/v1/citizen/dates/calendar-feed', 'DELETE'),
    onSuccess: () => invalidate(qc, citizenKeys.feed),
  })
}

// ---------------------------------------------------------------------------------------------
// Home vitals
// ---------------------------------------------------------------------------------------------

export function useVitalsSummary() {
  return useQuery({
    queryKey: citizenKeys.vitalsSummary,
    queryFn: () => getJson<VitalsSummaryResponse>('/v1/citizen/vitals/summary'),
  })
}

export function useVitalReadings(kind: string | undefined, days = 90, limit = 60) {
  return useQuery({
    queryKey: citizenKeys.vitalReadings(kind ?? 'all', days),
    queryFn: () =>
      getJson<VitalReadingDto[]>(
        `/v1/citizen/vitals/readings?days=${days}&limit=${limit}${kind ? `&kind=${kind}` : ''}`,
      ),
  })
}

export function useAddVitalReading() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: AddVitalReadingRequest) =>
      sendJson<AddVitalReadingResponse>('/v1/citizen/vitals/readings', 'POST', body),
    onSuccess: () => invalidate(qc, citizenKeys.vitals),
  })
}

// ---------------------------------------------------------------------------------------------
// AI Health Chat (every answer is simulated)
// ---------------------------------------------------------------------------------------------

export function useChatContext() {
  return useQuery({
    queryKey: citizenKeys.chatContext,
    queryFn: () => getJson<ChatContextResponse>('/v1/citizen/ai-chat/context'),
  })
}

export function useChatSessions() {
  return useQuery({
    queryKey: citizenKeys.chatSessions,
    queryFn: () => getJson<ChatSessionDto[]>('/v1/citizen/ai-chat/sessions'),
  })
}

export function useChatSession(id: string | null) {
  return useQuery({
    queryKey: citizenKeys.chatSession(id),
    enabled: id !== null,
    queryFn: () => getJson<ChatSessionDetail>(`/v1/citizen/ai-chat/sessions/${id}`),
  })
}

export function useStartChat() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (text?: string) =>
      sendJson<{ session: ChatSessionDto } | SendChatMessageResponse>(
        '/v1/citizen/ai-chat/sessions',
        'POST',
        text ? { text } : {},
      ),
    onSuccess: () => invalidate(qc, citizenKeys.chatSessions),
  })
}

export function useSendChatMessage(sessionId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (text: string) => {
      if (!sessionId) throw new Error('Start a chat first')
      return sendJson<SendChatMessageResponse>(`/v1/citizen/ai-chat/sessions/${sessionId}/messages`, 'POST', { text })
    },
    onSuccess: () => invalidate(qc, citizenKeys.chat),
  })
}

export function useShareChat(sessionId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (doctorUserId?: string) => {
      if (!sessionId) throw new Error('Start a chat first')
      return sendJson<ChatSessionDto>(`/v1/citizen/ai-chat/sessions/${sessionId}/share`, 'POST', doctorUserId ? { doctorUserId } : {})
    },
    onSuccess: () => invalidate(qc, citizenKeys.chat),
  })
}

// ---------------------------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------------------------

export function useThreads() {
  return useQuery({
    queryKey: citizenKeys.threads,
    queryFn: () => getJson<ThreadSummaryDto[]>('/v1/citizen/messages/threads'),
    refetchInterval: 8000,
  })
}

export function useThread(id: string | null) {
  return useQuery({
    queryKey: citizenKeys.thread(id),
    enabled: id !== null,
    queryFn: () => getJson<ThreadDetailDto>(`/v1/citizen/messages/threads/${id}`),
    refetchInterval: 8000,
  })
}

export function useSendMessage(threadId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (text: string) => {
      if (!threadId) throw new Error('Pick a conversation first')
      return sendJson<MessageDto>(`/v1/citizen/messages/threads/${threadId}/messages`, 'POST', { text })
    },
    onSuccess: () => invalidate(qc, [...ROOT, 'messages']),
  })
}

export function useMarkThreadRead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => sendJson<unknown>(`/v1/citizen/messages/threads/${id}/read`, 'POST'),
    onSuccess: () => invalidate(qc, citizenKeys.threads),
  })
}

export function useStartThread() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: StartThreadRequest) => sendJson<ThreadDetailDto>('/v1/citizen/messages/threads', 'POST', body),
    onSuccess: () => invalidate(qc, [...ROOT, 'messages']),
  })
}

// ---------------------------------------------------------------------------------------------
// Alerts and complaints (read-only here: bell, Home panel and sidebar badges)
// ---------------------------------------------------------------------------------------------

export function useAlertsSummary(limit = 3) {
  return useQuery({
    queryKey: [...citizenKeys.alertsSummary, limit],
    queryFn: () => getJson<AlertsResponse>(`/v1/citizen/alerts?limit=${limit}`),
    refetchInterval: 15_000,
  })
}

export function useAlertsUnread(enabled = true) {
  return useQuery({
    queryKey: citizenKeys.alertsUnread,
    enabled,
    retry: false,
    refetchInterval: 15_000,
    queryFn: async () => (await getJson<{ count: number }>('/v1/citizen/alerts/unread-count')).count,
  })
}

// ---------------------------------------------------------------------------------------------
// Shell badges (sidebar counts) and the bell
// ---------------------------------------------------------------------------------------------

const OPEN_COMPLAINT = new Set(['filed', 'open', 'assigned', 'under_review', 'in_review', 'escalated', 'reopened'])

/** Live counts for the citizen sidebar. Disabled (and empty) for other roles. */
export function useCitizenBadges(enabled: boolean): Record<string, number | undefined> | undefined {
  const upcoming = useQuery({
    queryKey: citizenKeys.upcoming(30),
    enabled,
    retry: false,
    refetchInterval: 30_000,
    queryFn: () => getJson<UpcomingResponse>('/v1/citizen/dates/upcoming?limit=30'),
  })
  const threads = useQuery({
    queryKey: citizenKeys.threads,
    enabled,
    retry: false,
    refetchInterval: 8000,
    queryFn: () => getJson<ThreadSummaryDto[]>('/v1/citizen/messages/threads'),
  })
  const unread = useAlertsUnread(enabled)
  const complaints = useQuery({
    queryKey: citizenKeys.complaints,
    enabled,
    retry: false,
    refetchInterval: 30_000,
    queryFn: () => getJson<ComplaintDto[]>('/v1/citizen/complaints'),
  })

  return useMemo(() => {
    if (!enabled) return undefined
    const week = (upcoming.data?.events ?? []).filter((e) => e.inDays >= 0 && e.inDays <= 7 && e.status === 'scheduled')
    return {
      dates: week.length,
      messages: (threads.data ?? []).reduce((n, t) => n + (t.unread || 0), 0),
      alerts: unread.data ?? 0,
      complaints: (complaints.data ?? []).filter((c) => OPEN_COMPLAINT.has(c.status)).length,
    }
  }, [enabled, upcoming.data, threads.data, unread.data, complaints.data])
}

export type { LiveSessionDto }

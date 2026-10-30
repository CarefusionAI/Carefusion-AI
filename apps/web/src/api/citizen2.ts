import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { QueryClient } from '@tanstack/react-query'
import type {
  AlertGroup,
  AlertsResponse,
  AppointmentDto,
  BookAppointmentRequest,
  BookAppointmentResponse,
  CitizenBloodBanksResponse,
  CitizenBloodChecklistRequest,
  CitizenBloodChecklistResponse,
  CitizenBloodDonorDto,
  CitizenBloodHistoryResponse,
  CitizenBloodRequestsResponse,
  CitizenBloodRespondRequest,
  CitizenFinderResponse,
  CitizenMedicinesSummaryResponse,
  CitizenMedicinesTodayResponse,
  CitizenNextOfKinRequest,
  CitizenOrganOverviewResponse,
  CitizenPharmacyQueueDto,
  CitizenPrescriptionsResponse,
  CitizenRefillDto,
  CitizenWitnessInviteRequest,
  CitizenWitnessInviteResponse,
  ComplaintDto,
  ComplaintOptionsResponse,
  CreateComplaintRequest,
  CreateReviewRequest,
  DeletionRequestDto,
  DeviceDto,
  ExportRequestDto,
  NotificationPrefsResponse,
  PastVisitDto,
  ProviderDto,
  ReviewDto,
  ReviewListResponse,
  ReviewableVisitDto,
  SettingsResponse,
  SlotDto,
  UpdateNotificationPrefsRequest,
  UpdatePreferencesRequest,
} from '@carefusion/shared'
import { apiFetch } from '../lib/api'

// Typed react-query hooks for the citizen screens Care, Medicines, Blood, Organ, Alerts, Settings, Reviews, Complaints.
// Every path is under /api/v1/citizen. Errors carry the API message so screens can show it.

export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await apiFetch(`/v1/citizen${path}`, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (!res.ok) {
    let message = `Something went wrong (${res.status})`
    try {
      const j = (await res.json()) as { message?: unknown; errorMessage?: string }
      if (typeof j.message === 'string') message = j.message
      else if (Array.isArray(j.message)) message = j.message.join(', ')
      else if (j.errorMessage) message = j.errorMessage
    } catch {
      /* keep the generic message */
    }
    throw new ApiError(message, res.status)
  }
  return (await res.json()) as T
}

const get = <T>(path: string) => req<T>('GET', path)

function qs(params: Record<string, string | number | boolean | undefined | null>): string {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') p.set(k, String(v))
  const s = p.toString()
  return s ? `?${s}` : ''
}

export function errorText(e: unknown): string {
  return e instanceof Error ? e.message : 'Something went wrong. Please try again.'
}

/** Refresh the cross-role event feed after something we did may have created an event. */
function pokeEvents(qc: QueryClient) {
  void qc.invalidateQueries({ queryKey: ['events'] })
}

// ---------------------------------------------------------------------------------------------
// Profile (district name for Alerts and Care)
// ---------------------------------------------------------------------------------------------
export interface ProfileLite {
  person: { fullName: string }
  profile: { bloodGroup: string; district: { id: string; name: string } | null; state: { id: string; name: string } | null }
}
export const useProfileLite = () =>
  useQuery({ queryKey: ['c2', 'profile'], queryFn: () => get<ProfileLite>('/profile'), staleTime: 60_000 })

// ---------------------------------------------------------------------------------------------
// Care
// ---------------------------------------------------------------------------------------------
export interface ProviderFilters {
  q?: string
  type?: 'govt' | 'private'
  telemedicine?: boolean
  walkIn?: boolean
}
export const useProviders = (f: ProviderFilters) =>
  useQuery({
    queryKey: ['c2', 'care', 'providers', f],
    queryFn: () =>
      get<ProviderDto[]>(
        `/care/providers${qs({ q: f.q, type: f.type, telemedicine: f.telemedicine ? 'true' : undefined, walkIn: f.walkIn ? 'true' : undefined, limit: 20 })}`,
      ),
  })

export const useSlots = (doctorUserId: string | undefined) =>
  useQuery({
    queryKey: ['c2', 'care', 'slots', doctorUserId],
    enabled: !!doctorUserId,
    queryFn: () => get<SlotDto[]>(`/care/providers/${doctorUserId}/slots?days=14`),
  })

export const useAppointments = (scope: 'upcoming' | 'past' | 'all') =>
  useQuery({ queryKey: ['c2', 'care', 'appointments', scope], queryFn: () => get<AppointmentDto[]>(`/care/appointments?scope=${scope}`) })

export const usePastVisits = () =>
  useQuery({ queryKey: ['c2', 'care', 'past'], queryFn: () => get<PastVisitDto[]>('/care/visits/past?months=6') })

export function useBookAppointment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (b: Partial<BookAppointmentRequest> & { slotId: string }) => req<BookAppointmentResponse>('POST', '/care/appointments', b),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['c2', 'care'] })
      void qc.invalidateQueries({ queryKey: ['dates'] })
      pokeEvents(qc)
    },
  })
}

export function useCancelAppointment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: { id: string; reason?: string }) => req<AppointmentDto>('POST', `/care/appointments/${v.id}/cancel`, { reason: v.reason }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['c2', 'care'] })
      void qc.invalidateQueries({ queryKey: ['dates'] })
      pokeEvents(qc)
    },
  })
}

// ---------------------------------------------------------------------------------------------
// Medicines
// ---------------------------------------------------------------------------------------------
export const useMedToday = () =>
  useQuery({ queryKey: ['c2', 'med', 'today'], queryFn: () => get<CitizenMedicinesTodayResponse>('/medicines/today') })
export const useMedSummary = () =>
  useQuery({ queryKey: ['c2', 'med', 'summary'], queryFn: () => get<CitizenMedicinesSummaryResponse>('/medicines/summary') })
export const usePrescriptions = () =>
  useQuery({ queryKey: ['c2', 'med', 'rx'], queryFn: () => get<CitizenPrescriptionsResponse>('/medicines/prescriptions') })
export const useRefills = () =>
  useQuery({ queryKey: ['c2', 'med', 'refills'], queryFn: () => get<CitizenRefillDto[]>('/medicines/refills') })
export const useQueueToken = () =>
  useQuery({
    queryKey: ['c2', 'med', 'queue'],
    queryFn: () => get<{ queue: CitizenPharmacyQueueDto | null }>('/medicines/queue'),
    refetchInterval: 30_000,
  })

export function useToggleDose() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: { id: string; taken: boolean }) =>
      req<CitizenMedicinesTodayResponse>('PATCH', `/medicines/doses/${v.id}`, { taken: v.taken }),
    onSuccess: (data) => {
      qc.setQueryData(['c2', 'med', 'today'], data)
      void qc.invalidateQueries({ queryKey: ['c2', 'med', 'summary'] })
      void qc.invalidateQueries({ queryKey: ['c2', 'med', 'rx'] })
    },
  })
}

export interface FinderParams {
  q: string
  radiusKm?: number
  govtOnly?: boolean
  openNow?: boolean
}
export const useFinder = (p: FinderParams | null) =>
  useQuery({
    queryKey: ['c2', 'med', 'finder', p],
    enabled: !!p && p.q.trim().length > 0,
    queryFn: () =>
      get<CitizenFinderResponse>(
        `/medicines/finder${qs({ q: p!.q.trim(), radiusKm: p!.radiusKm, govtOnly: p!.govtOnly ? 'true' : undefined, openNow: p!.openNow ? 'true' : undefined })}`,
      ),
  })

// ---------------------------------------------------------------------------------------------
// Blood
// ---------------------------------------------------------------------------------------------
export const useBloodDonor = () => useQuery({ queryKey: ['c2', 'blood', 'donor'], queryFn: () => get<CitizenBloodDonorDto>('/blood/donor') })
export const useBloodRequests = () =>
  useQuery({
    queryKey: ['c2', 'blood', 'requests'],
    queryFn: () => get<CitizenBloodRequestsResponse>('/blood/requests'),
    refetchInterval: 20_000,
  })
export const useBloodBanks = () => useQuery({ queryKey: ['c2', 'blood', 'banks'], queryFn: () => get<CitizenBloodBanksResponse>('/blood/banks') })
export const useBloodHistory = () =>
  useQuery({ queryKey: ['c2', 'blood', 'history'], queryFn: () => get<CitizenBloodHistoryResponse>('/blood/history') })
export const useBloodChecklist = () =>
  useQuery({ queryKey: ['c2', 'blood', 'checklist'], queryFn: () => get<CitizenBloodChecklistResponse>('/blood/checklist') })

export function useSetAvailability() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (ready: boolean) => req<CitizenBloodDonorDto>('PUT', '/blood/donor/availability', { ready }),
    onSuccess: (d) => {
      qc.setQueryData(['c2', 'blood', 'donor'], d)
      void qc.invalidateQueries({ queryKey: ['c2', 'blood', 'requests'] })
    },
  })
}
export function useRespondBlood() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: { id: string } & CitizenBloodRespondRequest) =>
      req<CitizenBloodRequestsResponse>('POST', `/blood/requests/${v.id}/respond`, { response: v.response, notifyCircle: v.notifyCircle }),
    onSuccess: (d) => {
      qc.setQueryData(['c2', 'blood', 'requests'], d)
      pokeEvents(qc)
    },
  })
}
export function useWithdrawBlood() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => req<CitizenBloodRequestsResponse>('POST', `/blood/requests/${id}/withdraw`),
    onSuccess: (d) => qc.setQueryData(['c2', 'blood', 'requests'], d),
  })
}
export function usePledgeCamp() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => req<CitizenBloodRequestsResponse>('POST', `/blood/camps/${id}/pledge`),
    onSuccess: (d) => {
      qc.setQueryData(['c2', 'blood', 'requests'], d)
      void qc.invalidateQueries({ queryKey: ['dates'] })
    },
  })
}
export function useSaveChecklist() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (b: CitizenBloodChecklistRequest) => req<CitizenBloodChecklistResponse>('POST', '/blood/checklist', b),
    onSuccess: (d) => qc.setQueryData(['c2', 'blood', 'checklist'], d),
  })
}

// ---------------------------------------------------------------------------------------------
// Organ
// ---------------------------------------------------------------------------------------------
const ORGAN_KEY = ['c2', 'organ']
export const useOrgan = () => useQuery({ queryKey: ORGAN_KEY, queryFn: () => get<CitizenOrganOverviewResponse>('/organ') })

function useOrganMutation<V>(fn: (v: V) => Promise<CitizenOrganOverviewResponse>) {
  const qc = useQueryClient()
  return useMutation({ mutationFn: fn, onSuccess: (d) => qc.setQueryData(ORGAN_KEY, d) })
}
export const useSetOrgans = () => useOrganMutation((organs: string[]) => req<CitizenOrganOverviewResponse>('PUT', '/organ/pledge/organs', { organs }))
export const useInformKin = () =>
  useOrganMutation((b: CitizenNextOfKinRequest) => req<CitizenOrganOverviewResponse>('POST', '/organ/pledge/next-of-kin', b))
export const useSignWitness = () =>
  useOrganMutation((id: string) => req<CitizenOrganOverviewResponse>('POST', `/organ/pledge/witnesses/${id}/sign`))
export const useChooseDesk = () =>
  useOrganMutation((hospitalId: string) => req<CitizenOrganOverviewResponse>('PUT', '/organ/pledge/signing-desk', { hospitalId }))
export const useWithdrawPledge = () => useOrganMutation(() => req<CitizenOrganOverviewResponse>('POST', '/organ/pledge/withdraw'))

export function useInviteWitness() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (b: CitizenWitnessInviteRequest) =>
      req<{ overview: CitizenOrganOverviewResponse; invite: CitizenWitnessInviteResponse }>('POST', '/organ/pledge/witnesses', b),
    onSuccess: (d) => qc.setQueryData(ORGAN_KEY, d.overview),
  })
}
export function useRemindWitnesses() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => req<{ reminded: number; overview: CitizenOrganOverviewResponse }>('POST', '/organ/pledge/witnesses/remind'),
    onSuccess: (d) => qc.setQueryData(ORGAN_KEY, d.overview),
  })
}

// ---------------------------------------------------------------------------------------------
// Alerts
// ---------------------------------------------------------------------------------------------
export const useAlerts = (group?: AlertGroup, unreadOnly?: boolean) =>
  useQuery({
    queryKey: ['c2', 'alerts', group ?? 'all', !!unreadOnly],
    queryFn: () => get<AlertsResponse>(`/alerts${qs({ group, unreadOnly: unreadOnly ? 'true' : undefined, limit: 100 })}`),
    refetchInterval: 15_000,
  })
export function useMarkAlertsRead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (ids?: string[]) => req<{ marked: number }>('POST', '/alerts/read', ids ? { ids } : {}),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['c2', 'alerts'] })
      pokeEvents(qc)
    },
  })
}
export const useNotifPrefs = () =>
  useQuery({ queryKey: ['c2', 'alerts', 'prefs'], queryFn: () => get<NotificationPrefsResponse>('/alerts/preferences') })
export function useUpdateNotifPrefs() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (b: UpdateNotificationPrefsRequest) => req<NotificationPrefsResponse>('PUT', '/alerts/preferences', b),
    onSuccess: (d) => qc.setQueryData(['c2', 'alerts', 'prefs'], d),
  })
}

// ---------------------------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------------------------
const SETTINGS_KEY = ['c2', 'settings']
export const useSettings = () => useQuery({ queryKey: SETTINGS_KEY, queryFn: () => get<SettingsResponse>('/settings') })
export function useUpdatePreferences() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (b: UpdatePreferencesRequest) => req<SettingsResponse>('PATCH', '/settings/preferences', b),
    onSuccess: (d) => qc.setQueryData(SETTINGS_KEY, d),
  })
}
export function useRevokeDevice() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => req<DeviceDto[]>('POST', `/settings/devices/${id}/revoke`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: SETTINGS_KEY }),
  })
}
export function useRevokeOtherDevices() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => req<DeviceDto[]>('POST', '/settings/devices/revoke-others', {}),
    onSuccess: () => void qc.invalidateQueries({ queryKey: SETTINGS_KEY }),
  })
}
export function useRequestExport() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (format: 'zip' | 'fhir') => req<ExportRequestDto>('POST', '/settings/export', { format }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: SETTINGS_KEY }),
  })
}
export function useRequestDeletion() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (reason?: string) => req<DeletionRequestDto>('POST', '/settings/delete-request', { confirm: 'DELETE', reason }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: SETTINGS_KEY }),
  })
}
export function useCancelDeletion() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => req<{ cancelled: boolean }>('POST', '/settings/delete-request/cancel'),
    onSuccess: () => void qc.invalidateQueries({ queryKey: SETTINGS_KEY }),
  })
}

// ---------------------------------------------------------------------------------------------
// Reviews
// ---------------------------------------------------------------------------------------------
export interface ReviewFilters {
  targetType?: 'hospital' | 'doctor' | 'pharmacy'
  targetId?: string
  minStars?: number
  department?: string
  location?: string
  sort?: 'recent' | 'rating' | 'helpful'
  limit?: number
}
export const useReviews = (f: ReviewFilters) =>
  useQuery({
    queryKey: ['c2', 'reviews', 'list', f],
    queryFn: () => get<ReviewListResponse>(`/reviews${qs({ ...f, limit: f.limit ?? 50 })}`),
    placeholderData: (prev) => prev,
  })
export const useMyReviews = () =>
  useQuery({
    queryKey: ['c2', 'reviews', 'mine'],
    queryFn: () => get<{ reviews: ReviewDto[]; reviewable: ReviewableVisitDto[] }>('/reviews/mine'),
  })
export function useCreateReview() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (b: Partial<CreateReviewRequest> & Pick<CreateReviewRequest, 'targetType' | 'targetId' | 'stars'>) =>
      req<ReviewDto>('POST', '/reviews', b),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['c2', 'reviews'] })
      pokeEvents(qc)
    },
  })
}
export function useHelpful() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => req<{ helpful: number; markedHelpful: boolean }>('POST', `/reviews/${id}/helpful`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['c2', 'reviews', 'list'] }),
  })
}
export const useReportReview = () =>
  useMutation({ mutationFn: (v: { id: string; reason: string }) => req<{ reported: boolean }>('POST', `/reviews/${v.id}/report`, { reason: v.reason }) })

// ---------------------------------------------------------------------------------------------
// Complaints
// ---------------------------------------------------------------------------------------------
const CMP_KEY = ['c2', 'complaints']
export const useComplaints = () => useQuery({ queryKey: CMP_KEY, queryFn: () => get<ComplaintDto[]>('/complaints'), refetchInterval: 20_000 })
export const useComplaintOptions = () =>
  useQuery({ queryKey: ['c2', 'complaint-options'], queryFn: () => get<ComplaintOptionsResponse>('/complaints/options'), staleTime: 300_000 })
export function useCreateComplaint() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (b: Partial<CreateComplaintRequest> & Pick<CreateComplaintRequest, 'category' | 'title' | 'body'>) =>
      req<ComplaintDto>('POST', '/complaints', b),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: CMP_KEY })
      pokeEvents(qc)
    },
  })
}
export function useAddComplaintNote() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: { id: string; text: string }) => req<ComplaintDto>('POST', `/complaints/${v.id}/notes`, { text: v.text }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: CMP_KEY }),
  })
}
export function useReopenComplaint() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: { id: string; text: string }) => req<ComplaintDto>('POST', `/complaints/${v.id}/reopen`, { text: v.text }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: CMP_KEY })
      pokeEvents(qc)
    },
  })
}

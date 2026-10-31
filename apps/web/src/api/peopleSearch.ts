import { useQuery } from '@tanstack/react-query'
import { adminRequest, qs } from './adminHttp'

export interface PersonHit {
  personId: string
  fullName: string
  abhaHint: string | null
  ageYears: number
}

/** Finds registered people by name or ABHA number (hospital and pharmacy admins). Waits for 3 characters. */
export function usePeopleSearch(q: string) {
  const term = q.trim()
  return useQuery({
    queryKey: ['people-search', term],
    enabled: term.length >= 3,
    queryFn: () => adminRequest<{ hits: PersonHit[]; minChars: number }>(`/api/v1/admin/people-search${qs({ q: term })}`),
    staleTime: 30_000,
  })
}

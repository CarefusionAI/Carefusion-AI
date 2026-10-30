import { lazy, Suspense } from 'react'
import type { ComponentType, LazyExoticComponent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { PageSkeleton } from './opsKit'
import type { HospitalSection } from './hospital/shared'

// Hospital admin console (design: HospitalAdmin.dc.html). The sidebar links to /hospital-admin?section=<id>;
// each section is its own lazy chunk and talks to /api/v1/hospital-admin/*.
const SECTIONS: Record<HospitalSection, LazyExoticComponent<ComponentType>> = {
  overview: lazy(() => import('./hospital/Overview')),
  approvals: lazy(() => import('./hospital/Approvals')),
  staff: lazy(() => import('./hospital/Staff')),
  admissions: lazy(() => import('./hospital/Admissions')),
  roster: lazy(() => import('./hospital/Roster')),
  beds: lazy(() => import('./hospital/Beds')),
  roles: lazy(() => import('./hospital/Roles')),
  profile: lazy(() => import('./hospital/Profile')),
  complaints: lazy(() => import('./hospital/Complaints')),
  reviews: lazy(() => import('./hospital/Reviews')),
  breakglass: lazy(() => import('./hospital/BreakGlass')),
  audit: lazy(() => import('./hospital/Audit')),
}

export default function HospitalAdminScreen() {
  const [params] = useSearchParams()
  const wanted = params.get('section') ?? 'overview'
  const id: HospitalSection = wanted in SECTIONS ? (wanted as HospitalSection) : 'overview'
  const Section = SECTIONS[id]
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Section key={id} />
    </Suspense>
  )
}

import { lazy, Suspense } from 'react'
import type { ComponentType, LazyExoticComponent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { PageSkeleton } from './opsKit'
import type { PharmacySection } from './pharmacy/shared'

// Pharmacy admin console (design: PharmacyAdmin.dc.html). The sidebar links to /pharmacy-admin?section=<id>;
// each section is its own lazy chunk and talks to /api/v1/pharmacy-admin/*.
const SECTIONS: Record<PharmacySection, LazyExoticComponent<ComponentType>> = {
  overview: lazy(() => import('./pharmacy/Overview')),
  staff: lazy(() => import('./pharmacy/Staff')),
  inventory: lazy(() => import('./pharmacy/Inventory')),
  orders: lazy(() => import('./pharmacy/Orders')),
  expiry: lazy(() => import('./pharmacy/Expiry')),
  compliance: lazy(() => import('./pharmacy/Governance').then((m) => ({ default: m.PharmacyCompliance }))),
  audit: lazy(() => import('./pharmacy/Governance').then((m) => ({ default: m.PharmacyAudit }))),
  profile: lazy(() => import('./pharmacy/Governance').then((m) => ({ default: m.PharmacyProfile }))),
}

export default function PharmacyAdminScreen() {
  const [params] = useSearchParams()
  const wanted = params.get('section') ?? 'overview'
  const id: PharmacySection = wanted in SECTIONS ? (wanted as PharmacySection) : 'overview'
  const Section = SECTIONS[id]
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Section key={id} />
    </Suspense>
  )
}

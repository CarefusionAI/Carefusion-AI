import { Suspense, lazy } from 'react'
import { Skeleton } from '../components/ui'

// /doctor now renders the ported Doctor app (pages/doctor/Doctor.tsx), loaded on demand.
const Doctor = lazy(() => import('./doctor/Doctor'))

export default function DoctorHome() {
  return (
    <Suspense fallback={<Skeleton lines={5} />}>
      <Doctor />
    </Suspense>
  )
}

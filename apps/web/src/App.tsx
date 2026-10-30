import { Suspense } from 'react'
import type { ReactNode } from 'react'
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom'
import type { Role } from '@carefusion/shared'
import { AuthProvider, useAuth } from './context/AuthContext'
import Layout from './components/Layout'
import DoctorHome from './pages/DoctorHome'
import NurseHome from './pages/NurseHome'
import LabTechHome from './pages/LabTechHome'
import RadioTechHome from './pages/RadioTechHome'
import PharmacistHome from './pages/PharmacistHome'
import PharmacyAdminHome from './pages/PharmacyAdminHome'
import HospitalAdminHome from './pages/HospitalAdminHome'
import ScreensIndex from './pages/ScreensIndex'
import { SCREENS } from './routes/screens'
import { SCREEN_COMPONENTS } from './routes/screenComponents'
import { Skeleton } from './components/ui'
import { ROLES } from './config/roles'

// Role pages need a demo sign-in (see /login or /demo-signin). Signed-out visitors go to the login page;
// a signed-in user who opens another role's page sees the 403 screen.
function RequireAuth({ children, role }: { children: ReactNode; role?: Role }) {
  const { user } = useAuth()
  if (!user) return <Navigate to="/login" replace />
  if (role && user.role !== role) return <ScreenRoute id="AccessDenied" />
  return <>{children}</>
}

function NotFound() {
  return <ScreenRoute id="NotFound" />
}

function ScreenRoute({ id }: { id: string }) {
  const Page = SCREEN_COMPONENTS[id]
  if (!Page) return <ScreenFallback />
  return (
    <Suspense fallback={<ScreenFallback />}>
      <Page />
    </Suspense>
  )
}

const PROTECTED_ROUTES: { path: string; element: ReactNode }[] = [
  { path: '/citizen', element: <ScreenRoute id="CitizenHome" /> },
  { path: '/doctor', element: <DoctorHome /> },
  { path: '/nurse', element: <NurseHome /> },
  { path: '/lab-tech', element: <LabTechHome /> },
  { path: '/radiology-tech', element: <RadioTechHome /> },
  { path: '/pharmacist', element: <PharmacistHome /> },
  { path: '/pharmacy-admin', element: <PharmacyAdminHome /> },
  { path: '/hospital-admin', element: <HospitalAdminHome /> },
  { path: '/district-admin', element: <ScreenRoute id="DistrictAdmin" /> },
  { path: '/state-admin', element: <ScreenRoute id="StateAdmin" /> },
  { path: '/zonal-admin', element: <ScreenRoute id="ZonalAdmin" /> },
  { path: '/central-admin', element: <ScreenRoute id="CentralAdmin" /> },
]

function ScreenFallback() {
  return (
    <div role="status" aria-label="Loading screen" className="flex flex-col gap-4">
      <Skeleton width="40%" height={28} />
      <Skeleton lines={4} />
    </div>
  )
}

// Placeholder routes for every design screen. /screens/<slug> always works; screens that had no
// route before also get their canonical path (see routes/screens.ts).
// Sign-in, registration and error screens draw their own full-page frame (banner, header, footer),
// so they render outside the shared Layout.
const STANDALONE_SCREENS = new Set([
  'DemoSignIn', 'Login', 'Main', 'NotFound', 'Recovery', 'RegisterCitizen', 'RegisterDoctor', 'Splash',
  'AccessDenied', 'StaffActivation', 'StaffLogin', 'AdminLogin', 'RegisterHospitalAdmin', 'RegisterPharmacyAdmin',
])

function screenRoutes(standalone: boolean) {
  const routes: ReactNode[] = []
  for (const s of SCREENS) {
    const Page = SCREEN_COMPONENTS[s.id]
    if (!Page || STANDALONE_SCREENS.has(s.id) !== standalone) continue
    const element = (
      <Suspense fallback={<ScreenFallback />}>
        <Page />
      </Suspense>
    )
    routes.push(<Route key={`screens-${s.slug}`} path={`/screens/${s.slug}`} element={element} />)
    if (s.path) {
      routes.push(
        <Route key={s.path} path={s.path} element={s.requiresAuth ? <RequireAuth role={s.group === 'citizen' ? 'CITIZEN' : undefined}>{element}</RequireAuth> : element} />,
      )
    }
  }
  return routes
}

function FramedLayout() {
  return (
    <Layout>
      <Outlet />
    </Layout>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* Full-page screens: landing, sign-in, registration, recovery, 403 and 404. */}
          <Route path="/" element={<ScreenRoute id="Main" />} />
          <Route path="/login" element={<ScreenRoute id="Login" />} />
          <Route path="/login/staff" element={<ScreenRoute id="StaffLogin" />} />
          <Route path="/login/admin" element={<ScreenRoute id="AdminLogin" />} />
          <Route path="/register" element={<ScreenRoute id="RegisterCitizen" />} />
          <Route path="/register/doctor" element={<ScreenRoute id="RegisterDoctor" />} />
          <Route path="/register/hospital-admin" element={<ScreenRoute id="RegisterHospitalAdmin" />} />
          <Route path="/register/pharmacy-admin" element={<ScreenRoute id="RegisterPharmacyAdmin" />} />
          {screenRoutes(true)}
          <Route element={<FramedLayout />}>
            {PROTECTED_ROUTES.map(({ path, element }) => (
              <Route key={path} path={path} element={<RequireAuth role={ROLES.find((r) => r.path === path)?.role}>{element}</RequireAuth>} />
            ))}
            <Route path="/screens" element={<ScreensIndex />} />
            {screenRoutes(false)}
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}

import type { ReactNode } from 'react'
import { BrowserRouter, Routes, Route, Link, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import LoginPage from './pages/LoginPage'
import RegisterCitizenPage from './pages/RegisterCitizenPage'
import RegisterDoctorPage from './pages/RegisterDoctorPage'
import RegisterHospitalAdminPage from './pages/RegisterHospitalAdminPage'
import RegisterPharmacyAdminPage from './pages/RegisterPharmacyAdminPage'
import StaffLoginPage from './pages/StaffLoginPage'
import AdminLoginPage from './pages/AdminLoginPage'
import Layout from './components/Layout'
import RoleSwitcher from './components/RoleSwitcher'
import CitizenHome from './pages/CitizenHome'
import DoctorHome from './pages/DoctorHome'
import NurseHome from './pages/NurseHome'
import LabTechHome from './pages/LabTechHome'
import RadioTechHome from './pages/RadioTechHome'
import PharmacistHome from './pages/PharmacistHome'
import PharmacyAdminHome from './pages/PharmacyAdminHome'
import HospitalAdminHome from './pages/HospitalAdminHome'
import DistrictAdminHome from './pages/DistrictAdminHome'
import StateAdminHome from './pages/StateAdminHome'
import ZonalAdminHome from './pages/ZonalAdminHome'
import CentralAdminHome from './pages/CentralAdminHome'

// Service URLs are the laptop ports from docs/12 section 4.1 (developer convenience).
const SERVICES = [
  { name: 'API health', url: 'http://localhost:3000/health' },
  { name: 'AI service health', url: 'http://localhost:8000/health' },
  { name: 'AI service docs', url: 'http://localhost:8000/docs' },
  { name: 'Keycloak (login server)', url: 'http://localhost:8080' },
  { name: 'MinIO console (files)', url: 'http://localhost:9001' },
  { name: 'Mailpit (test emails and OTPs)', url: 'http://localhost:8025' },
]

function Home() {
  return (
    <div className="space-y-8">
      <RoleSwitcher />

      <section className="mx-auto max-w-3xl">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-primary-500">
          Developer service links (laptop)
        </h2>
        <ul className="mt-3 space-y-2">
          {SERVICES.map((s) => (
            <li key={s.url}>
              <a
                href={s.url}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-between rounded-md border border-primary-200 bg-white px-4 py-2 text-sm hover:border-accent"
              >
                <span className="font-medium">{s.name}</span>
                <span className="text-primary-500">{s.url}</span>
              </a>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

// Role pages need a demo "login" (done with the role switcher). Otherwise go back to /.
function RequireAuth({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  if (!user) return <Navigate to="/" replace />
  return <>{children}</>
}

function NotFound() {
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-bold text-primary">Page not found</h1>
      <Link to="/" className="mt-4 inline-block text-sm font-medium underline">
        &larr; Back to role selector
      </Link>
    </div>
  )
}

const PROTECTED_ROUTES: { path: string; element: ReactNode }[] = [
  { path: '/citizen', element: <CitizenHome /> },
  { path: '/doctor', element: <DoctorHome /> },
  { path: '/nurse', element: <NurseHome /> },
  { path: '/lab-tech', element: <LabTechHome /> },
  { path: '/radiology-tech', element: <RadioTechHome /> },
  { path: '/pharmacist', element: <PharmacistHome /> },
  { path: '/pharmacy-admin', element: <PharmacyAdminHome /> },
  { path: '/hospital-admin', element: <HospitalAdminHome /> },
  { path: '/district-admin', element: <DistrictAdminHome /> },
  { path: '/state-admin', element: <StateAdminHome /> },
  { path: '/zonal-admin', element: <ZonalAdminHome /> },
  { path: '/central-admin', element: <CentralAdminHome /> },
]

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Layout>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/login/staff" element={<StaffLoginPage />} />
            <Route path="/login/admin" element={<AdminLoginPage />} />
            <Route path="/register" element={<RegisterCitizenPage />} />
            <Route path="/register/doctor" element={<RegisterDoctorPage />} />
            <Route path="/register/hospital-admin" element={<RegisterHospitalAdminPage />} />
            <Route path="/register/pharmacy-admin" element={<RegisterPharmacyAdminPage />} />
            {PROTECTED_ROUTES.map(({ path, element }) => (
              <Route key={path} path={path} element={<RequireAuth>{element}</RequireAuth>} />
            ))}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Layout>
      </AuthProvider>
    </BrowserRouter>
  )
}

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

function Home() {
  return <RoleSwitcher />
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

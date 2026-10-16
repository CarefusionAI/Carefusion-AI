import { BrowserRouter, Routes, Route, Link } from 'react-router-dom'
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

export default function App() {
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/citizen" element={<CitizenHome />} />
          <Route path="/doctor" element={<DoctorHome />} />
          <Route path="/nurse" element={<NurseHome />} />
          <Route path="/lab-tech" element={<LabTechHome />} />
          <Route path="/radiology-tech" element={<RadioTechHome />} />
          <Route path="/pharmacist" element={<PharmacistHome />} />
          <Route path="/pharmacy-admin" element={<PharmacyAdminHome />} />
          <Route path="/hospital-admin" element={<HospitalAdminHome />} />
          <Route path="/district-admin" element={<DistrictAdminHome />} />
          <Route path="/state-admin" element={<StateAdminHome />} />
          <Route path="/zonal-admin" element={<ZonalAdminHome />} />
          <Route path="/central-admin" element={<CentralAdminHome />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  )
}

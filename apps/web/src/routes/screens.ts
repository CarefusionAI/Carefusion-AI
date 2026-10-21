// Registry of the 42 Claude Design screens (design/canvas.json boards).
// `path` is the canonical route for screens that had no route yet; `existingPath` is where the
// current (pre-port) page lives. Every screen is also reachable at /screens/<slug> while it is
// still a placeholder.
export type ScreenGroup = 'auth' | 'citizen' | 'doctor' | 'staff' | 'admin'

export interface ScreenMeta {
  /** Design file name without .dc.html */
  id: string
  title: string
  group: ScreenGroup
  /** URL slug under /screens */
  slug: string
  /** Canonical route added in the port (screens that had no route yet). */
  path?: string
  /** Existing route this screen will eventually replace. */
  existingPath?: string
  /** True when the canonical route needs a signed-in demo user. */
  requiresAuth?: boolean
}

export const SCREEN_GROUP_LABELS: Record<ScreenGroup, string> = {
  auth: 'Public and sign-in',
  citizen: 'Citizen',
  doctor: 'Doctor',
  staff: 'Hospital staff',
  admin: 'Administrators and pharmacy',
}

export const SCREENS: ScreenMeta[] = [
  { id: 'DemoSignIn', title: 'Internal demo launcher — not linked from the public site', group: 'auth', slug: 'demo-sign-in', path: '/demo-signin' },
  { id: 'Login', title: 'Login — User / Doctor', group: 'auth', slug: 'login', existingPath: '/login' },
  { id: 'Main', title: 'Landing page', group: 'auth', slug: 'main', existingPath: '/' },
  { id: 'NotFound', title: '404 — Page not found', group: 'auth', slug: 'not-found', existingPath: '*' },
  { id: 'Recovery', title: 'Forgot password / lost phone', group: 'auth', slug: 'recovery', path: '/recovery' },
  { id: 'RegisterCitizen', title: 'Register — Citizen (e-KYC, face check, ABHA)', group: 'auth', slug: 'register-citizen', existingPath: '/register' },
  { id: 'RegisterDoctor', title: 'Register — Doctor (HPR, documents, approval)', group: 'auth', slug: 'register-doctor', existingPath: '/register/doctor' },
  { id: 'Splash', title: 'Splash / loading', group: 'auth', slug: 'splash', path: '/splash' },
  { id: 'Citizen', title: 'Citizen — full prototype (start here)', group: 'citizen', slug: 'citizen', existingPath: '/citizen' },
  { id: 'CitizenAIChat', title: 'Citizen · AI Health Chat', group: 'citizen', slug: 'citizen-ai-chat', path: '/citizen/ai-chat', requiresAuth: true },
  { id: 'CitizenAccess', title: 'Citizen · Share & access', group: 'citizen', slug: 'citizen-access', path: '/citizen/access', requiresAuth: true },
  { id: 'CitizenAlerts', title: 'Citizen · Alerts & notifications', group: 'citizen', slug: 'citizen-alerts', path: '/citizen/alerts', requiresAuth: true },
  { id: 'CitizenBlood', title: 'Citizen · Blood donation', group: 'citizen', slug: 'citizen-blood', path: '/citizen/blood', requiresAuth: true },
  { id: 'CitizenCare', title: 'Citizen · Find care & appointments', group: 'citizen', slug: 'citizen-care', path: '/citizen/care', requiresAuth: true },
  { id: 'CitizenComplaints', title: 'Citizen · Complaints', group: 'citizen', slug: 'citizen-complaints', path: '/citizen/complaints', requiresAuth: true },
  { id: 'CitizenDates', title: 'Citizen · Dates', group: 'citizen', slug: 'citizen-dates', path: '/citizen/dates', requiresAuth: true },
  { id: 'CitizenDocuments', title: 'Citizen · Documents', group: 'citizen', slug: 'citizen-documents', path: '/citizen/documents', requiresAuth: true },
  { id: 'CitizenHome', title: 'Citizen · Home', group: 'citizen', slug: 'citizen-home', path: '/citizen/home', requiresAuth: true },
  { id: 'CitizenMedicines', title: 'Citizen · Medicines', group: 'citizen', slug: 'citizen-medicines', path: '/citizen/medicines', requiresAuth: true },
  { id: 'CitizenMessages', title: 'Citizen · Messages', group: 'citizen', slug: 'citizen-messages', path: '/citizen/messages', requiresAuth: true },
  { id: 'CitizenOrgan', title: 'Citizen · Organ donation', group: 'citizen', slug: 'citizen-organ', path: '/citizen/organ', requiresAuth: true },
  { id: 'CitizenProfile', title: 'Citizen · Profile', group: 'citizen', slug: 'citizen-profile', path: '/citizen/profile', requiresAuth: true },
  { id: 'CitizenReviews', title: 'Citizen · Reviews', group: 'citizen', slug: 'citizen-reviews', path: '/citizen/reviews', requiresAuth: true },
  { id: 'CitizenSettings', title: 'Citizen · Settings', group: 'citizen', slug: 'citizen-settings', path: '/citizen/settings', requiresAuth: true },
  { id: 'CitizenVitals', title: 'Citizen · Home vitals', group: 'citizen', slug: 'citizen-vitals', path: '/citizen/vitals', requiresAuth: true },
  { id: 'Doctor', title: 'Doctor — full prototype (Dr. Arun Nair)', group: 'doctor', slug: 'doctor', existingPath: '/doctor' },
  { id: 'AccessDenied', title: 'Staff Portal — access denied', group: 'staff', slug: 'access-denied', path: '/access-denied' },
  { id: 'LabTech', title: 'Lab technician — Rahul Varghese', group: 'staff', slug: 'lab-tech', existingPath: '/lab-tech' },
  { id: 'Nurse', title: 'Nurse — Lekha Pillai, Ward 3', group: 'staff', slug: 'nurse', existingPath: '/nurse' },
  { id: 'Pharmacist', title: 'Pharmacist — Joseph Mathew', group: 'staff', slug: 'pharmacist', existingPath: '/pharmacist' },
  { id: 'RadiologyTech', title: 'Radiology technician — Fathima Beevi', group: 'staff', slug: 'radiology-tech', existingPath: '/radiology-tech' },
  { id: 'StaffActivation', title: 'Staff Portal — account activation', group: 'staff', slug: 'staff-activation', path: '/staff/activate' },
  { id: 'StaffLogin', title: 'Staff Portal — login', group: 'staff', slug: 'staff-login', existingPath: '/login/staff' },
  { id: 'AdminLogin', title: 'Admin Console — login', group: 'admin', slug: 'admin-login', existingPath: '/login/admin' },
  { id: 'CentralAdmin', title: 'Central admin — MoHFW', group: 'admin', slug: 'central-admin', existingPath: '/central-admin' },
  { id: 'DistrictAdmin', title: 'District admin — Pathanamthitta', group: 'admin', slug: 'district-admin', existingPath: '/district-admin' },
  { id: 'HospitalAdmin', title: 'Hospital admin — Dr. Meera Krishnan', group: 'admin', slug: 'hospital-admin', existingPath: '/hospital-admin' },
  { id: 'PharmacyAdmin', title: 'Pharmacy admin — Suma Thomas', group: 'admin', slug: 'pharmacy-admin', existingPath: '/pharmacy-admin' },
  { id: 'RegisterHospitalAdmin', title: 'Admin Console — register hospital admin', group: 'admin', slug: 'register-hospital-admin', existingPath: '/register/hospital-admin' },
  { id: 'RegisterPharmacyAdmin', title: 'Admin Console — register pharmacy admin', group: 'admin', slug: 'register-pharmacy-admin', existingPath: '/register/pharmacy-admin' },
  { id: 'StateAdmin', title: 'State admin — Kerala', group: 'admin', slug: 'state-admin', existingPath: '/state-admin' },
  { id: 'ZonalAdmin', title: 'Zonal admin — South zone', group: 'admin', slug: 'zonal-admin', existingPath: '/zonal-admin' },
]

export function getScreen(id: string): ScreenMeta | undefined {
  return SCREENS.find((s) => s.id === id)
}

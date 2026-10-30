import { Link, useNavigate } from 'react-router-dom'
import { ROLES, ROLE_GROUPS, type RoleConfig } from '../config/roles'
import { useAuth } from '../context/AuthContext'

// Demo-only role switcher. Real login (Keycloak) comes later; see docs/02.

const ROLE_SUBTITLES: Record<string, string> = {
  CITIZEN: 'Anjali Menon · Pathanamthitta',
  DOCTOR: 'Dr. Arun Nair · General medicine',
  NURSE: 'Lekha Pillai · Ward 3',
  LAB_TECH: 'Rahul Varghese · Pathology',
  RADIOLOGY_TECH: 'Fathima Beevi · Imaging',
  PHARMACIST: 'Sreekanth Das · District Hospital',
  PHARMACY_ADMIN: 'Meera Krishnan · District Hospital',
  HOSPITAL_ADMIN: 'Jayaram Pillai · District General Hospital',
  DISTRICT_ADMIN: 'Suresh Kumar · Pathanamthitta',
  STATE_ADMIN: 'Lakshmi Nair · Kerala',
  ZONAL_ADMIN: 'Rajesh Menon · South Zone',
  CENTRAL_ADMIN: 'Priya Sharma · New Delhi',
}

const GROUP_TINTS: Record<string, { bg: string; color: string }> = {
  Citizens: { bg: '#f5e1d8', color: '#8b5a3c' },
  'Medical Staff': { bg: '#d7e9e6', color: '#2d6560' },
  Pharmacy: { bg: '#dfeaf4', color: '#3a6a94' },
  Administrators: { bg: '#eae2f2', color: '#5a4a7c' },
}

function ArrowIcon() {
  return (
    <svg
      className="shrink-0 transition-transform group-hover:translate-x-0.5"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ color: '#586470' }}
    >
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  )
}

export default function RoleSwitcher() {
  const navigate = useNavigate()
  const { login } = useAuth()

  function pick(r: RoleConfig) {
    login(r.role)
    navigate(r.path)
  }

  return (
    <div className="flex flex-1 flex-wrap" style={{ minHeight: 'calc(100vh - 120px)' }}>
      {/* Left panel */}
      <aside
        className="relative flex flex-col gap-7 overflow-hidden p-8 sm:p-12"
        style={{
          flex: '1 1 380px',
          maxWidth: '520px',
          background: 'rgba(250,245,239,.92)',
          borderRight: '1px solid rgba(83,101,120,.13)',
          boxSizing: 'border-box',
        }}
      >
        <span
          aria-hidden="true"
          className="absolute rounded-full"
          style={{
            width: 420,
            height: 420,
            background: '#dcebe0',
            filter: 'blur(80px)',
            left: -160,
            bottom: -160,
          }}
        />
        <div className="relative">
          <Link to="/" className="inline-flex no-underline">
            <span className="text-lg font-semibold tracking-tight" style={{ color: '#3f5263' }}>
              CareFusion<span style={{ color: '#3a726d' }}> AI</span>
            </span>
          </Link>
        </div>
        <div className="relative flex flex-col gap-3.5">
          <p className="text-xs font-semibold uppercase" style={{ letterSpacing: '.1em', color: '#8b7340' }}>
            Alpha demo
          </p>
          <h1
            className="font-serif text-[44px] font-semibold leading-[50px]"
            style={{ color: '#3f5263', letterSpacing: '-0.01em' }}
          >
            Who are you signing in as today?
          </h1>
          <p className="text-[17px] leading-7" style={{ color: '#536170' }}>
            Pick any of the twelve roles to open its workspace with synthetic data. In the real product each role
            signs in on its own page with a password and two-step verification.
          </p>
        </div>
        <div className="relative mt-auto flex flex-col gap-2.5">
          <p className="font-semibold" style={{ color: '#536578' }}>
            Prefer the real sign-in pages?
          </p>
          {[
            { to: '/login', label: 'Citizens and doctors' },
            { to: '/login/staff', label: 'Nurses, lab, radiology, pharmacists' },
            { to: '/login/admin', label: 'Hospital, pharmacy & government admins' },
          ].map((l) => (
            <Link
              key={l.to}
              to={l.to}
              className="flex items-center justify-between gap-3 rounded-lg border px-4 py-2.5 text-sm font-semibold no-underline transition-colors"
              style={{
                borderColor: 'rgba(83,101,120,.22)',
                color: '#536578',
                background: 'rgba(250,245,239,.84)',
              }}
            >
              {l.label}
              <span aria-hidden="true" style={{ color: '#586470' }}>
                →
              </span>
            </Link>
          ))}
        </div>
      </aside>

      {/* Right panel: role cards */}
      <main className="flex flex-col gap-8 p-8 sm:p-12" style={{ flex: '999 1 560px', minWidth: 0, boxSizing: 'border-box' }}>
        <div className="flex max-w-[980px] flex-col gap-8">
          {ROLE_GROUPS.map((group, gi) => {
            const tint = GROUP_TINTS[group] ?? { bg: '#f5e1d8', color: '#8b5a3c' }
            const roles = ROLES.filter((r) => r.group === group)
            return (
              <section
                key={group}
                className="rise"
                style={{ animationDelay: `${gi * 60}ms` }}
                aria-labelledby={`g-${gi}`}
              >
                <h2
                  id={`g-${gi}`}
                  className="mb-3 flex items-center gap-2.5 text-xs font-semibold uppercase"
                  style={{ letterSpacing: '.1em', color: '#586470' }}
                >
                  {group}
                  <span className="h-px flex-1" style={{ background: 'rgba(83,101,120,.13)' }} />
                </h2>
                <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
                  {roles.map((r) => (
                    <button
                      key={r.role}
                      type="button"
                      onClick={() => pick(r)}
                      className="group relative flex items-center gap-3.5 rounded-lg border p-4 text-left transition-all"
                      style={{
                        background: 'rgba(250,245,239,.84)',
                        borderColor: 'rgba(83,101,120,.13)',
                        cursor: 'pointer',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.transform = 'translateY(-2px)'
                        e.currentTarget.style.boxShadow = '0 4px 16px rgba(83,101,120,.10), 0 8px 28px rgba(83,101,120,.05)'
                        e.currentTarget.style.borderColor = 'rgba(58,114,109,.18)'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.transform = ''
                        e.currentTarget.style.boxShadow = ''
                        e.currentTarget.style.borderColor = 'rgba(83,101,120,.13)'
                      }}
                    >
                      <span
                        aria-hidden="true"
                        className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-[14px] font-mono text-[13px] font-medium"
                        style={{
                          background: tint.bg,
                          color: tint.color,
                          letterSpacing: '.06em',
                        }}
                      >
                        {r.badge}
                      </span>
                      <span className="min-w-0 flex-1">
                        <strong className="block text-[16px]" style={{ color: '#536578' }}>
                          {r.label}
                        </strong>
                        <span className="block text-[13px]" style={{ color: '#586470' }}>
                          {ROLE_SUBTITLES[r.role] ?? ''}
                        </span>
                      </span>
                      <ArrowIcon />
                    </button>
                  ))}
                </div>
              </section>
            )
          })}
        </div>
      </main>
    </div>
  )
}

import type { ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import DemoBanner from './DemoBanner'
import CfBackground from './CfBackground'
import type { CfTheme } from './CfBackground'
import { getRoleConfig } from '../config/roles'
import { useAuth } from '../context/AuthContext'

function getTheme(role: string | undefined): CfTheme {
  if (!role) return 'pub'
  if (role === 'CITIZEN') return 'cit'
  if (role === 'DOCTOR') return 'doc'
  if (['NURSE', 'LAB_TECH', 'RADIOLOGY_TECH', 'PHARMACIST'].includes(role)) return 'stf'
  return 'adm'
}

export default function Layout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const currentRole = user ? getRoleConfig(user.role) : null
  const theme = getTheme(user?.role)

  function handleLogout() {
    logout()
    navigate('/')
  }

  return (
    <div className="cf-root flex min-h-screen flex-col">
      <CfBackground theme={theme} />
      <DemoBanner />

      {user && currentRole ? (
        /* --- Authenticated shell: sidebar + breadcrumb bar + content --- */
        <div className="flex flex-1 flex-wrap">
          {/* Sidebar */}
          <aside
            className="sticky top-0 hidden h-screen w-sidebar shrink-0 self-start overflow-y-auto md:block"
            style={{
              background: 'rgba(250,245,239,.92)',
              backdropFilter: 'blur(12px) saturate(1.08)',
              WebkitBackdropFilter: 'blur(12px) saturate(1.08)',
              borderRight: '1px solid rgba(83,101,120,.13)',
            }}
          >
            <div className="flex flex-col gap-2 p-5">
              <Link to="/" className="inline-flex no-underline">
                <span className="text-lg font-semibold tracking-tight" style={{ color: '#3f5263' }}>
                  CareFusion
                  <span style={{ color: '#3a726d' }}> AI</span>
                </span>
              </Link>
              <p className="text-xs" style={{ color: '#586470' }}>
                Unified Medical Affairs Platform
              </p>
            </div>

            <div className="border-t px-3 py-3" style={{ borderColor: 'rgba(83,101,120,.13)' }}>
              <p
                className="px-2 pb-2 text-xs font-semibold uppercase tracking-widest"
                style={{ color: '#586470', letterSpacing: '.1em' }}
              >
                {currentRole.group}
              </p>
              <div
                className="flex items-center gap-3 rounded-lg px-3 py-2.5"
                style={{ background: 'rgba(58,114,109,.18)' }}
              >
                <span
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg font-mono text-xs font-semibold"
                  style={{ background: '#d7e9e6', color: '#2d6560' }}
                >
                  {currentRole.badge}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold" style={{ color: '#3f5263' }}>
                    {currentRole.label}
                  </p>
                  <p className="truncate text-xs" style={{ color: '#586470' }}>
                    {user.displayName}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-1 border-t p-3" style={{ borderColor: 'rgba(83,101,120,.13)' }}>
              <Link
                to="/"
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium no-underline transition-colors hover:opacity-80"
                style={{
                  color: '#536578',
                  background: 'transparent',
                  border: '1px dashed rgba(83,101,120,.22)',
                  borderRadius: '10px',
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 00-3-3.87" /><path d="M16 3.13a4 4 0 010 7.75" /></svg>
                Switch role
              </Link>
              <button
                type="button"
                onClick={handleLogout}
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors"
                style={{
                  color: '#536578',
                  background: 'transparent',
                  border: '1px solid rgba(83,101,120,.13)',
                  borderRadius: '10px',
                  cursor: 'pointer',
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>
                Log out
              </button>
            </div>
          </aside>

          {/* Content area */}
          <div className="flex min-w-0 flex-1 flex-col">
            {/* Mobile header (visible below md) */}
            <div
              className="sticky top-[52px] z-10 flex items-center justify-between gap-3 border-b px-4 py-3 md:hidden"
              style={{
                background: 'rgba(243,238,232,.88)',
                backdropFilter: 'blur(12px)',
                WebkitBackdropFilter: 'blur(12px)',
                borderColor: 'rgba(83,101,120,.13)',
              }}
            >
              <div className="flex items-center gap-2">
                <span
                  className="flex h-8 w-8 items-center justify-center rounded-lg font-mono text-[10px] font-semibold"
                  style={{ background: '#d7e9e6', color: '#2d6560' }}
                >
                  {currentRole.badge}
                </span>
                <span className="text-sm font-semibold" style={{ color: '#3f5263' }}>
                  {currentRole.label}
                </span>
              </div>
              <div className="flex gap-2">
                <Link
                  to="/"
                  className="rounded-lg border px-3 py-1.5 text-xs font-semibold no-underline"
                  style={{ borderColor: 'rgba(83,101,120,.22)', color: '#536578' }}
                >
                  Switch
                </Link>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="rounded-lg border px-3 py-1.5 text-xs font-semibold"
                  style={{ borderColor: 'rgba(83,101,120,.22)', color: '#536578', background: 'transparent', cursor: 'pointer' }}
                >
                  Log out
                </button>
              </div>
            </div>

            {/* Breadcrumb bar */}
            <div
              className="sticky top-0 z-[5] hidden items-center justify-between gap-4 border-b px-10 py-3.5 md:flex"
              style={{
                background: 'rgba(243,238,232,.88)',
                backdropFilter: 'blur(12px)',
                WebkitBackdropFilter: 'blur(12px)',
                borderColor: 'rgba(83,101,120,.13)',
              }}
            >
              <p className="text-[13px]" style={{ color: '#586470' }}>
                {currentRole.label}
                <span aria-hidden="true"> › </span>
                <strong style={{ color: '#536578' }}>Home</strong>
              </p>
            </div>

            <main className="flex-1 px-4 py-8 md:px-10">{children}</main>
          </div>
        </div>
      ) : (
        /* --- Public shell: top nav + content --- */
        <>
          <header
            className="sticky top-[52px] z-10 border-b"
            style={{
              background: 'rgba(243,238,232,.86)',
              backdropFilter: 'blur(14px)',
              WebkitBackdropFilter: 'blur(14px)',
              borderColor: 'rgba(83,101,120,.13)',
            }}
          >
            <div className="mx-auto flex max-w-[1240px] flex-wrap items-center gap-3 px-4 py-3.5 sm:gap-10 sm:px-8">
              <Link to="/" className="inline-flex no-underline">
                <span className="text-lg font-semibold tracking-tight" style={{ color: '#3f5263' }}>
                  CareFusion
                  <span style={{ color: '#3a726d' }}> AI</span>
                </span>
              </Link>
              <div className="ml-auto flex flex-wrap gap-2.5">
                <Link
                  to="/login"
                  className="inline-flex h-10 items-center rounded-lg border px-4 text-sm font-semibold no-underline transition-colors"
                  style={{
                    borderColor: 'rgba(83,101,120,.22)',
                    color: '#536578',
                    background: 'rgba(250,245,239,.84)',
                  }}
                >
                  Log in
                </Link>
                <Link
                  to="/register"
                  className="inline-flex h-10 items-center rounded-lg px-4 text-sm font-semibold no-underline transition-colors"
                  style={{
                    background: '#3a726d',
                    color: '#faf5ef',
                  }}
                >
                  Create account
                </Link>
              </div>
            </div>
          </header>

          <main className="flex-1 px-4 py-8 sm:px-8">{children}</main>

          <footer
            className="border-t px-4 py-4 text-center text-xs sm:px-8"
            style={{ borderColor: 'rgba(83,101,120,.13)', color: '#586470' }}
          >
            Alpha demo on synthetic data. All AI outputs are simulated AI output (decision support only).
          </footer>
        </>
      )}
    </div>
  )
}

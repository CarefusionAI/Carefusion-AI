import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import DemoBanner from './DemoBanner'
import CfBackground from './CfBackground'
import AppShell from './AppShell'
import { useAuth } from '../context/AuthContext'

/**
 * Signed-in demo users get the role AppShell (sidebar, top bar, drawer, bottom nav).
 * Everyone else gets the public shell: top nav, content, footer.
 */
export default function Layout({ children }: { children: ReactNode }) {
  const { user } = useAuth()

  if (user) return <AppShell>{children}</AppShell>

  return (
    <div className="cf-root flex min-h-screen flex-col">
      <CfBackground theme="pub" />
      <DemoBanner />
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
    </div>
  )
}

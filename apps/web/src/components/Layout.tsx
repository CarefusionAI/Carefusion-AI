import type { ReactNode } from 'react'
import { NavLink, Link } from 'react-router-dom'
import DemoBanner from './DemoBanner'
import { ROLES, ROLE_GROUPS } from '../config/roles'

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-primary-50 text-primary-900">
      <DemoBanner />

      <header className="border-b-4 border-accent bg-primary text-primary-foreground">
        <div className="flex items-center gap-3 px-4 py-3">
          <span
            aria-hidden="true"
            className="flex h-9 w-9 items-center justify-center rounded bg-accent text-sm font-bold text-accent-foreground"
          >
            CF
          </span>
          <Link to="/" className="!text-white no-underline">
            <span className="block text-lg font-bold leading-tight">CareFusion AI</span>
            <span className="block text-xs text-primary-100">
              Unified Medical Affairs Platform (alpha demo)
            </span>
          </Link>
        </div>
      </header>

      <div className="flex flex-1 flex-col md:flex-row">
        <nav
          aria-label="Demo roles"
          className="border-b border-primary-200 bg-white md:w-60 md:shrink-0 md:border-b-0 md:border-r"
        >
          <div className="px-4 py-3">
            <Link to="/" className="text-sm font-semibold text-primary underline">
              Role selector
            </Link>
          </div>
          <div className="hidden pb-4 md:block">
            {ROLE_GROUPS.map((group) => (
              <div key={group} className="px-2 pt-2">
                <p className="px-2 text-xs font-semibold uppercase tracking-wide text-primary-500">
                  {group}
                </p>
                <ul className="mt-1">
                  {ROLES.filter((r) => r.group === group).map((r) => (
                    <li key={r.role}>
                      <NavLink
                        to={r.path}
                        className={({ isActive }) =>
                          `block rounded px-2 py-1.5 text-sm no-underline ${
                            isActive
                              ? 'bg-primary font-semibold !text-white'
                              : 'text-primary-700 hover:bg-primary-50'
                          }`
                        }
                      >
                        {r.label}
                      </NavLink>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </nav>

        <main className="flex-1 px-4 py-8 md:px-8">{children}</main>
      </div>

      <footer className="border-t border-primary-200 bg-white px-4 py-3 text-xs text-primary-500">
        Alpha demo on synthetic data. All AI outputs are simulated AI output (decision support only).
      </footer>
    </div>
  )
}

import { Link } from 'react-router-dom'
import type { Role } from '@carefusion/shared'
import { getRoleConfig } from '../config/roles'

// Shared body for the empty role pages so they all look the same.
export default function RolePage({ role }: { role: Role }) {
  const cfg = getRoleConfig(role)
  return (
    <div className="mx-auto max-w-3xl">
      <Link to="/" className="text-sm font-medium underline">
        &larr; Back to role selector
      </Link>

      <div className="mt-6 rounded-lg border border-primary-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-4">
          <span
            aria-hidden="true"
            className="flex h-14 w-14 items-center justify-center rounded-lg bg-primary text-sm font-bold tracking-wider text-white"
          >
            {cfg.badge}
          </span>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-accent-600">
              {cfg.group}
            </p>
            <h1 className="text-2xl font-bold text-primary">{cfg.title}</h1>
          </div>
        </div>

        <div className="mt-6 rounded-md border border-accent-200 bg-accent-50 px-4 py-3 text-accent-600">
          <p className="font-semibold">{cfg.comingSoon ?? "Coming soon"}</p>
          <p className="mt-1 text-sm">
            This page is a placeholder. Screens for this role will be built following docs/13.
          </p>
        </div>
      </div>
    </div>
  )
}

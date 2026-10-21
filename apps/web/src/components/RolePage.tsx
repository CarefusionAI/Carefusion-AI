import { Link } from 'react-router-dom'
import type { Role } from '@carefusion/shared'
import { getRoleConfig } from '../config/roles'

// Shared body for the empty role pages so they all look the same.

const GROUP_TINTS: Record<string, { bg: string; color: string }> = {
  Citizens: { bg: '#f5e1d8', color: '#8b5a3c' },
  'Medical Staff': { bg: '#d7e9e6', color: '#2d6560' },
  Pharmacy: { bg: '#dfeaf4', color: '#3a6a94' },
  Administrators: { bg: '#eae2f2', color: '#5a4a7c' },
}

export default function RolePage({ role }: { role: Role }) {
  const cfg = getRoleConfig(role)
  const tint = GROUP_TINTS[cfg.group] ?? { bg: '#f5e1d8', color: '#8b5a3c' }

  return (
    <div className="mx-auto max-w-3xl">
      <Link to="/" className="text-sm font-medium underline" style={{ color: '#2d6560' }}>
        &larr; Back to role selector
      </Link>

      <div
        className="cf-card mt-6 rounded-xl border p-6"
        style={{
          background: 'rgba(250,245,239,.92)',
          borderColor: 'rgba(83,101,120,.13)',
          boxShadow: '0 1px 3px rgba(83,101,120,.06), 0 4px 14px rgba(83,101,120,.04)',
        }}
      >
        <div className="flex items-center gap-4">
          <span
            aria-hidden="true"
            className="flex h-14 w-14 items-center justify-center rounded-xl font-mono text-sm font-semibold"
            style={{ background: tint.bg, color: tint.color, letterSpacing: '.06em' }}
          >
            {cfg.badge}
          </span>
          <div>
            <p className="text-xs font-semibold uppercase" style={{ letterSpacing: '.1em', color: '#8b7340' }}>
              {cfg.group}
            </p>
            <h1 className="font-serif text-2xl font-semibold" style={{ color: '#3f5263' }}>
              {cfg.title}
            </h1>
          </div>
        </div>

        <div
          className="mt-6 rounded-lg border px-4 py-3"
          style={{
            borderColor: 'rgba(198,145,58,.25)',
            background: 'rgba(198,145,58,.12)',
            color: '#8b6a2f',
          }}
        >
          <p className="font-semibold">{cfg.comingSoon ?? 'Coming soon'}</p>
          <p className="mt-1 text-sm">
            This page is a placeholder. Screens for this role will be built following docs/13.
          </p>
        </div>
      </div>
    </div>
  )
}

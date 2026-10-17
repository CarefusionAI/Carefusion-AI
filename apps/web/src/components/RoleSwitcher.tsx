import { useNavigate } from 'react-router-dom'
import { ROLES, ROLE_GROUPS } from '../config/roles'
import { useAuth } from '../context/AuthContext'

// Demo-only role switcher. Real login (Keycloak) comes later; see docs/02.
export default function RoleSwitcher() {
  const navigate = useNavigate()
  const { login } = useAuth()

  return (
    <section
      aria-labelledby="role-switcher-title"
      className="mx-auto max-w-3xl rounded-lg border border-primary-200 bg-white shadow-sm"
    >
      <div className="rounded-t-lg border-b-4 border-accent bg-primary px-6 py-4 text-white">
        <h1 id="role-switcher-title" className="text-xl font-bold">
          Demo role switcher
        </h1>
        <p className="mt-1 text-sm text-primary-100">
          Choose a role to log in as its demo user and open its dashboard. Demo use only; no password is needed in this alpha.
        </p>
      </div>

      <div className="space-y-6 p-6">
        {ROLE_GROUPS.map((group) => (
          <div key={group}>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-accent-600">
              {group}
            </h2>
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {ROLES.filter((r) => r.group === group).map((r) => (
                <button
                  key={r.role}
                  type="button"
                  onClick={() => {
                    login(r.role)
                    navigate(r.path)
                  }}
                  className="flex items-center gap-3 rounded-md border border-primary-200 bg-primary-50 px-3 py-2 text-left text-sm font-medium text-primary transition hover:border-accent hover:bg-accent-50"
                >
                  <span
                    aria-hidden="true"
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-primary text-[10px] font-bold tracking-wider text-white"
                  >
                    {r.badge}
                  </span>
                  {r.label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

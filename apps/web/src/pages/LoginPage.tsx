import { useState } from 'react'
import { CredentialsForm, LoginCard, LoginPageLinks } from '../components/LoginCard'

type Tab = 'user' | 'doctor'

const TABS: { key: Tab; label: string }[] = [
  { key: 'user', label: 'User' },
  { key: 'doctor', label: 'Doctor' },
]

// Main login page (docs/02): User / Doctor switch. Visual only in the alpha.
export default function LoginPage() {
  const [tab, setTab] = useState<Tab>('user')

  return (
    <LoginCard
      title="Log in"
      subtitle={
        tab === 'user'
          ? 'Citizens log in with phone number or email and password.'
          : 'Doctors log in with username and password.'
      }
    >
      <div role="tablist" aria-label="Account type" className="grid grid-cols-2 rounded-md bg-primary-50 p-1">
        {TABS.map((t) => {
          const active = tab === t.key
          return (
            <button
              key={t.key}
              type="button"
              role="tab"
              id={`login-tab-${t.key}`}
              aria-selected={active}
              aria-controls="login-panel"
              onClick={() => setTab(t.key)}
              className={`rounded px-3 py-1.5 text-sm font-semibold transition ${
                active ? 'bg-primary text-white shadow-sm' : 'text-primary-700 hover:bg-primary-100'
              }`}
            >
              {t.label}
            </button>
          )
        })}
      </div>

      <div id="login-panel" role="tabpanel" aria-labelledby={`login-tab-${tab}`}>
        {tab === 'user' ? (
          <CredentialsForm
            key="user"
            identifierLabel="Phone number or email"
            identifierPlaceholder="Phone or email"
            registerLabel="Create new user"
            registerHref="/register"
          />
        ) : (
          <div className="space-y-4">
            <CredentialsForm
              key="doctor"
              identifierLabel="Username"
              identifierPlaceholder="Doctor username"
              registerLabel="Register as a doctor"
            />
            <p className="text-xs text-primary-500">
              Doctor accounts also need a second step (MFA) in the full system.
            </p>
          </div>
        )}
      </div>

      <LoginPageLinks current="main" />
    </LoginCard>
  )
}

import { useId, useState, type FormEvent, type ReactNode } from 'react'
import { Link } from 'react-router-dom'

// Shared building blocks for the three login pages. Forms are visual only in the alpha.

export function LoginCard({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle: string
  children: ReactNode
}) {
  return (
    <div className="mx-auto w-full max-w-md">
      <div
        className="cf-card overflow-hidden rounded-xl border"
        style={{
          background: 'rgba(250,245,239,.92)',
          borderColor: 'rgba(83,101,120,.13)',
          boxShadow: '0 1px 3px rgba(83,101,120,.06), 0 4px 14px rgba(83,101,120,.04)',
        }}
      >
        <div className="px-6 pb-4 pt-6">
          <Link to="/" className="inline-flex no-underline">
            <span className="text-lg font-semibold tracking-tight" style={{ color: '#3f5263' }}>
              CareFusion<span style={{ color: '#3a726d' }}> AI</span>
            </span>
          </Link>
          <h1 className="mt-4 font-serif text-2xl font-semibold" style={{ color: '#3f5263' }}>
            {title}
          </h1>
          <p className="mt-1 text-sm" style={{ color: '#586470' }}>
            {subtitle}
          </p>
        </div>
        <div className="space-y-5 px-6 pb-6">{children}</div>
      </div>
    </div>
  )
}

export function TextField({
  label,
  type = 'text',
  autoComplete,
  placeholder,
}: {
  label: string
  type?: string
  autoComplete?: string
  placeholder?: string
}) {
  const id = useId()
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium" style={{ color: '#3f5263' }}>
        {label}
      </label>
      <input
        id={id}
        type={type}
        autoComplete={autoComplete}
        placeholder={placeholder}
        className="mt-1 block w-full rounded-md border px-3 py-2 text-sm transition-colors focus:outline-none"
        style={{
          borderColor: 'rgba(83,101,120,.22)',
          background: '#fff',
          color: '#3f5263',
        }}
        onFocus={(e) => {
          e.currentTarget.style.borderColor = '#3a726d'
        }}
        onBlur={(e) => {
          e.currentTarget.style.borderColor = 'rgba(83,101,120,.22)'
        }}
      />
    </div>
  )
}

export function SelectField({ label, options }: { label: string; options: string[] }) {
  const id = useId()
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium" style={{ color: '#3f5263' }}>
        {label}
      </label>
      <select
        id={id}
        defaultValue={options[0]}
        className="mt-1 block w-full rounded-md border px-3 py-2 text-sm focus:outline-none"
        style={{
          borderColor: 'rgba(83,101,120,.22)',
          background: '#fff',
          color: '#3f5263',
        }}
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </div>
  )
}

/** A link that is not active yet. Rendered as a disabled control so it is not focusable. */
export function DisabledLink({ children, hint }: { children: ReactNode; hint?: string }) {
  return (
    <span
      aria-disabled="true"
      title={hint ?? 'Not available in the alpha demo'}
      className="cursor-not-allowed text-sm underline decoration-dotted"
      style={{ color: 'rgba(83,101,120,.35)' }}
    >
      {children}
    </span>
  )
}

/**
 * Username + password form. Visual only: submitting shows a note instead of authenticating.
 */
export function CredentialsForm({
  identifierLabel,
  identifierPlaceholder,
  identifierAutoComplete = 'username',
  extraFields,
  registerLabel,
  registerHref,
}: {
  identifierLabel: string
  identifierPlaceholder?: string
  identifierAutoComplete?: string
  extraFields?: ReactNode
  /** Disabled registration link text. Omit to hide it. */
  registerLabel?: string
  /** If set, the registration label becomes a real link to this path. */
  registerHref?: string
}) {
  const [submitted, setSubmitted] = useState(false)

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    setSubmitted(true)
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {extraFields}
      <TextField
        label={identifierLabel}
        placeholder={identifierPlaceholder}
        autoComplete={identifierAutoComplete}
      />
      <TextField label="Password" type="password" autoComplete="current-password" />

      <button
        type="submit"
        className="w-full rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors"
        style={{ background: '#3a726d', color: '#faf5ef' }}
      >
        Log in
      </button>

      {submitted && (
        <p
          role="status"
          className="rounded-lg border px-3 py-2 text-sm"
          style={{
            borderColor: 'rgba(198,145,58,.25)',
            background: 'rgba(198,145,58,.12)',
            color: '#8b6a2f',
          }}
        >
          Real login is not switched on in this alpha. Use the{' '}
          <Link to="/" className="font-semibold underline" style={{ color: '#8b7340' }}>
            demo role switcher
          </Link>{' '}
          to open a dashboard.
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <DisabledLink>Forgot password?</DisabledLink>
        {registerLabel && registerHref && (
          <Link to={registerHref} className="text-sm font-medium underline" style={{ color: '#2d6560' }}>
            {registerLabel}
          </Link>
        )}
        {registerLabel && !registerHref && <DisabledLink>{registerLabel}</DisabledLink>}
      </div>
    </form>
  )
}

/** Small row of links between the three login pages. */
export function LoginPageLinks({ current }: { current: 'main' | 'staff' | 'admin' }) {
  const links = [
    { key: 'main', to: '/login', label: 'User / Doctor login' },
    { key: 'staff', to: '/login/staff', label: 'Staff login' },
    { key: 'admin', to: '/login/admin', label: 'Admin login' },
  ] as const
  return (
    <nav aria-label="Other login pages" className="border-t pt-4" style={{ borderColor: 'rgba(83,101,120,.13)' }}>
      <p className="text-xs font-semibold uppercase" style={{ letterSpacing: '.1em', color: '#586470' }}>
        Other login pages
      </p>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
        {links
          .filter((l) => l.key !== current)
          .map((l) => (
            <li key={l.key}>
              <Link to={l.to} className="font-medium underline" style={{ color: '#2d6560' }}>
                {l.label}
              </Link>
            </li>
          ))}
      </ul>
    </nav>
  )
}

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
      <div className="rounded-lg border border-primary-200 bg-white shadow-sm">
        <div className="rounded-t-lg border-b-4 border-accent bg-primary px-6 py-5 text-white">
          <div className="flex items-center gap-3">
            <span
              aria-hidden="true"
              className="flex h-10 w-10 items-center justify-center rounded bg-accent text-sm font-bold text-accent-foreground"
            >
              CF
            </span>
            <div>
              <p className="text-lg font-bold leading-tight">CareFusion AI</p>
              <p className="text-xs text-primary-100">Unified Medical Affairs Platform</p>
            </div>
          </div>
          <h1 className="mt-4 text-xl font-bold">{title}</h1>
          <p className="mt-1 text-sm text-primary-100">{subtitle}</p>
        </div>
        <div className="space-y-5 p-6">{children}</div>
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
      <label htmlFor={id} className="block text-sm font-medium text-primary-800">
        {label}
      </label>
      <input
        id={id}
        type={type}
        autoComplete={autoComplete}
        placeholder={placeholder}
        className="mt-1 block w-full rounded-md border border-primary-200 bg-white px-3 py-2 text-sm text-primary-900 placeholder:text-primary-300 focus:border-primary focus:outline-none"
      />
    </div>
  )
}

export function SelectField({ label, options }: { label: string; options: string[] }) {
  const id = useId()
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-primary-800">
        {label}
      </label>
      <select
        id={id}
        defaultValue={options[0]}
        className="mt-1 block w-full rounded-md border border-primary-200 bg-white px-3 py-2 text-sm text-primary-900 focus:border-primary focus:outline-none"
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
      className="cursor-not-allowed text-sm text-primary-300 underline decoration-dotted"
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
        className="w-full rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white transition hover:bg-primary-700"
      >
        Log in
      </button>

      {submitted && (
        <p
          role="status"
          className="rounded-md border border-accent-200 bg-accent-50 px-3 py-2 text-sm text-accent-600"
        >
          Real login is not switched on in this alpha. Use the{' '}
          <Link to="/" className="font-semibold underline">
            demo role switcher
          </Link>{' '}
          to open a dashboard.
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <DisabledLink>Forgot password?</DisabledLink>
        {registerLabel && registerHref && (
          <Link to={registerHref} className="text-sm font-medium text-primary-500 hover:text-primary-700 underline">
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
    <nav aria-label="Other login pages" className="border-t border-primary-100 pt-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-primary-500">
        Other login pages
      </p>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
        {links
          .filter((l) => l.key !== current)
          .map((l) => (
            <li key={l.key}>
              <Link to={l.to} className="font-medium underline">
                {l.label}
              </Link>
            </li>
          ))}
      </ul>
    </nav>
  )
}
